package models

// DefaultStageNames are the default names for the 5 practice stages.
var DefaultStageNames = [5]string{
	"Not started",
	"Learning",
	"Slow & clean",
	"Up to tempo",
	"Mastered",
}

// UserSettings holds user preferences.
type UserSettings struct {
	Theme      string   `json:"theme"`
	StageNames []string `json:"stageNames"`
}

// DefaultSettings returns settings with default values.
func DefaultSettings() UserSettings {
	names := make([]string, 5)
	copy(names, DefaultStageNames[:])
	return UserSettings{
		Theme:      "light",
		StageNames: names,
	}
}
