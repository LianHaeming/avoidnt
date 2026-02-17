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

	"github.com/LianHaeming/avoidnt/models"
)

// --- Request types ---

// LabelExercisesRequest is the JSON body for POST /api/label-exercises.
type LabelExercisesRequest struct {
	SongTitle  string               `json:"songTitle"`
	Artist     string               `json:"artist"`
	PageImages []string             `json:"pageImages"` // data URLs
	JobID      string               `json:"jobId"`      // alternative to pageImages
	PageCount  int                  `json:"pageCount"`  // alternative to pageImages
	Sections   []LabelSection       `json:"sections"`
	Exercises  []LabelExerciseInput `json:"exercises"`
}

// LabelSection describes a section in the current song structure.
type LabelSection struct {
	ID    string `json:"id"`
	Type  string `json:"type"`
	Order int    `json:"order"`
}

// LabelExerciseInput describes an exercise to be labeled.
type LabelExerciseInput struct {
	ID                string      `json:"id"`
	Crops             []LabelCrop `json:"crops"`
	CurrentName       string      `json:"currentName"`
	CurrentSectionID  string      `json:"currentSectionId"`
	CurrentDifficulty int         `json:"currentDifficulty"`
}

// LabelCrop describes a crop region within a page.
type LabelCrop struct {
	PageIndex int         `json:"pageIndex"`
	Rect      models.Rect `json:"rect"`
}

// --- Response types ---

// LabelExercisesResponse is returned from POST /api/label-exercises.
type LabelExercisesResponse struct {
	Exercises         []LabelExerciseResult `json:"exercises"`
	SuggestedSections []string              `json:"suggestedSections"`
}

// LabelExerciseResult is a single exercise label result from the AI.
type LabelExerciseResult struct {
	ID         string  `json:"id"`
	Name       *string `json:"name"`       // nil = don't change
	SectionID  *string `json:"sectionId"`  // nil = don't change
	Confidence string  `json:"confidence"` // "high", "medium", "low"
}

// HandleLabelExercises uses OpenAI vision to label exercises with names and section assignments.
func (d *Deps) HandleLabelExercises(w http.ResponseWriter, r *http.Request) {
	if d.OpenAIKey == "" {
		jsonError(w, "OpenAI API key not configured", http.StatusServiceUnavailable)
		return
	}

	var req LabelExercisesRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if len(req.Exercises) == 0 {
		jsonError(w, "No exercises to label", http.StatusBadRequest)
		return
	}

	// Load page images: from request body or from disk via jobId
	var pageImages []string
	if req.JobID != "" && req.PageCount > 0 {
		imgs, err := d.loadJobPageImagesForLabeling(req.JobID, req.PageCount)
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

	// Cap at 10 pages
	if len(pageImages) > 10 {
		pageImages = pageImages[:10]
	}

	result, err := d.callLabelExercisesAI(pageImages, req)
	if err != nil {
		log.Printf("OpenAI label-exercises failed: %v", err)
		jsonError(w, "Analysis failed: "+err.Error(), http.StatusBadGateway)
		return
	}

	jsonOK(w, result)
}

// loadJobPageImagesForLabeling loads up to 10 page images from disk.
func (d *Deps) loadJobPageImagesForLabeling(jobID string, pageCount int) ([]string, error) {
	limit := pageCount
	if limit > 10 {
		limit = 10
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

// callLabelExercisesAI calls OpenAI GPT-4o to label exercises.
func (d *Deps) callLabelExercisesAI(pageImages []string, req LabelExercisesRequest) (*LabelExercisesResponse, error) {
	systemPrompt := `You are a sheet music analysis assistant. You will receive:
1. Images of sheet music pages (numbered Page 1, Page 2, etc.)
2. A list of cropped regions from those pages, each defined by page index and normalized coordinates (x, y, w, h where 0-1 represents the full page dimensions)
3. The song's current section structure (e.g., Intro, Verse, Chorus)
4. The song title and artist (if known)

Your task is to identify what each cropped region contains and assign it to the correct song section.

RULES:
- For each exercise, determine what part of the song it corresponds to based on its position in the sheet music.
- Look for section markers in the sheet music (text labels like "Verse", "Chorus", "Bridge", rehearsal marks like A, B, C, or double barlines that indicate section boundaries).
- Generate a short, useful name for each exercise. Prefer bar numbers if visible (e.g., "Bars 1-4"). If bar numbers aren't visible, describe the content briefly (e.g., "Opening melody", "Main riff"). Keep names under 40 characters.
- ONLY assign a sectionId if you are reasonably confident. If unsure, set sectionId to null.
- If a crop spans two consecutive pages, it means the musical content continues from the bottom of one page to the top of the next. Treat it as a single continuous passage.
- Some sheet music has "variations" or "alternatives" at the bottom (e.g., "Intro variation 1", "Verse alt ending"). These are practice variations, NOT part of the main song flow. If a crop covers a variation section, set its name to include "Variation:" prefix (e.g., "Variation: Intro alt ending") and set sectionId to null.
- Do NOT fill in fields that already have values (if currentName is non-empty, don't return a name for that exercise).
- Set confidence to "high" when section markers are clearly visible near the crop, "medium" when you're inferring from position/context, and "low" when you're guessing.
- If you notice section labels in the sheet music that aren't in the provided sections list, include them in suggestedSections.

Respond with ONLY a JSON object (no markdown fences) in this exact format:
{
  "exercises": [
    {
      "id": "exercise-id-here",
      "name": "Short description" or null,
      "sectionId": "section-id-here" or null,
      "confidence": "high" or "medium" or "low"
    }
  ],
  "suggestedSections": ["bridge", "outro"]
}`

	// Build the user message text
	var userText strings.Builder
	if req.SongTitle != "" || req.Artist != "" {
		userText.WriteString(fmt.Sprintf("Song: \"%s\" by \"%s\"\n\n", req.SongTitle, req.Artist))
	}

	// Sections
	if len(req.Sections) > 0 {
		userText.WriteString("Current sections:\n")
		for _, sec := range req.Sections {
			userText.WriteString(fmt.Sprintf("- %s: %s (position %d)\n", sec.ID, sec.Type, sec.Order))
		}
		userText.WriteString("\n")
	} else {
		userText.WriteString("Current sections: (none defined yet)\n\n")
	}

	// Exercises
	userText.WriteString("Exercises to label:\n")
	for _, ex := range req.Exercises {
		userText.WriteString(fmt.Sprintf("- Exercise %s:\n", ex.ID))

		// Crops
		userText.WriteString("    Crops: ")
		for i, crop := range ex.Crops {
			if i > 0 {
				userText.WriteString(", ")
			}
			userText.WriteString(fmt.Sprintf("[page %d: x=%.2f, y=%.2f, w=%.2f, h=%.2f]",
				crop.PageIndex, crop.Rect.X, crop.Rect.Y, crop.Rect.W, crop.Rect.H))
		}
		userText.WriteString("\n")

		// Current values
		name := ex.CurrentName
		if name == "" {
			name = "(empty)"
		}
		userText.WriteString(fmt.Sprintf("    Current name: %s\n", name))

		section := ex.CurrentSectionID
		if section == "" {
			section = "(unassigned)"
		}
		userText.WriteString(fmt.Sprintf("    Current section: %s\n", section))
	}

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

	// Build user content array: text first, then images
	userContent := []map[string]any{
		{"type": "text", "text": userText.String()},
	}
	userContent = append(userContent, imageContent...)

	body := map[string]any{
		"model":       "gpt-4o",
		"max_tokens":  2000,
		"temperature": 0.2,
		"messages": []map[string]any{
			{"role": "system", "content": systemPrompt},
			{"role": "user", "content": userContent},
		},
	}

	bodyJSON, _ := json.Marshal(body)

	httpReq, err := http.NewRequest("POST", "https://api.openai.com/v1/chat/completions", bytes.NewReader(bodyJSON))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+d.OpenAIKey)

	resp, err := http.DefaultClient.Do(httpReq)
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
	jsonStr = strings.TrimSuffix(jsonStr, "```")
	jsonStr = strings.TrimSpace(jsonStr)

	var parsed LabelExercisesResponse
	if err := json.Unmarshal([]byte(jsonStr), &parsed); err != nil {
		return nil, fmt.Errorf("AI returned invalid JSON: %s", raw)
	}

	if parsed.Exercises == nil {
		parsed.Exercises = []LabelExerciseResult{}
	}
	if parsed.SuggestedSections == nil {
		parsed.SuggestedSections = []string{}
	}

	// Validate confidence values
	for i := range parsed.Exercises {
		c := parsed.Exercises[i].Confidence
		if c != "high" && c != "medium" && c != "low" {
			parsed.Exercises[i].Confidence = "low"
		}
	}

	return &parsed, nil
}
