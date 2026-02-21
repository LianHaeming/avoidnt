package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/LianHaeming/avoidnt/handlers"
	"github.com/LianHaeming/avoidnt/storage"
	"github.com/LianHaeming/avoidnt/tmpl"
)

// BuildVersion is set at compile time via -ldflags.
// If empty (local dev), falls back to a timestamp so assets are never cached.
var BuildVersion string

func main() {
	// Resolve asset version for cache-busting
	assetVer := BuildVersion
	if assetVer == "" {
		assetVer = strconv.FormatInt(time.Now().Unix(), 10)
	}

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
	dailyLogStore := storage.NewDailyLogStore(songsPath)
	stageLogStore := storage.NewStageLogStore(songsPath)

	// Parse templates
	templates := tmpl.Load(assetVer)

	// Build handler dependencies
	deps := &handlers.Deps{
		Songs:     songStore,
		Settings:  settingsStore,
		Jobs:      jobStore,
		DailyLogs: dailyLogStore,
		StageLogs: stageLogStore,
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
	mux.HandleFunc("GET /songs/{songId}/edit", deps.HandleSongDetailEdit)
	mux.HandleFunc("GET /settings", deps.HandleSettingsPage)

	// htmx partials + API endpoints
	mux.HandleFunc("GET /api/songs", deps.HandleSongsListPartial)
	mux.HandleFunc("POST /api/songs", deps.HandleSaveSong)
	mux.HandleFunc("DELETE /api/songs/{songId}", deps.HandleDeleteSong)
	mux.HandleFunc("PATCH /api/songs/{songId}/exercises/{exerciseId}", deps.HandlePatchExercise)
	mux.HandleFunc("PATCH /api/songs/{songId}/display", deps.HandlePatchSongDisplay)
	mux.HandleFunc("POST /api/songs/{songId}/regenerate-previews", deps.HandleRegeneratePreviews)
	mux.HandleFunc("PUT /api/songs/{songId}/similarity-groups", deps.HandleSaveSimilarityGroups)
	mux.HandleFunc("GET /api/songs/{songId}/preview/{cropId}", deps.HandlePreview)

	// Daily log & stage log
	mux.HandleFunc("GET /api/songs/{songId}/daily-log", deps.HandleGetDailyLog)
	mux.HandleFunc("PATCH /api/songs/{songId}/daily-log", deps.HandlePatchDailyLog)
	mux.HandleFunc("GET /api/songs/{songId}/stage-log", deps.HandleGetStageLog)
	mux.HandleFunc("POST /api/songs/{songId}/transitions", deps.HandleToggleTransition)
	mux.HandleFunc("GET /api/songs/{songId}/stats/recommend", deps.HandleGetRecommendations)

	// Settings
	mux.HandleFunc("GET /api/settings", deps.HandleGetSettings)
	mux.HandleFunc("PUT /api/settings", deps.HandleUpdateSettings)

	// PDF conversion
	mux.HandleFunc("POST /api/convert", deps.HandleConvertPDF)
	mux.HandleFunc("GET /api/pages/{jobId}/{pageNum}", deps.HandleGetPage)

	// AI analyze
	mux.HandleFunc("POST /api/analyze-pdf", deps.HandleAnalyzePDF)
	mux.HandleFunc("POST /api/label-exercises", deps.HandleLabelExercises)

	addr := fmt.Sprintf(":%s", port)
	log.Printf("Avoidnt listening on http://localhost:%s", port)
	log.Fatal(http.ListenAndServe(addr, mux))
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
