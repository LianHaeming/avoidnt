package models

// StageLogEntry records a stage change for an exercise.
type StageLogEntry struct {
	ExerciseID string `json:"exerciseId"`
	Stage      int    `json:"stage"`
	Timestamp  string `json:"timestamp"` // ISO 8601
}
