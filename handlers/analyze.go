package handlers

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// AnalyzeRequest is the JSON body for POST /api/analyze-pdf.
type AnalyzeRequest struct {
	PageImages []string `json:"pageImages"`
	JobID      string   `json:"jobId,omitempty"`
	PageCount  int      `json:"pageCount,omitempty"`
}

// AnalyzeResponse contains extracted song metadata.
type AnalyzeResponse struct {
	Title    *string  `json:"title"`
	Artist   *string  `json:"artist"`
	Tempo    *int     `json:"tempo"`
	Sections []string `json:"sections"`
}

// HandleAnalyzePDF uses OpenAI vision to extract song metadata from page images.
func (d *Deps) HandleAnalyzePDF(w http.ResponseWriter, r *http.Request) {
	if d.OpenAIKey == "" {
		jsonError(w, "OpenAI API key not configured", http.StatusServiceUnavailable)
		return
	}

	var req AnalyzeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// If jobId is provided, load images from disk instead
	var pageImages []string
	if req.JobID != "" && req.PageCount > 0 {
		imgs, err := d.loadJobPageImages(req.JobID, req.PageCount)
		if err != nil {
			jsonError(w, err.Error(), http.StatusNotFound)
			return
		}
		pageImages = imgs
	} else {
		pageImages = req.PageImages
	}

	if len(pageImages) == 0 {
		jsonError(w, "No page images provided", http.StatusBadRequest)
		return
	}

	// Limit to 4 pages
	if len(pageImages) > 4 {
		pageImages = pageImages[:4]
	}

	result, err := d.callOpenAIVision(pageImages)
	if err != nil {
		log.Printf("OpenAI analysis failed: %v", err)
		jsonError(w, "Analysis failed: "+err.Error(), http.StatusBadGateway)
		return
	}

	jsonOK(w, result)
}

func (d *Deps) loadJobPageImages(jobID string, pageCount int) ([]string, error) {
	limit := pageCount
	if limit > 4 {
		limit = 4
	}

	var images []string
	for i := 1; i <= limit; i++ {
		pagePath, err := d.Jobs.GetPagePath(jobID, i)
		if err != nil {
			continue
		}
		data, err := os.ReadFile(pagePath)
		if err != nil {
			continue
		}
		b64 := base64.StdEncoding.EncodeToString(data)
		ext := strings.ToLower(filepath.Ext(pagePath))
		mime := "image/jpeg"
		if ext == ".png" {
			mime = "image/png"
		}
		images = append(images, fmt.Sprintf("data:%s;base64,%s", mime, b64))
	}

	if len(images) == 0 {
		return nil, fmt.Errorf("no page images found for job: %s", jobID)
	}
	return images, nil
}

func (d *Deps) callOpenAIVision(pageImages []string) (*AnalyzeResponse, error) {
	systemPrompt := `You are a music sheet analyzer. You will be given images of sheet music / guitar tablature pages. Extract the following metadata from the sheet music if visible:

1. **title** – The song title
2. **artist** – The artist / composer / band name
3. **tempo** – The tempo in BPM (as a number).
4. **sections** – A list of the song's structural sections visible in the sheet music (e.g., Intro, Verse, Chorus, Bridge, Solo, Outro).

IMPORTANT for sections:
- Only include sections that are part of the actual song structure / arrangement.
- Do NOT include "variations", "alternatives", "practice exercises", or "ossia" bars that often appear at the bottom of a page or at the end of the sheet. These are supplementary practice material, not song sections.
- Look for clear section labels, rehearsal marks, or double barlines that indicate structural divisions.
- If the same section type appears multiple times (e.g., Verse 1, Verse 2), just include the base name once (e.g., "Verse").

Return ONLY valid JSON in this exact format:
{
  "title": "Song Title" or null,
  "artist": "Artist Name" or null,
  "tempo": 120 or null,
  "sections": ["Intro", "Verse", "Chorus"]
}

If a field is not visible or cannot be determined, use null (or empty array for sections).
Do not guess — only extract what is clearly visible in the sheet music.`

	// Build image content
	var imageContent []map[string]any
	for _, dataURL := range pageImages {
		if !strings.HasPrefix(dataURL, "data:") {
			dataURL = "data:image/jpeg;base64," + dataURL
		}
		imageContent = append(imageContent, map[string]any{
			"type": "image_url",
			"image_url": map[string]any{
				"url":    dataURL,
				"detail": "low",
			},
		})
	}

	userContent := []map[string]any{
		{"type": "text", "text": "Analyze these sheet music pages and extract the song metadata."},
	}
	userContent = append(userContent, imageContent...)

	body := map[string]any{
		"model":       "gpt-4o",
		"max_tokens":  500,
		"temperature": 0,
		"messages": []map[string]any{
			{"role": "system", "content": systemPrompt},
			{"role": "user", "content": userContent},
		},
	}

	bodyJSON, _ := json.Marshal(body)

	req, err := http.NewRequest("POST", "https://api.openai.com/v1/chat/completions", bytes.NewReader(bodyJSON))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+d.OpenAIKey)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("OpenAI request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("OpenAI returned %d: %s", resp.StatusCode, string(respBody))
	}

	var openAIResp struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}

	if err := json.Unmarshal(respBody, &openAIResp); err != nil {
		return nil, fmt.Errorf("failed to parse OpenAI response: %w", err)
	}

	if len(openAIResp.Choices) == 0 {
		return nil, fmt.Errorf("OpenAI returned no choices")
	}

	raw := strings.TrimSpace(openAIResp.Choices[0].Message.Content)

	// Strip markdown code fences if present
	jsonStr := raw
	if strings.HasPrefix(jsonStr, "```") {
		if idx := strings.Index(jsonStr, "\n"); idx >= 0 {
			jsonStr = jsonStr[idx+1:]
		}
	}
	if strings.HasSuffix(jsonStr, "```") {
		jsonStr = jsonStr[:len(jsonStr)-3]
	}
	jsonStr = strings.TrimSpace(jsonStr)

	var parsed AnalyzeResponse
	if err := json.Unmarshal([]byte(jsonStr), &parsed); err != nil {
		return nil, fmt.Errorf("AI returned invalid JSON: %s", raw)
	}

	if parsed.Sections == nil {
		parsed.Sections = []string{}
	}

	return &parsed, nil
}
