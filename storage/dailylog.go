package storage

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"

	"github.com/LianHaeming/avoidnt/models"
)

// DailyLogStore handles file-based daily practice log persistence.
type DailyLogStore struct {
	root string
	mu   sync.RWMutex
}

func NewDailyLogStore(root string) *DailyLogStore {
	return &DailyLogStore{root: root}
}

func (s *DailyLogStore) logPath(songID string) string {
	return filepath.Join(s.root, songID, "daily-log.json")
}

// GetAll returns all daily logs for a song.
func (s *DailyLogStore) GetAll(songID string) ([]models.DailyLog, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	return s.readLogs(songID)
}

// GetRange returns daily logs within a date range (inclusive).
func (s *DailyLogStore) GetRange(songID, from, to string) ([]models.DailyLog, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	all, err := s.readLogs(songID)
	if err != nil {
		return nil, err
	}

	var filtered []models.DailyLog
	for _, dl := range all {
		if dl.Date >= from && dl.Date <= to {
			filtered = append(filtered, dl)
		}
	}
	return filtered, nil
}

// Upsert adds seconds and reps for an exercise on a given date.
// If the date or exercise entry doesn't exist, it creates it.
func (s *DailyLogStore) Upsert(songID, date, exerciseID string, seconds, reps int) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	logs, err := s.readLogs(songID)
	if err != nil {
		return err
	}

	// Find or create the day
	dayIdx := -1
	for i, dl := range logs {
		if dl.Date == date {
			dayIdx = i
			break
		}
	}

	if dayIdx == -1 {
		logs = append(logs, models.DailyLog{
			Date:    date,
			Entries: []models.DailyLogEntry{},
		})
		dayIdx = len(logs) - 1
	}

	// Find or create the exercise entry
	entryIdx := -1
	for i, e := range logs[dayIdx].Entries {
		if e.ExerciseID == exerciseID {
			entryIdx = i
			break
		}
	}

	if entryIdx == -1 {
		logs[dayIdx].Entries = append(logs[dayIdx].Entries, models.DailyLogEntry{
			ExerciseID: exerciseID,
			Seconds:    seconds,
			Reps:       reps,
		})
	} else {
		logs[dayIdx].Entries[entryIdx].Seconds += seconds
		logs[dayIdx].Entries[entryIdx].Reps += reps
	}

	return s.writeLogs(songID, logs)
}

// HasLogs checks if a daily log file exists for a song.
func (s *DailyLogStore) HasLogs(songID string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	_, err := os.Stat(s.logPath(songID))
	return err == nil
}

func (s *DailyLogStore) readLogs(songID string) ([]models.DailyLog, error) {
	path := s.logPath(songID)
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return []models.DailyLog{}, nil
	}
	if err != nil {
		return nil, err
	}

	var logs []models.DailyLog
	if err := json.Unmarshal(data, &logs); err != nil {
		return nil, err
	}
	return logs, nil
}

func (s *DailyLogStore) writeLogs(songID string, logs []models.DailyLog) error {
	dir := filepath.Join(s.root, songID)
	os.MkdirAll(dir, 0o755)

	data, err := json.MarshalIndent(logs, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.logPath(songID), data, 0o644)
}
