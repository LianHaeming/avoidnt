package models

// DailyLogEntry records practice time and reps for one exercise on one day.
type DailyLogEntry struct {
	ExerciseID string `json:"exerciseId"`
	Seconds    int    `json:"seconds"`
	Reps       int    `json:"reps"`
}

// DailyLog records all practice for a single day.
type DailyLog struct {
	Date    string          `json:"date"` // "2025-02-20"
	Entries []DailyLogEntry `json:"entries"`
}
