package handlers

import (
	"fmt"
	"image"
	"image/jpeg"
	"image/png"
	"os"
	"path/filepath"
	"strings"

	"github.com/LianHaeming/avoidnt/models"
)

// cropAndSave reads a source page image, crops it using normalized rect
// coordinates (0-1), and saves the result as a PNG file at outputPath.
func cropAndSave(pagePath string, rect models.Rect, outputPath string) error {
	f, err := os.Open(pagePath)
	if err != nil {
		return fmt.Errorf("open page: %w", err)
	}
	defer f.Close()

	var src image.Image
	ext := strings.ToLower(filepath.Ext(pagePath))
	switch ext {
	case ".png":
		src, err = png.Decode(f)
	case ".jpg", ".jpeg":
		src, err = jpeg.Decode(f)
	default:
		return fmt.Errorf("unsupported image format: %s", ext)
	}
	if err != nil {
		return fmt.Errorf("decode page: %w", err)
	}

	bounds := src.Bounds()
	imgW := bounds.Dx()
	imgH := bounds.Dy()

	// Convert normalized rect (0-1) to pixel coordinates
	x := int(rect.X * float64(imgW))
	y := int(rect.Y * float64(imgH))
	w := int(rect.W * float64(imgW))
	h := int(rect.H * float64(imgH))

	// Clamp to image bounds
	if x < 0 {
		x = 0
	}
	if y < 0 {
		y = 0
	}
	if x+w > imgW {
		w = imgW - x
	}
	if y+h > imgH {
		h = imgH - y
	}
	if w <= 0 || h <= 0 {
		return fmt.Errorf("invalid crop dimensions: %dx%d", w, h)
	}

	cropRect := image.Rect(x, y, x+w, y+h)

	// SubImage avoids copying pixels — just creates a view into the original
	type subImager interface {
		SubImage(r image.Rectangle) image.Image
	}
	sub, ok := src.(subImager)
	if !ok {
		return fmt.Errorf("source image does not support SubImage")
	}
	cropped := sub.SubImage(cropRect)

	// Write PNG
	os.MkdirAll(filepath.Dir(outputPath), 0o755)
	out, err := os.Create(outputPath)
	if err != nil {
		return fmt.Errorf("create output: %w", err)
	}
	defer out.Close()

	if err := png.Encode(out, cropped); err != nil {
		return fmt.Errorf("encode png: %w", err)
	}

	return nil
}
