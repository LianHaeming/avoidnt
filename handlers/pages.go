package handlers

import (
	"net/http"
	"sort"
	"strings"

	"github.com/LianHaeming/avoidnt/models"
)

// HandleHome redirects to /songs.
func (d *Deps) HandleHome(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	http.Redirect(w, r, "/songs", http.StatusFound)
}

// SongsPageData is the template data for the songs list page.
type SongsPageData struct {
	Settings models.UserSettings
	Rows     []SongRow
	AllSongs []models.SongSummary
}

// SongRow is a Netflix-style category row.
type SongRow struct {
	Title string
	Songs []models.SongSummary
}

// HandleSongsList renders the full songs browse page.
func (d *Deps) HandleSongsList(w http.ResponseWriter, r *http.Request) {
	songs, err := d.Songs.ListAll()
	if err != nil {
		http.Error(w, "Failed to load songs", http.StatusInternalServerError)
		return
	}

	settings := d.Settings.Get()
	summaries := make([]models.SongSummary, len(songs))
	for i := range songs {
		summaries[i] = songs[i].ToSummary()
	}

	rows := buildRows(summaries)

	data := SongsPageData{
		Settings: settings,
		Rows:     rows,
		AllSongs: summaries,
	}

	d.render(w, "songs.html", data)
}

// HandleSongsListPartial returns just the song rows partial (for htmx search).
func (d *Deps) HandleSongsListPartial(w http.ResponseWriter, r *http.Request) {
	songs, err := d.Songs.ListAll()
	if err != nil {
		http.Error(w, "Failed to load songs", http.StatusInternalServerError)
		return
	}

	summaries := make([]models.SongSummary, len(songs))
	for i := range songs {
		summaries[i] = songs[i].ToSummary()
	}

	q := strings.TrimSpace(strings.ToLower(r.URL.Query().Get("q")))
	if q != "" {
		var filtered []models.SongSummary
		for _, s := range summaries {
			if strings.Contains(strings.ToLower(s.Title), q) ||
				strings.Contains(strings.ToLower(s.Artist), q) {
				filtered = append(filtered, s)
			}
		}
		summaries = filtered
	}

	rows := buildRows(summaries)

	d.render(w, "partials/song-rows.html", struct {
		Rows     []SongRow
		AllSongs []models.SongSummary
		Query    string
	}{Rows: rows, AllSongs: summaries, Query: q})
}

func buildRows(summaries []models.SongSummary) []SongRow {
	var rows []SongRow

	// Recently Practiced
	var recent []models.SongSummary
	for _, s := range summaries {
		if s.LastPracticedAt != nil {
			recent = append(recent, s)
		}
	}
	sort.Slice(recent, func(i, j int) bool {
		return *recent[i].LastPracticedAt > *recent[j].LastPracticedAt
	})
	if len(recent) > 0 {
		rows = append(rows, SongRow{Title: "Recently Practiced", Songs: recent})
	}

	return rows
}

func (d *Deps) render(w http.ResponseWriter, name string, data any) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if err := d.Templates.ExecuteTemplate(w, name, data); err != nil {
		http.Error(w, "Template error: "+err.Error(), http.StatusInternalServerError)
	}
}
