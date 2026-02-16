package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
)

// generateID creates a random hex ID (similar to uuid4().hex).
func generateID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}

// convertPDF converts PDF bytes to JPEG page images using mutool.
// Falls back to pdftoppm if mutool is not available.
// Returns the number of pages converted.
func convertPDF(pdfBytes []byte, outputDir string) (int, error) {
	os.MkdirAll(outputDir, 0o755)

	// Write PDF to temp file
	tmpFile := filepath.Join(outputDir, "input.pdf")
	if err := os.WriteFile(tmpFile, pdfBytes, 0o644); err != nil {
		return 0, fmt.Errorf("failed to write temp PDF: %w", err)
	}
	defer os.Remove(tmpFile)

	// Try mutool first
	if path, err := exec.LookPath("mutool"); err == nil {
		return convertWithMutool(path, tmpFile, outputDir)
	}

	// Try pdftoppm (poppler)
	if path, err := exec.LookPath("pdftoppm"); err == nil {
		return convertWithPdftoppm(path, tmpFile, outputDir)
	}

	return 0, fmt.Errorf("no PDF converter found: install mupdf-tools (mutool) or poppler (pdftoppm)")
}

func convertWithMutool(mutoolPath, pdfPath, outputDir string) (int, error) {
	// mutool convert -o output/page_%d.png -O resolution=288 input.pdf
	outPattern := filepath.Join(outputDir, "page_%d.png")
	cmd := exec.Command(mutoolPath, "convert", "-o", outPattern, "-O", "resolution=288", pdfPath)
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return 0, fmt.Errorf("mutool failed: %w", err)
	}

	return countPages(outputDir), nil
}

func convertWithPdftoppm(pdftoppmPath, pdfPath, outputDir string) (int, error) {
	// pdftoppm -png -r 288 input.pdf output/page
	prefix := filepath.Join(outputDir, "page")
	cmd := exec.Command(pdftoppmPath, "-png", "-r", "288", pdfPath, prefix)
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return 0, fmt.Errorf("pdftoppm failed: %w", err)
	}

	// pdftoppm outputs page-1.png, page-2.png etc. Rename to page_1.png format.
	entries, _ := os.ReadDir(outputDir)
	for _, e := range entries {
		name := e.Name()
		if strings.HasPrefix(name, "page-") && strings.HasSuffix(name, ".png") {
			// Extract number
			numStr := strings.TrimPrefix(name, "page-")
			numStr = strings.TrimSuffix(numStr, ".png")
			newName := fmt.Sprintf("page_%s.png", numStr)
			os.Rename(filepath.Join(outputDir, name), filepath.Join(outputDir, newName))
		}
	}

	return countPages(outputDir), nil
}

func countPages(dir string) int {
	entries, _ := os.ReadDir(dir)
	count := 0
	for _, e := range entries {
		name := e.Name()
		if strings.HasPrefix(name, "page_") && (strings.HasSuffix(name, ".jpg") || strings.HasSuffix(name, ".png")) {
			count++
		}
	}
	return count
}

// listPageFiles returns sorted page file paths.
func listPageFiles(dir string) []string {
	entries, _ := os.ReadDir(dir)
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
