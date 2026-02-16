package storage

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"sync"

	"github.com/LianHaeming/avoidnt/models"
)

// SongStore handles file-based song persistence.
type SongStore struct {
	root string
	mu   sync.RWMutex
}

func NewSongStore(root string) *SongStore {
	os.MkdirAll(root, 0o755)
	return &SongStore{root: root}
}

func (s *SongStore) songDir(id string) string {
	return filepath.Join(s.root, id)
}

// Get returns a song by ID, or nil if not found.
func (s *SongStore) Get(id string) (*models.Song, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	path := filepath.Join(s.songDir(id), "song.json")
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	var song models.Song
	if err := json.Unmarshal(data, &song); err != nil {
		return nil, err
	}

	// Migration: handle old format fields
	migrateSong(&song)

	return &song, nil
}

// ListAll returns all songs sorted by directory name.
func (s *SongStore) ListAll() ([]models.Song, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	entries, err := os.ReadDir(s.root)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}

	var songs []models.Song
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		path := filepath.Join(s.root, entry.Name(), "song.json")
		data, err := os.ReadFile(path)
		if err != nil {
			log.Printf("Warning: skipping %s: %v", entry.Name(), err)
			continue
		}
		var song models.Song
		if err := json.Unmarshal(data, &song); err != nil {
			log.Printf("Warning: skipping %s: invalid JSON: %v", entry.Name(), err)
			continue
		}
		migrateSong(&song)
		songs = append(songs, song)
	}

	sort.Slice(songs, func(i, j int) bool {
		return songs[i].Title < songs[j].Title
	})

	return songs, nil
}

// Save persists a song and its preview images.
func (s *SongStore) Save(song *models.Song) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	dir := s.songDir(song.ID)
	os.MkdirAll(dir, 0o755)

	// Extract and save preview images, strip base64 from stored JSON
	for i := range song.Exercises {
		for j := range song.Exercises[i].Crops {
			crop := &song.Exercises[i].Crops[j]
			if crop.PreviewBase64 != nil && *crop.PreviewBase64 != "" {
				decoded, err := base64.StdEncoding.DecodeString(*crop.PreviewBase64)
				if err == nil {
					previewPath := filepath.Join(dir, fmt.Sprintf("preview_%s.png", crop.ID))
					os.WriteFile(previewPath, decoded, 0o644)
				}
				crop.PreviewBase64 = nil
			}
		}
	}

	data, err := json.MarshalIndent(song, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(filepath.Join(dir, "song.json"), data, 0o644)
}

// Delete removes a song directory.
func (s *SongStore) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	dir := s.songDir(id)
	if _, err := os.Stat(dir); os.IsNotExist(err) {
		return fmt.Errorf("song not found")
	}

	return os.RemoveAll(dir)
}

// GetPreview returns preview image bytes for a crop.
func (s *SongStore) GetPreview(songID, cropID string) ([]byte, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	path := filepath.Join(s.songDir(songID), fmt.Sprintf("preview_%s.png", cropID))
	return os.ReadFile(path)
}

// PreviewPath returns the file path for a crop preview image.
func (s *SongStore) PreviewPath(songID, cropID string) string {
	return filepath.Join(s.songDir(songID), fmt.Sprintf("preview_%s.png", cropID))
}

// migrateSong handles old data format migration.
func migrateSong(song *models.Song) {
	if song.Structure == nil {
		song.Structure = []models.Section{}
	}
	if song.Exercises == nil {
		song.Exercises = []models.Exercise{}
	}
	for i := range song.Exercises {
		ex := &song.Exercises[i]
		if ex.Crops == nil {
			ex.Crops = []models.Crop{}
		}
		if ex.Stage < 1 || ex.Stage > 5 {
			ex.Stage = 1
		}
		if ex.Difficulty < 1 || ex.Difficulty > 5 {
			ex.Difficulty = 1
		}
	}
}
