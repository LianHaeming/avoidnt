package handlers

import (
	"github.com/LianHaeming/avoidnt/storage"
	"github.com/LianHaeming/avoidnt/tmpl"
)

// Deps holds all handler dependencies.
type Deps struct {
	Songs     *storage.SongStore
	Settings  *storage.SettingsStore
	Jobs      *storage.JobStore
	DailyLogs *storage.DailyLogStore
	StageLogs *storage.StageLogStore
	Templates *tmpl.Templates
	OpenAIKey string
	PdfOutput string
}
