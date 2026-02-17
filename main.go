package main

import (
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/LianHaeming/avoidnt/handlers"
	"github.com/LianHaeming/avoidnt/storage"
	"github.com/LianHaeming/avoidnt/tmpl"
)

func main() {
	// Configuration from environment (with sensible defaults)
	port := envOr("PORT", "8000")
	songsPath := envOr("SONGS_STORAGE_PATH", "data/songs")
	settingsPath := envOr("SETTINGS_PATH", "data/settings.json")
	pdfOutputPath := envOr("PDF_OUTPUT_PATH", "data/converted")
	openaiKey := envOr("OPENAI_API_KEY", "")

	// Initialize storage
	songStore := storage.NewSongStore(songsPath)
	settingsStore := storage.NewSettingsStore(settingsPath)
	jobStore := storage.NewJobStore(pdfOutputPath)

	// Parse templates
	templates := tmpl.Load()

	// Build handler dependencies
	deps := &handlers.Deps{
		Songs:     songStore,
		Settings:  settingsStore,
		Jobs:      jobStore,
		Templates: templates,
		OpenAIKey: openaiKey,
		PdfOutput: pdfOutputPath,
	}

	// Routes
	mux := http.NewServeMux()

	// Static files
	mux.Handle("GET /static/", http.StripPrefix("/static/", http.FileServer(http.Dir("static"))))

	// Pages (return full HTML)
	mux.HandleFunc("GET /", deps.HandleHome)
	mux.HandleFunc("GET /songs", deps.HandleSongsList)
	mux.HandleFunc("GET /songs/new", deps.HandlePlanDesignerNew)
	mux.HandleFunc("GET /songs/{songId}", deps.HandleSongDetail)
	mux.HandleFunc("GET /songs/{songId}/edit", deps.HandlePlanDesignerEdit)
	mux.HandleFunc("GET /settings", deps.HandleSettingsPage)

	// htmx partials + API endpoints
	mux.HandleFunc("GET /api/songs", deps.HandleSongsListPartial)
	mux.HandleFunc("POST /api/songs", deps.HandleSaveSong)
	mux.HandleFunc("DELETE /api/songs/{songId}", deps.HandleDeleteSong)
	mux.HandleFunc("PATCH /api/songs/{songId}/exercises/{exerciseId}", deps.HandlePatchExercise)
	mux.HandleFunc("PATCH /api/songs/{songId}/display", deps.HandlePatchSongDisplay)
	mux.HandleFunc("POST /api/songs/{songId}/regenerate-previews", deps.HandleRegeneratePreviews)
	mux.HandleFunc("GET /api/songs/{songId}/preview/{cropId}", deps.HandlePreview)

	// Settings
	mux.HandleFunc("GET /api/settings", deps.HandleGetSettings)
	mux.HandleFunc("PUT /api/settings", deps.HandleUpdateSettings)

	// PDF conversion
	mux.HandleFunc("POST /api/convert", deps.HandleConvertPDF)
	mux.HandleFunc("GET /api/pages/{jobId}/{pageNum}", deps.HandleGetPage)

	// AI analyze
	mux.HandleFunc("POST /api/analyze-pdf", deps.HandleAnalyzePDF)

	addr := fmt.Sprintf(":%s", port)
	log.Printf("🎸 Avoidnt listening on port %s", port)
	log.Fatal(http.ListenAndServe(addr, mux))
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
