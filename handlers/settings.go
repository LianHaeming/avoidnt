package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/LianHaeming/avoidnt/models"
)

// HandleGetSettings returns settings as JSON.
func (d *Deps) HandleGetSettings(w http.ResponseWriter, r *http.Request) {
	settings := d.Settings.Get()
	jsonOK(w, settings)
}

// UpdateSettingsRequest is the JSON body for PUT settings.
type UpdateSettingsRequest struct {
	Theme      *string  `json:"theme"`
	StageNames []string `json:"stageNames"`
}

// HandleUpdateSettings saves settings changes.
func (d *Deps) HandleUpdateSettings(w http.ResponseWriter, r *http.Request) {
	var req UpdateSettingsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	settings := d.Settings.Get()

	if req.Theme != nil {
		if *req.Theme != "light" && *req.Theme != "dark" {
			jsonError(w, "theme must be 'light' or 'dark'", http.StatusBadRequest)
			return
		}
		settings.Theme = *req.Theme
	}

	if req.StageNames != nil {
		if len(req.StageNames) != 5 {
			jsonError(w, "stageNames must have exactly 5 entries", http.StatusBadRequest)
			return
		}
		for i, name := range req.StageNames {
			if name == "" || len(name) > 30 {
				jsonError(w, "stageNames["+itoa(i)+"] must be 1-30 characters", http.StatusBadRequest)
				return
			}
		}
		settings.StageNames = req.StageNames
	}

	if err := d.Settings.Save(settings); err != nil {
		jsonError(w, "Failed to save settings", http.StatusInternalServerError)
		return
	}

	jsonOK(w, map[string]any{"success": true})
}

func (d *Deps) settingsForPage() models.UserSettings {
	return d.Settings.Get()
}
