package handlers

import (
	"fmt"
	"net/http"

	"github.com/LianHaeming/avoidnt/models"
)

// SongDetailData is template data for the song detail page.
type SongDetailData struct {
	Settings      models.UserSettings
	Song          models.Song
	SectionGroups []SectionGroup
}

// SectionGroup groups exercises under a section label.
type SectionGroup struct {
	Section     models.Section
	Label       string
	Exercises   []models.Exercise
	LowestStage int
}

// HandleSongDetail renders the song detail / practice page.
func (d *Deps) HandleSongDetail(w http.ResponseWriter, r *http.Request) {
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
	groups := buildSectionGroups(song)

	data := SongDetailData{
		Settings:      settings,
		Song:          *song,
		SectionGroups: groups,
	}

	d.render(w, "song-detail.html", data)
}

func buildSectionGroups(song *models.Song) []SectionGroup {
	if len(song.Structure) == 0 {
		if len(song.Exercises) == 0 {
			return nil
		}
		return []SectionGroup{
			{
				Section:     models.Section{ID: "__flat__"},
				Label:       "",
				Exercises:   song.Exercises,
				LowestStage: lowestStageOf(song.Exercises),
			},
		}
	}

	// Count occurrences of each type for numbering
	typeCounts := map[string]int{}
	for _, sec := range song.Structure {
		typeCounts[sec.Type]++
	}

	// Sort by order
	sorted := make([]models.Section, len(song.Structure))
	copy(sorted, song.Structure)
	// Already sorted by order in the JSON, but ensure it
	for i := range sorted {
		for j := i + 1; j < len(sorted); j++ {
			if sorted[j].Order < sorted[i].Order {
				sorted[i], sorted[j] = sorted[j], sorted[i]
			}
		}
	}

	typeOccurrence := map[string]int{}
	var groups []SectionGroup

	for _, sec := range sorted {
		typeOccurrence[sec.Type]++
		capitalized := capitalize(sec.Type)
		label := capitalized
		if typeCounts[sec.Type] > 1 {
			label = capitalized + " (" + itoa(typeOccurrence[sec.Type]) + ")"
		}

		var exs []models.Exercise
		for _, ex := range song.Exercises {
			if ex.SectionID == sec.ID {
				exs = append(exs, ex)
			}
		}

		groups = append(groups, SectionGroup{
			Section:     sec,
			Label:       label,
			Exercises:   exs,
			LowestStage: lowestStageOf(exs),
		})
	}

	return groups
}

func lowestStageOf(exs []models.Exercise) int {
	if len(exs) == 0 {
		return 0
	}
	low := exs[0].Stage
	for _, ex := range exs[1:] {
		if ex.Stage < low {
			low = ex.Stage
		}
	}
	return low
}

func capitalize(s string) string {
	if s == "" {
		return s
	}
	r := []rune(s)
	if r[0] >= 'a' && r[0] <= 'z' {
		r[0] -= 32
	}
	return string(r)
}

func itoa(n int) string {
	return fmt.Sprintf("%d", n)
}
