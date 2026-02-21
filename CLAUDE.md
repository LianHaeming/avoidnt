# Avoidnt — Guitar Practice Tracker

## Build & Run

```bash
go build -o avoidnt .
go run .                          # starts on :8000
PDF_OUTPUT_PATH=data/converted go run .  # with PDF conversion output
```

Requires **mutool** (mupdf-tools) or **pdftoppm** (poppler) on PATH for PDF conversion.

Deployed on **Railway** via Dockerfile (`railway.json` config). Build version is injected via `-ldflags "-X main.BuildVersion=..."` for cache-busting (falls back to Unix timestamp in dev).

## Architecture

Go 1.24, stdlib HTTP server, Go 1.22+ `mux.HandleFunc("METHOD /path", handler)` syntax. No router framework. Zero external Go dependencies (`go.mod` has no `require` block).

| Layer | Location | Notes |
|-------|----------|-------|
| Routes | `main.go` | All routes + dep wiring |
| Handlers | `handlers/` | Methods on `*handlers.Deps` |
| Models | `models/` | Pure structs + helpers, no DB |
| Storage | `storage/` | Flat-file JSON under `data/`, uses `sync.RWMutex` |
| Templates | `tmpl/loader.go` + `templates/` | `html/template` with layout/partial cloning |
| Frontend | `static/js/`, `static/css/` | Vanilla JS + htmx, no build step |
| Docs | `docs/` | Design docs and planning notes |

## Key Conventions

- **No database** — all persistence is JSON files under `data/`
- **Handler pattern** — every handler is a method on `*Deps` (defined in `handlers/deps.go`). Page handlers call `d.render(w, "template.html", data)`. API handlers use `jsonOK(w, data)` / `jsonError(w, msg, code)` (both defined in `handlers/api.go`)
- **htmx partials** — `GET /api/songs` returns HTML fragment via `partials/song-rows.html` for htmx search. Other `GET /api/*` routes return JSON
- **JSON APIs** — `POST/PUT/PATCH/DELETE /api/*` return `{"success": true}` or `{"error": "..."}`
- **Template system** — `tmpl/loader.go` clones a shared base (layout + partials) per page template so `{{define "content"}}` blocks don't collide. Partials render via their inner define name, pages render via `"layout"`
- **ID generation** — `handlers/pdf.go:generateID()` produces 32-char random hex strings
- **Song save merges practice data** — `HandleSaveSong` merges exercise practice stats (stage, totalPracticedSeconds, totalReps, lastPracticedAt, cropScale) from existing song before overwriting
- **Data migration** — `storage/songs.go:migrateSong()` normalizes legacy data on read (nil slices → empty, stage/difficulty clamped to 1–5)
- **Lazy log migration** — `handlers/song_detail.go:migrateExistingData()` creates synthetic daily-log and stage-log entries from cumulative exercise data on first song detail load
- **Cache busting** — static assets use `?v={{assetVer}}` in templates. In dev, assetVer is a Unix timestamp. In production, it's the git commit hash. IMPORTANT: bump version numbers when changing CSS/JS
- **5 practice stages** (1–5) with color coding: Red → Orange → Yellow → Lime → Green. Defined in both `models/helpers.go` and `tmpl/loader.go`

## Route Map

### Pages (full HTML)
| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/` | `HandleHome` | Redirects to `/songs` |
| GET | `/songs` | `HandleSongsList` | Song library with "Continue Practicing" / "Needs Attention" rows |
| GET | `/songs/new` | `HandlePlanDesignerNew` | Plan Designer (create mode) |
| GET | `/songs/{songId}` | `HandleSongDetail` | Song detail / practice page |
| GET | `/songs/{songId}/edit` | `HandleSongDetailEdit` | Redirects to song detail with `?edit=1` |
| GET | `/settings` | `HandleSettingsPage` | User settings |

### API (JSON responses)
| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| GET | `/api/songs` | `HandleSongsListPartial` | htmx partial for song search |
| POST | `/api/songs` | `HandleSaveSong` | Create/update a song |
| DELETE | `/api/songs/{songId}` | `HandleDeleteSong` | Delete a song |
| PATCH | `/api/songs/{songId}/exercises/{exerciseId}` | `HandlePatchExercise` | Update exercise (stage, time, reps, crop settings) |
| PATCH | `/api/songs/{songId}/display` | `HandlePatchSongDisplay` | Update song display settings (bg color, hide toggles) |
| POST | `/api/songs/{songId}/regenerate-previews` | `HandleRegeneratePreviews` | Re-crop previews from source pages |
| PUT | `/api/songs/{songId}/similarity-groups` | `HandleSaveSimilarityGroups` | Replace similarity groups (syncs identical groups) |
| GET | `/api/songs/{songId}/preview/{cropId}` | `HandlePreview` | Serve crop preview PNG |
| GET | `/api/songs/{songId}/daily-log` | `HandleGetDailyLog` | Get daily practice logs (?from=&to= optional) |
| PATCH | `/api/songs/{songId}/daily-log` | `HandlePatchDailyLog` | Upsert daily log entry |
| GET | `/api/songs/{songId}/stage-log` | `HandleGetStageLog` | Get stage change history |
| POST | `/api/songs/{songId}/transitions` | `HandleToggleTransition` | Create/toggle transition exercises |
| GET | `/api/songs/{songId}/stats/recommend` | `HandleGetRecommendations` | AI-style practice recommendations |
| GET | `/api/settings` | `HandleGetSettings` | Get user settings JSON |
| PUT | `/api/settings` | `HandleUpdateSettings` | Update settings (theme, stageNames, displayName) |
| POST | `/api/convert` | `HandleConvertPDF` | Upload PDF → page images (multipart, 50MB max) |
| GET | `/api/pages/{jobId}/{pageNum}` | `HandleGetPage` | Serve converted PDF page image |
| POST | `/api/analyze-pdf` | `HandleAnalyzePDF` | OpenAI vision: extract title/artist/tempo/sections |
| POST | `/api/label-exercises` | `HandleLabelExercises` | OpenAI vision: auto-label exercises with names/sections |

## Data Model

### Song (`models/song.go`)
Top-level entity. Contains metadata, structure (sections), exercises, similarity groups, and display settings.

Key fields: `ID`, `Title`, `Artist`, `Tempo`, `YoutubeURL`, `SpotifyURL`, `JobID` (links to PDF pages), `PageCount`, `Structure` (sections), `Exercises`, `SimilarityGroups`, display toggles (`HideTitles`, `HideControls`, `HideDividers`, `HideStages`, `HideCards`, `CropBgColor`).

### Exercise (`models/song.go`)
Belongs to a song. Contains crops (sheet music regions), practice data, and optional transition metadata.

Key fields: `ID`, `Name`, `SectionID`, `Difficulty` (1–5), `Stage` (1–5), `Crops`, `TotalPracticedSeconds`, `TotalReps`, `LastPracticedAt`, `CropScale`/`CropAlign`/`CropFit` (display), `IsTransition`, `TransitionBetween` ([2]string), `IsTracked`.

### Crop (`models/song.go`)
A region within a sheet music page. Coordinates are normalized 0–1 (`Rect`). Has optional `PreviewBase64` (stripped on save, written to disk as PNG).

### SimilarityGroup (`models/song.go`)
Links exercises that share practice transfer. Type is `"identical"` (full sync of stage/time/reps) or `"similar"` (80% time transfer for recommendations).

### Section (`models/song.go`)
Song structure element (e.g., Intro, Verse, Chorus). Has `ID`, `Type`, `Order`.

### DailyLog / StageLog (`models/dailylog.go`, `models/stagelog.go`)
Per-song practice tracking. Daily logs record seconds + reps per exercise per date. Stage logs record stage transitions with timestamps.

### UserSettings (`models/settings.go`)
Theme (`"light"` / `"dark"`), StageNames (5 custom names), DisplayName. Defaults: light theme, stages "Not started" → "Mastered", display name "Lian".

## Data Flow

### File Structure
```
data/
  songs/{songId}/
    song.json              # Song data (exercises, structure, etc.)
    preview_{cropId}.png   # Cropped exercise images
    daily-log.json         # Practice time/reps per day
    stage-log.json         # Stage change history
  settings.json            # User preferences
  converted/{jobId}/
    page_{n}.png           # Converted PDF pages (288 DPI)
```

### Song Save Flow
1. Client POSTs song JSON to `/api/songs` (may include base64 crop previews)
2. `HandleSaveSong` merges practice data from existing song (preserves stage, time, reps, cropScale, cropBgColor)
3. `SongStore.Save()` extracts base64 previews → writes as PNGs → strips from stored JSON
4. Song JSON written to `data/songs/{songId}/song.json`

### Practice Timer Flow
1. User clicks play on exercise card → `timer.js:cardStartTimer()` starts 1s interval
2. Every 30s (or on pause/unload), saves to both:
   - `PATCH /api/songs/{songId}/exercises/{exerciseId}` (cumulative totals)
   - `PATCH /api/songs/{songId}/daily-log` (incremental delta)
3. Timer auto-pauses after 2 minutes of inactivity

### Similarity Group Sync
- **Identical groups**: When any exercise in the group is updated (stage, time, reps), all members sync to the same values. On group save, all members get the best values.
- **Similar groups**: 80% time transfer used only for recommendation priority scoring.

### Recommendation Engine (`handlers/stats.go:HandleGetRecommendations`)
Priority scoring: `(5 - stage) * 10` base, adjusted by similarity transfer ratio, positional imbalance vs song average stage, decay nudge (days since practiced, max +5), transition bonus/penalty. Returns top 5 recommendations with suggested minutes. Appends "Full run-through" if 3+ recommendations.

## Frontend

### JavaScript Files
| File | Purpose |
|------|---------|
| `static/js/app.js` (~1020 lines) | Settings, theme, song list, song detail page logic (stage changes, display settings, card expansion, crop zoom/pan/resize) |
| `static/js/plan-designer.js` (~1700 lines) | IIFE. PDF upload, crop drawing, exercise management, section assignment, AI autofill, save flow |
| `static/js/song-edit.js` (~1470 lines) | IIFE. Inline edit mode on song detail page (crop drawing, section management, exercise CRUD) |
| `static/js/stats-drawer.js` (~1045 lines) | Stats drawer: health bar, weekly chart (Canvas), heat map, similarity groups, recommendations |
| `static/js/timer.js` (~178 lines) | Practice timer with auto-save, rep counting, inactivity detection |
| `static/js/htmx.min.js` | htmx library (vendored) |

### CSS
Single file: `static/css/app.css` (~3260 lines). IMPORTANT: Always grep for ALL instances of a CSS class/selector across the entire stylesheet before diagnosing or fixing a styling issue. Duplicate rules in different parts of `app.css` can override each other.

### Templates
| File | Description |
|------|-------------|
| `templates/layout.html` | Base layout with nav, app shell, dark mode |
| `templates/songs.html` | Song library page (Continue Practicing, Needs Attention, All Songs) |
| `templates/song-detail.html` | Song practice page with exercise cards |
| `templates/plan-designer.html` | PDF upload + crop + exercise builder |
| `templates/settings.html` | Settings page |
| `templates/partials/song-rows.html` | htmx partial for song list search |
| `templates/partials/settings-modal.html` | Settings modal partial |

### Template Functions (defined in `tmpl/loader.go`)
`assetVer`, `mul`, `pct`, `itoa`, `add`, `sub`, `pctFloat`, `lower`, `upper`, `capitalize`, `contains`, `join`, `trimSpace`, `firstChar`, `stageColor`, `hexToRGBA`, `stageTint`, `stageBorder`, `stageText`, `relativeTime`, `formatDuration`, `formatTimer`, `deref`, `derefStr`, `derefFloat`, `isNil`, `notNil`, `notNilInt`, `seq`, `json`, `safeCSS`, `safeURL`

## Environment Variables

| Var | Default | Purpose |
|-----|---------|---------|
| `PORT` | `8000` | HTTP listen port |
| `SONGS_STORAGE_PATH` | `data/songs` | Song JSON + preview dir |
| `SETTINGS_PATH` | `data/settings.json` | User settings file |
| `PDF_OUTPUT_PATH` | `data/converted` | Converted PDF images |
| `OPENAI_API_KEY` | _(empty)_ | OpenAI GPT-4o for sheet music analysis + exercise labeling |

## AI Integration

Two OpenAI GPT-4o vision endpoints:
1. **Analyze PDF** (`POST /api/analyze-pdf`): Extracts title, artist, tempo, sections from up to 4 page images. Uses `detail: "low"`.
2. **Label Exercises** (`POST /api/label-exercises`): Auto-labels exercises with names and section assignments from up to 10 page images. Uses `detail: "low"`, temperature 0.2. Returns confidence levels (high/medium/low).

Both accept either inline base64 `pageImages` or a `jobId` + `pageCount` to load from disk.

## No Tests

There is no test framework set up. No test files exist in this project.
