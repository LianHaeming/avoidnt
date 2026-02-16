package handlers

import (
	"net/http"

	"github.com/LianHaeming/avoidnt/models"
)

// PlanDesignerData is template data for the Plan Designer page.
type PlanDesignerData struct {
	Settings models.UserSettings
	Mode     string // "create" or "edit"
	SongID   string
	Song     *models.Song // nil for create mode
}

// HandlePlanDesignerNew renders the Plan Designer in create mode.
func (d *Deps) HandlePlanDesignerNew(w http.ResponseWriter, r *http.Request) {
	settings := d.Settings.Get()
	songID := generateID()

	data := PlanDesignerData{
		Settings: settings,
		Mode:     "create",
		SongID:   songID,
		Song:     nil,
	}

	d.render(w, "plan-designer.html", data)
}

// HandlePlanDesignerEdit renders the Plan Designer in edit mode.
func (d *Deps) HandlePlanDesignerEdit(w http.ResponseWriter, r *http.Request) {
	songID := r.PathValue("songId")

	song, err := d.Songs.Get(songID)
	if err != nil {
		http.Error(w, "Failed to load song", http.StatusInternalServerError)
		return
	}
	if song == nil {
		http.NotFound(w, r)
		return
	}

	settings := d.Settings.Get()

	data := PlanDesignerData{
		Settings: settings,
		Mode:     "edit",
		SongID:   songID,
		Song:     song,
	}

	d.render(w, "plan-designer.html", data)
}
