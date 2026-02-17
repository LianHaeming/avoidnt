package storage

import (
	"encoding/json"
	"log"
	"os"
	"path/filepath"
	"sync"

	"github.com/LianHaeming/avoidnt/models"
)

// SettingsStore handles file-based settings persistence.
type SettingsStore struct {
	path string
	mu   sync.RWMutex
}

func NewSettingsStore(path string) *SettingsStore {
	os.MkdirAll(filepath.Dir(path), 0o755)
	return &SettingsStore{path: path}
}

// Get returns user settings, or defaults if file doesn't exist.
func (s *SettingsStore) Get() models.UserSettings {
	s.mu.RLock()
	defer s.mu.RUnlock()

	data, err := os.ReadFile(s.path)
	if err != nil {
		if !os.IsNotExist(err) {
			log.Printf("Warning: could not read settings: %v", err)
		}
		return models.DefaultSettings()
	}

	var settings models.UserSettings
	if err := json.Unmarshal(data, &settings); err != nil {
		log.Printf("Warning: invalid settings JSON: %v", err)
		return models.DefaultSettings()
	}

	// Ensure stageNames has exactly 5 entries
	if len(settings.StageNames) != 5 {
		settings.StageNames = models.DefaultSettings().StageNames
	}
	if settings.Theme != "light" && settings.Theme != "dark" {
		settings.Theme = "light"
	}
	if settings.DisplayName == "" {
		settings.DisplayName = models.DefaultSettings().DisplayName
	}

	return settings
}

// Save persists user settings to disk.
func (s *SettingsStore) Save(settings models.UserSettings) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(s.path, data, 0o644)
}
