package models

// Rect represents normalized crop coordinates (0-1).
type Rect struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
	W float64 `json:"w"`
	H float64 `json:"h"`
}

// Crop is a region within a sheet music page.
type Crop struct {
	ID            string  `json:"id"`
	PageIndex     int     `json:"pageIndex"`
	Rect          Rect    `json:"rect"`
	PreviewBase64 *string `json:"previewBase64,omitempty"`
}

// Section is a song structure element (e.g. Intro, Verse, Chorus).
type Section struct {
	ID    string `json:"id"`
	Type  string `json:"type"`
	Order int    `json:"order"`
}

// Exercise contains one or more crops to practice.
type Exercise struct {
	ID                    string   `json:"id"`
	Name                  string   `json:"name"`
	SectionID             string   `json:"sectionId"`
	Difficulty            int      `json:"difficulty"`
	Stage                 int      `json:"stage"`
	Crops                 []Crop   `json:"crops"`
	TotalPracticedSeconds int      `json:"totalPracticedSeconds"`
	TotalReps             int      `json:"totalReps"`
	LastPracticedAt       *string  `json:"lastPracticedAt"`
	CreatedAt             string   `json:"createdAt"`
	CropScale             *float64 `json:"cropScale,omitempty"`
	CropAlign             *string  `json:"cropAlign,omitempty"`
	CropFit               *bool    `json:"cropFit,omitempty"`
	IsTransition          bool     `json:"isTransition,omitempty"`
	TransitionBetween     [2]string `json:"transitionBetween,omitempty"`
	IsTracked             bool     `json:"isTracked,omitempty"`
}

// Song is the top-level domain model.
type Song struct {
	ID          string     `json:"id"`
	Title       string     `json:"title"`
	Artist      string     `json:"artist"`
	Tempo       *float64   `json:"tempo"`
	YoutubeURL  *string    `json:"youtubeUrl"`
	SpotifyURL  *string    `json:"spotifyUrl"`
	JobID       string     `json:"jobId"`
	PageCount   int        `json:"pageCount"`
	Structure   []Section  `json:"structure"`
	Exercises []Exercise `json:"exercises"`
	CreatedAt        string            `json:"createdAt"`
	CropBgColor  *string `json:"cropBgColor,omitempty"`
	HideTitles   bool    `json:"hideTitles,omitempty"`
	HideControls bool    `json:"hideControls,omitempty"`
	HideDividers bool    `json:"hideDividers,omitempty"`
	HideStages   bool    `json:"hideStages,omitempty"`
	HideCards    bool    `json:"hideCards,omitempty"`
}

// SongSummary is used for the browse/list view.
type SongSummary struct {
	ID              string   `json:"id"`
	Title           string   `json:"title"`
	Artist          string   `json:"artist"`
	JobID           string   `json:"jobId"`
	PageCount       int      `json:"pageCount"`
	CreatedAt       string   `json:"createdAt"`
	ExerciseCount   int      `json:"exerciseCount"`
	MasteredCount   int      `json:"masteredCount"`
	StageCounts     [5]int   `json:"stageCounts"`
	LowestStage     *int     `json:"lowestStage"`
	LastPracticedAt *string  `json:"lastPracticedAt"`
	SpotifyURL      *string  `json:"spotifyUrl,omitempty"`
	Tags            []string `json:"tags,omitempty"`
}

// LowestStage computes the minimum stage across exercises.
func (s *Song) LowestStage() *int {
	if len(s.Exercises) == 0 {
		return nil
	}
	min := s.Exercises[0].Stage
	for _, ex := range s.Exercises[1:] {
		if ex.Stage < min {
			min = ex.Stage
		}
	}
	return &min
}

// LastPracticed returns the most recent lastPracticedAt across exercises.
func (s *Song) LastPracticed() *string {
	var latest *string
	for _, ex := range s.Exercises {
		if ex.LastPracticedAt != nil {
			if latest == nil || *ex.LastPracticedAt > *latest {
				latest = ex.LastPracticedAt
			}
		}
	}
	return latest
}

// ToSummary converts a Song to a SongSummary.
func (s *Song) ToSummary() SongSummary {
	mastered := 0
	var stageCounts [5]int
	for _, ex := range s.Exercises {
		if ex.Stage >= 5 {
			mastered++
		}
		if ex.Stage >= 1 && ex.Stage <= 5 {
			stageCounts[ex.Stage-1]++
		}
	}
	return SongSummary{
		ID:              s.ID,
		Title:           s.Title,
		Artist:          s.Artist,
		JobID:           s.JobID,
		PageCount:       s.PageCount,
		CreatedAt:       s.CreatedAt,
		ExerciseCount:   len(s.Exercises),
		MasteredCount:   mastered,
		StageCounts:     stageCounts,
		LowestStage:     s.LowestStage(),
		LastPracticedAt: s.LastPracticed(),
		SpotifyURL:      s.SpotifyURL,
	}
}
