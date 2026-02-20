package handlers

import (
	"net/http"
	"sort"
	"strings"
	"time"

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
	Settings           models.UserSettings
	ContinuePracticing []models.SongSummary
	NeedsAttention     []models.SongSummary
	AllSongs           []models.SongSummary
	// Keep legacy Rows for partial compatibility
	Rows []SongRow
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

	continuePracticing, needsAttention := buildLibrarySections(summaries)

	// All songs sorted alphabetically by default
	allSorted := make([]models.SongSummary, len(summaries))
	copy(allSorted, summaries)
	sort.Slice(allSorted, func(i, j int) bool {
		// Default: last practiced first, never-practiced at bottom
		if allSorted[i].LastPracticedAt == nil && allSorted[j].LastPracticedAt == nil {
			return allSorted[i].Title < allSorted[j].Title
		}
		if allSorted[i].LastPracticedAt == nil {
			return false
		}
		if allSorted[j].LastPracticedAt == nil {
			return true
		}
		return *allSorted[i].LastPracticedAt > *allSorted[j].LastPracticedAt
	})

	data := SongsPageData{
		Settings:           settings,
		ContinuePracticing: continuePracticing,
		NeedsAttention:     needsAttention,
		AllSongs:           allSorted,
	}

	d.render(w, "songs.html", data)
}

// HandleSongsListPartial returns just the all-songs list partial (for htmx search).
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

	// Sort by last practiced (default)
	sort.Slice(summaries, func(i, j int) bool {
		if summaries[i].LastPracticedAt == nil && summaries[j].LastPracticedAt == nil {
			return summaries[i].Title < summaries[j].Title
		}
		if summaries[i].LastPracticedAt == nil {
			return false
		}
		if summaries[j].LastPracticedAt == nil {
			return true
		}
		return *summaries[i].LastPracticedAt > *summaries[j].LastPracticedAt
	})

	d.render(w, "partials/song-rows.html", struct {
		AllSongs []models.SongSummary
		Query    string
	}{AllSongs: summaries, Query: q})
}

// buildLibrarySections computes the "Continue Practicing" and "Needs Attention" lists.
func buildLibrarySections(summaries []models.SongSummary) (continuePracticing, needsAttention []models.SongSummary) {
	now := time.Now()
	fourteenDays := 14 * 24 * time.Hour

	for _, s := range summaries {
		// Skip songs where all exercises are mastered (Stage 5)
		if s.ExerciseCount == 0 || s.MasteredCount == s.ExerciseCount {
			continue
		}

		if s.LastPracticedAt == nil {
			// Never practiced — could be "needs attention" but only if it has exercises
			needsAttention = append(needsAttention, s)
			continue
		}

		t, err := time.Parse(time.RFC3339, *s.LastPracticedAt)
		if err != nil {
			t, err = time.Parse("2006-01-02T15:04:05.000Z", *s.LastPracticedAt)
			if err != nil {
				continue
			}
		}

		age := now.Sub(t)
		if age <= fourteenDays {
			continuePracticing = append(continuePracticing, s)
		} else {
			needsAttention = append(needsAttention, s)
		}
	}

	// Continue Practicing: most recent first, take top 5
	sort.Slice(continuePracticing, func(i, j int) bool {
		return *continuePracticing[i].LastPracticedAt > *continuePracticing[j].LastPracticedAt
	})
	if len(continuePracticing) > 5 {
		continuePracticing = continuePracticing[:5]
	}

	// Needs Attention: oldest first (most neglected), take top 8
	sort.Slice(needsAttention, func(i, j int) bool {
		if needsAttention[i].LastPracticedAt == nil && needsAttention[j].LastPracticedAt == nil {
			return needsAttention[i].Title < needsAttention[j].Title
		}
		if needsAttention[i].LastPracticedAt == nil {
			return true // never practiced = most neglected
		}
		if needsAttention[j].LastPracticedAt == nil {
			return false
		}
		return *needsAttention[i].LastPracticedAt < *needsAttention[j].LastPracticedAt
	})
	if len(needsAttention) > 8 {
		needsAttention = needsAttention[:8]
	}

	return
}

// SettingsPageData is the template data for the settings page.
type SettingsPageData struct {
	Settings models.UserSettings
}

// HandleSettingsPage renders the settings page.
func (d *Deps) HandleSettingsPage(w http.ResponseWriter, r *http.Request) {
	settings := d.Settings.Get()
	data := SettingsPageData{Settings: settings}
	d.render(w, "settings.html", data)
}

func (d *Deps) render(w http.ResponseWriter, name string, data any) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if err := d.Templates.ExecuteTemplate(w, name, data); err != nil {
		http.Error(w, "Template error: "+err.Error(), http.StatusInternalServerError)
	}
}
