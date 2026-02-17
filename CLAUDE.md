# Avoidnt — Guitar Practice Tracker

## Build & Run

```bash
go build -o avoidnt .
go run .                          # starts on :8000
PDF_OUTPUT_PATH=data/converted go run .  # with PDF conversion output
```

Requires **mutool** (mupdf-tools) or **pdftoppm** (poppler) on PATH for PDF conversion.

## Architecture

Go stdlib HTTP server, Go 1.22+ `mux.HandleFunc("METHOD /path", handler)` syntax. No router framework.

| Layer | Location | Notes |
|-------|----------|-------|
| Routes | `main.go` | All routes + dep wiring |
| Handlers | `handlers/` | Methods on `*handlers.Deps` |
| Models | `models/` | Pure structs, no DB |
| Storage | `storage/` | Flat-file JSON under `data/`, uses `sync.RWMutex` |
| Templates | `tmpl/loader.go` + `templates/` | `html/template` with layout/partial cloning |
| Frontend | `static/js/`, `static/css/` | Vanilla JS + htmx, no build step |

## Key Conventions

- **No database** — all persistence is JSON files under `data/`
- **Handler pattern** — every handler is a method on `*Deps`. Page handlers call `d.render(w, "template.html", data)`. API handlers use `jsonOK(w, data)` / `jsonError(w, msg, code)`
- **htmx partials** — `GET /api/*` routes return HTML fragments for htmx swaps, not JSON
- **JSON APIs** — `POST/PUT/PATCH/DELETE /api/*` return `{"success": true}` or `{"error": "..."}`
- **Template system** — `tmpl/loader.go` clones a shared base (layout + partials) per page template so `{{define "content"}}` blocks don't collide
- **ID generation** — `handlers/pdf.go:generateID()` produces 32-char random hex strings
- **Song save merges practice data** — `HandleSaveSong` merges exercise practice stats from existing song before overwriting
- **Data migration** — `storage/songs.go:migrateSong()` normalizes legacy data on read
- **Cache busting** — static assets use `?v=N` query strings in templates. IMPORTANT: bump version numbers when changing CSS/JS
- **5 practice stages** (1–5) with color coding in `models/helpers.go` and `tmpl/loader.go`

## Data Flow

Songs: `data/songs/{songId}/song.json` with sibling `preview_{cropId}.png` files.
On save, base64 crop previews are decoded from JSON payload → written as PNGs → stripped from stored JSON.
PDF pages: `data/converted/{jobId}/page_{n}.jpg`.

## Environment Variables

| Var | Default | Purpose |
|-----|---------|---------|
| `PORT` | `8000` | HTTP listen port |
| `SONGS_STORAGE_PATH` | `data/songs` | Song JSON + preview dir |
| `SETTINGS_PATH` | `data/settings.json` | User settings file |
| `PDF_OUTPUT_PATH` | `data/converted` | Converted PDF images |
| `OPENAI_API_KEY` | _(empty)_ | Sheet music AI analysis |

## CSS Debugging Rule

IMPORTANT: Always grep for ALL instances of a CSS class/selector across the entire stylesheet before diagnosing or fixing a styling issue. Duplicate rules in different parts of `app.css` can override each other.

## No Tests

There is no test framework set up. No test files exist in this project.
