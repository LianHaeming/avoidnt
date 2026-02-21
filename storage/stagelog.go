package storage

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"

	"github.com/LianHaeming/avoidnt/models"
)

// StageLogStore handles file-based stage change log persistence.
type StageLogStore struct {
	root string
	mu   sync.RWMutex
}

func NewStageLogStore(root string) *StageLogStore {
	return &StageLogStore{root: root}
}

func (s *StageLogStore) logPath(songID string) string {
	return filepath.Join(s.root, songID, "stage-log.json")
}

// GetAll returns all stage log entries for a song.
func (s *StageLogStore) GetAll(songID string) ([]models.StageLogEntry, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	return s.readLogs(songID)
}

// Append adds a new stage change entry.
func (s *StageLogStore) Append(songID string, entry models.StageLogEntry) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	logs, err := s.readLogs(songID)
	if err != nil {
		return err
	}

	logs = append(logs, entry)
	return s.writeLogs(songID, logs)
}

// HasLogs checks if a stage log file exists for a song.
func (s *StageLogStore) HasLogs(songID string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	_, err := os.Stat(s.logPath(songID))
	return err == nil
}

// BulkAppend adds multiple stage log entries at once.
func (s *StageLogStore) BulkAppend(songID string, entries []models.StageLogEntry) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	logs, err := s.readLogs(songID)
	if err != nil {
		return err
	}

	logs = append(logs, entries...)
	return s.writeLogs(songID, logs)
}

func (s *StageLogStore) readLogs(songID string) ([]models.StageLogEntry, error) {
	path := s.logPath(songID)
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return []models.StageLogEntry{}, nil
	}
	if err != nil {
		return nil, err
	}

	var logs []models.StageLogEntry
	if err := json.Unmarshal(data, &logs); err != nil {
		return nil, err
	}
	return logs, nil
}

func (s *StageLogStore) writeLogs(songID string, logs []models.StageLogEntry) error {
	dir := filepath.Dir(s.logPath(songID))
	os.MkdirAll(dir, 0o755)

	data, err := json.MarshalIndent(logs, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.logPath(songID), data, 0o644)
}
