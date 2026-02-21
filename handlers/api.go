package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/LianHaeming/avoidnt/models"
)

// HandleSaveSong creates or updates a song (JSON body).
func (d *Deps) HandleSaveSong(w http.ResponseWriter, r *http.Request) {
	var song models.Song
	if err := json.NewDecoder(r.Body).Decode(&song); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if song.ID == "" || song.Title == "" {
		jsonError(w, "Missing required fields (id, title)", http.StatusBadRequest)
		return
	}

	// Preserve practice data from existing song
	existing, _ := d.Songs.Get(song.ID)
	if existing != nil {
		// Preserve display settings
		if song.CropBgColor == nil && existing.CropBgColor != nil {
			song.CropBgColor = existing.CropBgColor
		}
		existingExMap := map[string]*models.Exercise{}
		for i := range existing.Exercises {
			existingExMap[existing.Exercises[i].ID] = &existing.Exercises[i]
		}
		for i := range song.Exercises {
			ex := &song.Exercises[i]
			if old, ok := existingExMap[ex.ID]; ok {
				ex.Stage = old.Stage
				ex.TotalPracticedSeconds = old.TotalPracticedSeconds
				ex.TotalReps = old.TotalReps
				ex.LastPracticedAt = old.LastPracticedAt
				if ex.CropScale == nil && old.CropScale != nil {
					ex.CropScale = old.CropScale
				}
			}
		}
	}

	if err := d.Songs.Save(&song); err != nil {
		jsonError(w, "Failed to save song: "+err.Error(), http.StatusInternalServerError)
		return
	}

	jsonOK(w, map[string]any{"success": true, "songId": song.ID})
}

// HandleDeleteSong deletes a song.
func (d *Deps) HandleDeleteSong(w http.ResponseWriter, r *http.Request) {
	songID := r.PathValue("songId")

	if err := d.Songs.Delete(songID); err != nil {
		if strings.Contains(err.Error(), "not found") {
			jsonError(w, "Song not found", http.StatusNotFound)
		} else {
			jsonError(w, "Failed to delete", http.StatusInternalServerError)
		}
		return
	}

	jsonOK(w, map[string]any{"success": true})
}

// PatchExerciseRequest is the JSON body for PATCH exercise.
type PatchExerciseRequest struct {
	Stage                 *int     `json:"stage"`
	TotalPracticedSeconds *int     `json:"totalPracticedSeconds"`
	TotalReps             *int     `json:"totalReps"`
	LastPracticedAt       *string  `json:"lastPracticedAt"`
	CropScale             *float64 `json:"cropScale"`
	CropAlign             *string  `json:"cropAlign"`
	CropFit               *bool    `json:"cropFit"`
}

// HandlePatchExercise partially updates an exercise.
func (d *Deps) HandlePatchExercise(w http.ResponseWriter, r *http.Request) {
	songID := r.PathValue("songId")
	exerciseID := r.PathValue("exerciseId")

	var req PatchExerciseRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	song, err := d.Songs.Get(songID)
	if err != nil || song == nil {
		jsonError(w, "Song not found", http.StatusNotFound)
		return
	}

	found := false
	for i := range song.Exercises {
		ex := &song.Exercises[i]
		if ex.ID == exerciseID {
			if req.Stage != nil && *req.Stage != ex.Stage {
				ex.Stage = *req.Stage
				// Append to stage log
				d.StageLogs.Append(songID, models.StageLogEntry{
					ExerciseID: exerciseID,
					Stage:      *req.Stage,
					Timestamp:  time.Now().UTC().Format(time.RFC3339),
				})
			}
			if req.TotalPracticedSeconds != nil {
				ex.TotalPracticedSeconds = *req.TotalPracticedSeconds
			}
			if req.TotalReps != nil {
				ex.TotalReps = *req.TotalReps
			}
			if req.LastPracticedAt != nil {
				ex.LastPracticedAt = req.LastPracticedAt
			}
			if req.CropScale != nil {
				ex.CropScale = req.CropScale
			}
			if req.CropAlign != nil {
				if *req.CropAlign == "left" || *req.CropAlign == "" {
					ex.CropAlign = nil
				} else {
					ex.CropAlign = req.CropAlign
				}
			}
			if req.CropFit != nil {
				if *req.CropFit {
					ex.CropFit = req.CropFit
				} else {
					ex.CropFit = nil
				}
			}
			found = true
			break
		}
	}

	if !found {
		jsonError(w, "Exercise not found", http.StatusNotFound)
		return
	}

	// Sync identical group members
	for _, group := range song.SimilarityGroups {
		if group.Type != "identical" {
			continue
		}
		inGroup := false
		for _, id := range group.ExerciseIDs {
			if id == exerciseID {
				inGroup = true
				break
			}
		}
		if !inGroup {
			continue
		}
		// Find the source exercise to get its current values
		var source *models.Exercise
		for i := range song.Exercises {
			if song.Exercises[i].ID == exerciseID {
				source = &song.Exercises[i]
				break
			}
		}
		if source == nil {
			break
		}
		// Sync all group members
		for _, id := range group.ExerciseIDs {
			if id == exerciseID {
				continue
			}
			for i := range song.Exercises {
				if song.Exercises[i].ID == id {
					song.Exercises[i].Stage = source.Stage
					song.Exercises[i].TotalPracticedSeconds = source.TotalPracticedSeconds
					song.Exercises[i].TotalReps = source.TotalReps
					song.Exercises[i].LastPracticedAt = source.LastPracticedAt
				}
			}
		}
		break
	}

	if err := d.Songs.Save(song); err != nil {
		jsonError(w, "Failed to save", http.StatusInternalServerError)
		return
	}

	jsonOK(w, map[string]any{"success": true})
}

// PatchSongDisplayRequest is the JSON body for PATCH song display settings.
type PatchSongDisplayRequest struct {
	CropBgColor  *string `json:"cropBgColor"`
	HideTitles   *bool   `json:"hideTitles"`
	HideControls *bool   `json:"hideControls"`
	HideDividers *bool   `json:"hideDividers"`
	HideStages   *bool   `json:"hideStages"`
	HideCards    *bool   `json:"hideCards"`
}

// HandlePatchSongDisplay updates song-level display settings (crop background color, etc.).
func (d *Deps) HandlePatchSongDisplay(w http.ResponseWriter, r *http.Request) {
	songID := r.PathValue("songId")

	var req PatchSongDisplayRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	song, err := d.Songs.Get(songID)
	if err != nil || song == nil {
		jsonError(w, "Song not found", http.StatusNotFound)
		return
	}

	if req.CropBgColor != nil {
		if *req.CropBgColor == "" {
			song.CropBgColor = nil
		} else {
			song.CropBgColor = req.CropBgColor
		}
	}
	if req.HideTitles != nil {
		song.HideTitles = *req.HideTitles
	}
	if req.HideControls != nil {
		song.HideControls = *req.HideControls
	}
	if req.HideDividers != nil {
		song.HideDividers = *req.HideDividers
	}
	if req.HideStages != nil {
		song.HideStages = *req.HideStages
	}
	if req.HideCards != nil {
		song.HideCards = *req.HideCards
	}

	if err := d.Songs.Save(song); err != nil {
		jsonError(w, "Failed to save", http.StatusInternalServerError)
		return
	}

	jsonOK(w, map[string]any{"success": true})
}

// HandleRegeneratePreviews re-crops all exercise previews from source page images
// at full resolution. This improves quality for songs created with older/lower-res settings.
func (d *Deps) HandleRegeneratePreviews(w http.ResponseWriter, r *http.Request) {
	songID := r.PathValue("songId")

	song, err := d.Songs.Get(songID)
	if err != nil || song == nil {
		jsonError(w, "Song not found", http.StatusNotFound)
		return
	}

	if song.JobID == "" {
		jsonError(w, "Song has no source pages", http.StatusBadRequest)
		return
	}

	regenerated := 0
	for i := range song.Exercises {
		for j := range song.Exercises[i].Crops {
			crop := &song.Exercises[i].Crops[j]
			pageNum := crop.PageIndex + 1 // pageIndex is 0-based
			pagePath, err := d.Jobs.GetPagePath(song.JobID, pageNum)
			if err != nil {
				log.Printf("Skip crop %s: page %d not found: %v", crop.ID, pageNum, err)
				continue
			}

			if err := cropAndSave(pagePath, crop.Rect, d.Songs.PreviewPath(songID, crop.ID)); err != nil {
				log.Printf("Failed to regenerate crop %s: %v", crop.ID, err)
				continue
			}
			regenerated++
		}
	}

	jsonOK(w, map[string]any{"success": true, "regenerated": regenerated})
}

// HandlePreview serves a crop preview image.
func (d *Deps) HandlePreview(w http.ResponseWriter, r *http.Request) {
	songID := r.PathValue("songId")
	cropID := r.PathValue("cropId")

	data, err := d.Songs.GetPreview(songID, cropID)
	if err != nil {
		http.NotFound(w, r)
		return
	}

	w.Header().Set("Content-Type", "image/png")
	w.Header().Set("Cache-Control", "public, max-age=86400")
	w.Write(data)
}

// HandleGetPage serves a converted PDF page image.
func (d *Deps) HandleGetPage(w http.ResponseWriter, r *http.Request) {
	jobID := r.PathValue("jobId")
	pageNumStr := r.PathValue("pageNum")

	pageNum, err := strconv.Atoi(pageNumStr)
	if err != nil || pageNum < 1 {
		http.NotFound(w, r)
		return
	}

	pagePath, err := d.Jobs.GetPagePath(jobID, pageNum)
	if err != nil {
		http.NotFound(w, r)
		return
	}

	ext := strings.ToLower(filepath.Ext(pagePath))
	if ext == ".jpg" || ext == ".jpeg" {
		w.Header().Set("Content-Type", "image/jpeg")
	} else {
		w.Header().Set("Content-Type", "image/png")
	}
	w.Header().Set("Cache-Control", "public, max-age=86400")
	http.ServeFile(w, r, pagePath)
}

// HandleConvertPDF converts an uploaded PDF to page images using mutool.
func (d *Deps) HandleConvertPDF(w http.ResponseWriter, r *http.Request) {
	// Parse multipart form (max 50MB)
	if err := r.ParseMultipartForm(50 << 20); err != nil {
		jsonError(w, "Failed to parse upload", http.StatusBadRequest)
		return
	}

	file, _, err := r.FormFile("file")
	if err != nil {
		jsonError(w, "No file uploaded", http.StatusBadRequest)
		return
	}
	defer file.Close()

	pdfBytes, err := io.ReadAll(file)
	if err != nil {
		jsonError(w, "Failed to read file", http.StatusInternalServerError)
		return
	}

	if len(pdfBytes) < 5 || string(pdfBytes[:5]) != "%PDF-" {
		jsonError(w, "Uploaded file is not a valid PDF", http.StatusBadRequest)
		return
	}

	jobID := generateID()
	jobDir, err := d.Jobs.CreateJobDir(jobID)
	if err != nil {
		jsonError(w, "Failed to create job directory", http.StatusInternalServerError)
		return
	}

	pageCount, err := convertPDF(pdfBytes, jobDir)
	if err != nil {
		log.Printf("PDF conversion failed: %v", err)
		jsonError(w, "PDF conversion failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	pages := make([]map[string]any, pageCount)
	for i := 0; i < pageCount; i++ {
		pages[i] = map[string]any{
			"pageNum": i + 1,
			"url":     fmt.Sprintf("/api/pages/%s/%d", jobID, i+1),
		}
	}

	jsonOK(w, map[string]any{
		"id":        jobID,
		"pageCount": pageCount,
		"pages":     pages,
	})
}

// HandleSaveSimilarityGroups replaces all similarity groups for a song.
func (d *Deps) HandleSaveSimilarityGroups(w http.ResponseWriter, r *http.Request) {
	songID := r.PathValue("songId")

	song, err := d.Songs.Get(songID)
	if err != nil || song == nil {
		jsonError(w, "Song not found", http.StatusNotFound)
		return
	}

	var groups []models.SimilarityGroup
	if err := json.NewDecoder(r.Body).Decode(&groups); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	song.SimilarityGroups = groups

	// For identical groups, sync practice data: all exercises share the max values
	for _, group := range groups {
		if group.Type != "identical" {
			continue
		}
		// Find the exercise with the most practice data
		var bestStage, bestSeconds, bestReps int
		var bestLastPracticed *string
		for _, exID := range group.ExerciseIDs {
			for i := range song.Exercises {
				if song.Exercises[i].ID == exID {
					ex := &song.Exercises[i]
					if ex.Stage > bestStage {
						bestStage = ex.Stage
					}
					if ex.TotalPracticedSeconds > bestSeconds {
						bestSeconds = ex.TotalPracticedSeconds
					}
					if ex.TotalReps > bestReps {
						bestReps = ex.TotalReps
					}
					if ex.LastPracticedAt != nil && (bestLastPracticed == nil || *ex.LastPracticedAt > *bestLastPracticed) {
						bestLastPracticed = ex.LastPracticedAt
					}
				}
			}
		}
		// Sync all exercises in the group to the best values
		for _, exID := range group.ExerciseIDs {
			for i := range song.Exercises {
				if song.Exercises[i].ID == exID {
					song.Exercises[i].Stage = bestStage
					song.Exercises[i].TotalPracticedSeconds = bestSeconds
					song.Exercises[i].TotalReps = bestReps
					song.Exercises[i].LastPracticedAt = bestLastPracticed
				}
			}
		}
	}

	if err := d.Songs.Save(song); err != nil {
		jsonError(w, "Failed to save", http.StatusInternalServerError)
		return
	}

	jsonOK(w, map[string]any{"success": true})
}

// --- JSON helpers ---

func jsonOK(w http.ResponseWriter, data any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

func jsonError(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
