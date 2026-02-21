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

// RecommendedCard is a single recommendation in a practice plan.
type RecommendedCard struct {
	ExerciseID    string `json:"exerciseId"`
	Name          string `json:"name"`
	Reason        string `json:"reason"`
	SuggestedMins int    `json:"suggestedMins"`
	Priority      int    `json:"priority"`
}

// HandleGetRecommendations returns a recommended practice plan.
func (d *Deps) HandleGetRecommendations(w http.ResponseWriter, r *http.Request) {
	songID := r.PathValue("songId")

	song, err := d.Songs.Get(songID)
	if err != nil || song == nil {
		jsonError(w, "Song not found", http.StatusNotFound)
		return
	}

	if len(song.Exercises) == 0 {
		jsonOK(w, map[string]any{"recommendations": []RecommendedCard{}, "totalMins": 0})
		return
	}

	// Build similarity group lookup
	identicalGroups := map[string][]string{}     // exerciseId -> all IDs in its identical group
	similarGroups := map[string][]string{}        // exerciseId -> all IDs in its similar group
	for _, group := range song.SimilarityGroups {
		for _, id := range group.ExerciseIDs {
			if group.Type == "identical" {
				identicalGroups[id] = group.ExerciseIDs
			} else if group.Type == "similar" {
				similarGroups[id] = group.ExerciseIDs
			}
		}
	}

	// Compute effective time per exercise
	type scoredExercise struct {
		models.Exercise
		EffectiveTime  int
		TransferredTime int
		Priority       int
		Reason         string
	}

	// Compute song average stage
	var totalStage int
	regularCount := 0
	for _, ex := range song.Exercises {
		if !ex.IsTransition {
			totalStage += ex.Stage
			regularCount++
		}
	}
	avgStage := 0.0
	if regularCount > 0 {
		avgStage = float64(totalStage) / float64(regularCount)
	}

	// Divide exercises into quarters for positional imbalance
	quarterSize := regularCount / 4
	if quarterSize < 1 {
		quarterSize = 1
	}

	var scored []scoredExercise
	regularIdx := 0

	// Track which identical groups we've already added
	seenIdenticalGroups := map[string]bool{}

	for _, ex := range song.Exercises {
		// Skip untracked transitions
		if ex.IsTransition && !ex.IsTracked {
			continue
		}

		// For identical groups, only score once
		if ids, ok := identicalGroups[ex.ID]; ok {
			groupKey := ids[0] // use first ID as group key
			if seenIdenticalGroups[groupKey] {
				continue
			}
			seenIdenticalGroups[groupKey] = true
		}

		se := scoredExercise{Exercise: ex}
		se.EffectiveTime = ex.TotalPracticedSeconds

		// Compute transferred time for similar groups
		if ids, ok := similarGroups[ex.ID]; ok {
			for _, otherId := range ids {
				if otherId == ex.ID {
					continue
				}
				for _, other := range song.Exercises {
					if other.ID == otherId {
						transfer := int(float64(other.TotalPracticedSeconds) * 0.8)
						se.TransferredTime += transfer
						se.EffectiveTime += transfer
					}
				}
			}
		}

		// Priority = (5 - stage) * 10
		se.Priority = (5 - ex.Stage) * 10

		// Similarity adjustment: reduce priority if heavily carried by peers
		if se.EffectiveTime > 0 && se.TransferredTime > 0 {
			ratio := float64(se.TransferredTime) / float64(se.EffectiveTime)
			adjustment := int(-5.0 * ratio)
			se.Priority += adjustment
		}

		// Positional imbalance
		if !ex.IsTransition {
			quarter := regularIdx / quarterSize
			if quarter > 3 {
				quarter = 3
			}
			// Compute this quarter's avg stage (simplified: use exercise position)
			if float64(ex.Stage) < avgStage-1 {
				se.Priority += 10
			}
			regularIdx++
		}

		// Decay nudge
		if ex.LastPracticedAt != nil {
			lastPracticed, err := time.Parse(time.RFC3339, *ex.LastPracticedAt)
			if err == nil {
				daysSince := int(time.Since(lastPracticed).Hours() / 24)
				nudge := daysSince
				if nudge > 5 {
					nudge = 5
				}
				se.Priority += nudge
			}
		} else {
			se.Priority += 5 // never practiced = max decay nudge
		}

		// Transition bonus
		if ex.IsTransition && ex.IsTracked {
			// Only boost if both adjacent cards are stage >= 3
			bothStrong := true
			for _, adjId := range ex.TransitionBetween {
				for _, adj := range song.Exercises {
					if adj.ID == adjId && adj.Stage < 3 {
						bothStrong = false
					}
				}
			}
			if bothStrong {
				se.Priority += 5
			} else {
				se.Priority -= 20 // deprioritize if adjacent cards aren't ready
			}
		}

		// Determine reason
		if ex.Stage <= 2 {
			se.Reason = "weakest section"
			if se.TransferredTime > 0 && se.TransferredTime > ex.TotalPracticedSeconds {
				se.Reason += ", mostly carried by similar sections"
			}
		} else if ex.IsTransition {
			se.Reason = "transition needs work"
		} else if ex.LastPracticedAt != nil {
			lastPracticed, err := time.Parse(time.RFC3339, *ex.LastPracticedAt)
			if err == nil {
				daysSince := int(time.Since(lastPracticed).Hours() / 24)
				if daysSince >= 3 {
					se.Reason = "not practiced in " + itoa(daysSince) + " days"
				} else {
					se.Reason = "needs more practice"
				}
			}
		} else {
			se.Reason = "not started yet"
		}

		scored = append(scored, se)
	}

	// Sort by priority descending
	for i := range scored {
		for j := i + 1; j < len(scored); j++ {
			if scored[j].Priority > scored[i].Priority {
				scored[i], scored[j] = scored[j], scored[i]
			}
		}
	}

	// Take top 4-5 recommendations
	maxRecs := 5
	if len(scored) < maxRecs {
		maxRecs = len(scored)
	}

	var recommendations []RecommendedCard
	totalMins := 0
	for i := 0; i < maxRecs; i++ {
		se := scored[i]
		if se.Priority <= 0 {
			break // don't recommend things that are fine
		}
		mins := 3
		if se.Stage <= 1 {
			mins = 6
		} else if se.Stage <= 2 {
			mins = 5
		} else if se.IsTransition {
			mins = 3
		} else {
			mins = 4
		}

		name := se.Name
		// For identical groups, list all names
		if ids, ok := identicalGroups[se.ID]; ok && len(ids) > 1 {
			var names []string
			for _, id := range ids {
				for _, ex := range song.Exercises {
					if ex.ID == id {
						names = append(names, ex.Name)
					}
				}
			}
			if len(names) > 1 {
				name = names[0] + " / " + names[1]
				if len(names) > 2 {
					name += " (+" + itoa(len(names)-2) + " more)"
				}
			}
		}

		recommendations = append(recommendations, RecommendedCard{
			ExerciseID:    se.ID,
			Name:          name,
			Reason:        se.Reason,
			SuggestedMins: mins,
			Priority:      se.Priority,
		})
		totalMins += mins
	}

	// Add run-through suggestion if 3+ adjacent recommended cards
	if len(recommendations) >= 3 {
		runMins := totalMins / 4
		if runMins < 2 {
			runMins = 2
		}
		recommendations = append(recommendations, RecommendedCard{
			ExerciseID:    "__runthrough__",
			Name:          "Full run-through",
			Reason:        "practice transitions in context",
			SuggestedMins: runMins,
		})
		totalMins += runMins
	}

	jsonOK(w, map[string]any{
		"recommendations": recommendations,
		"totalMins":        totalMins,
	})
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
