package storage

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// JobStore manages PDF conversion job output directories.
type JobStore struct {
	root string
}

func NewJobStore(root string) *JobStore {
	os.MkdirAll(root, 0o755)
	return &JobStore{root: root}
}

// CreateJobDir creates and returns the path for a new job.
func (j *JobStore) CreateJobDir(jobID string) (string, error) {
	dir := filepath.Join(j.root, jobID)
	return dir, os.MkdirAll(dir, 0o755)
}

// GetPagePath returns the path to a page image (prefers JPEG, falls back to PNG).
func (j *JobStore) GetPagePath(jobID string, pageNum int) (string, error) {
	dir := filepath.Join(j.root, jobID)

	jpgPath := filepath.Join(dir, fmt.Sprintf("page_%d.jpg", pageNum))
	if _, err := os.Stat(jpgPath); err == nil {
		return jpgPath, nil
	}

	pngPath := filepath.Join(dir, fmt.Sprintf("page_%d.png", pageNum))
	if _, err := os.Stat(pngPath); err == nil {
		return pngPath, nil
	}

	return "", fmt.Errorf("page not found: job=%s page=%d", jobID, pageNum)
}

// GetPageCount returns the number of page images in a job directory.
func (j *JobStore) GetPageCount(jobID string) int {
	dir := filepath.Join(j.root, jobID)
	entries, err := os.ReadDir(dir)
	if err != nil {
		return 0
	}

	count := 0
	for _, e := range entries {
		name := e.Name()
		if strings.HasPrefix(name, "page_") && (strings.HasSuffix(name, ".jpg") || strings.HasSuffix(name, ".png")) {
			count++
		}
	}
	return count
}

// ListPagePaths returns sorted page file paths for a job.
func (j *JobStore) ListPagePaths(jobID string) []string {
	dir := filepath.Join(j.root, jobID)
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}

	var pages []string
	for _, e := range entries {
		name := e.Name()
		if strings.HasPrefix(name, "page_") && (strings.HasSuffix(name, ".jpg") || strings.HasSuffix(name, ".png")) {
			pages = append(pages, filepath.Join(dir, name))
		}
	}
	sort.Strings(pages)
	return pages
}
