package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/LianHaeming/avoidnt/models"
)

// HandleGetDailyLog returns daily practice logs for a song.
// Supports optional ?from=YYYY-MM-DD&to=YYYY-MM-DD query params.
func (d *Deps) HandleGetDailyLog(w http.ResponseWriter, r *http.Request) {
	songID := r.PathValue("songId")
	from := r.URL.Query().Get("from")
	to := r.URL.Query().Get("to")

	var logs interface{}
	var err error
	if from != "" && to != "" {
		logs, err = d.DailyLogs.GetRange(songID, from, to)
	} else {
		logs, err = d.DailyLogs.GetAll(songID)
	}

	if err != nil {
		jsonError(w, "Failed to load daily log", http.StatusInternalServerError)
		return
	}

	jsonOK(w, logs)
}

// PatchDailyLogRequest is the JSON body for upserting a daily log entry.
type PatchDailyLogRequest struct {
	Date       string `json:"date"`
	ExerciseID string `json:"exerciseId"`
	Seconds    int    `json:"seconds"`
	Reps       int    `json:"reps"`
}

// HandlePatchDailyLog upserts a daily log entry for a song.
func (d *Deps) HandlePatchDailyLog(w http.ResponseWriter, r *http.Request) {
	songID := r.PathValue("songId")

	var req PatchDailyLogRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Date == "" || req.ExerciseID == "" {
		jsonError(w, "Missing required fields (date, exerciseId)", http.StatusBadRequest)
		return
	}

	if err := d.DailyLogs.Upsert(songID, req.Date, req.ExerciseID, req.Seconds, req.Reps); err != nil {
		jsonError(w, "Failed to save daily log", http.StatusInternalServerError)
		return
	}

	jsonOK(w, map[string]any{"success": true})
}

// HandleToggleTransition creates or toggles tracking for a transition exercise.
func (d *Deps) HandleToggleTransition(w http.ResponseWriter, r *http.Request) {
	songID := r.PathValue("songId")

	var req struct {
		ExerciseID1 string `json:"exerciseId1"`
		ExerciseID2 string `json:"exerciseId2"`
		Track       bool   `json:"track"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	song, err := d.Songs.Get(songID)
	if err != nil || song == nil {
		jsonError(w, "Song not found", http.StatusNotFound)
		return
	}

	// Find existing transition or create new one
	found := false
	for i := range song.Exercises {
		ex := &song.Exercises[i]
		if ex.IsTransition &&
			((ex.TransitionBetween[0] == req.ExerciseID1 && ex.TransitionBetween[1] == req.ExerciseID2) ||
				(ex.TransitionBetween[0] == req.ExerciseID2 && ex.TransitionBetween[1] == req.ExerciseID1)) {
			ex.IsTracked = req.Track
			found = true
			break
		}
	}

	if !found && req.Track {
		// Create a new transition exercise
		// Find names of the two exercises
		var name1, name2 string
		for _, ex := range song.Exercises {
			if ex.ID == req.ExerciseID1 {
				name1 = ex.Name
			}
			if ex.ID == req.ExerciseID2 {
				name2 = ex.Name
			}
		}
		transitionName := name1 + " → " + name2
		newEx := models.Exercise{
			ID:                generateID()[:16],
			Name:              transitionName,
			SectionID:         "",
			Stage:             1,
			IsTransition:      true,
			TransitionBetween: [2]string{req.ExerciseID1, req.ExerciseID2},
			IsTracked:         true,
			Crops:             []models.Crop{},
			CreatedAt:         time.Now().UTC().Format(time.RFC3339),
		}
		song.Exercises = append(song.Exercises, newEx)
	}

	if err := d.Songs.Save(song); err != nil {
		jsonError(w, "Failed to save", http.StatusInternalServerError)
		return
	}

	jsonOK(w, map[string]any{"success": true})
}

// HandleGetStageLog returns the stage change history for a song.
func (d *Deps) HandleGetStageLog(w http.ResponseWriter, r *http.Request) {
	songID := r.PathValue("songId")

	logs, err := d.StageLogs.GetAll(songID)
	if err != nil {
		jsonError(w, "Failed to load stage log", http.StatusInternalServerError)
		return
	}

	jsonOK(w, logs)
}
