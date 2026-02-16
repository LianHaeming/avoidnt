# Copilot Instructions — Avoidnt

## What This Is

A **guitar practice tracker** web app. Users upload sheet music PDFs, crop regions into exercises, organize them into song sections, and track practice progress through 5 stages. Built as a single Go binary with server-rendered HTML + htmx for interactivity. Deployed on Railway via Dockerfile.

## Architecture

**Go stdlib HTTP server** — no router framework; uses Go 1.22+ `mux.HandleFunc("METHOD /path", handler)` syntax.

| Layer | Location | Role |
|-------|----------|------|
| Entrypoint & routes | `main.go` | Wires all deps, defines every route |
| Handlers | `handlers/` | All handlers are methods on `*handlers.Deps` (dependency struct pattern) |
| Domain models | `models/` | Pure structs + helpers, no DB dependency |
| Storage | `storage/` | File-system JSON persistence (no database) |
| Templates | `tmpl/loader.go` + `templates/` | Go `html/template` with layout/partial cloning |
| Frontend | `static/js/`, `static/css/` | Vanilla JS + htmx, no build step |

### Key Data Flow

Songs are stored as `data/songs/{songId}/song.json` with sibling `preview_{cropId}.png` files. On save, base64 crop previews are decoded from the JSON payload, written as PNGs, and stripped from the stored JSON. PDF pages live under `data/converted/{jobId}/page_{n}.jpg`.

### Dependency Injection

All handlers receive dependencies through `*handlers.Deps` (defined in `handlers/deps.go`). New storage backends or services should be added as fields on `Deps` and initialized in `main.go`.

## Development

```sh
# Run locally (port 8000 by default)
go run .

# Build binary
go build -o avoidnt .

# VS Code tasks are configured (see .vscode/tasks.json):
#   "Go Build" — builds the binary
#   "Go Run"  — runs with PDF_OUTPUT_PATH=data/converted
```

### Environment Variables

| Var | Default | Purpose |
|-----|---------|---------|
| `PORT` | `8000` | HTTP listen port |
| `SONGS_STORAGE_PATH` | `data/songs` | Song JSON + preview directory |
| `SETTINGS_PATH` | `data/settings.json` | User settings file |
| `PDF_OUTPUT_PATH` | `data/converted` | Converted PDF page images |
| `OPENAI_API_KEY` | _(empty)_ | Required for sheet music AI analysis |

### External Tool Dependency

PDF conversion requires **mutool** (mupdf-tools) or **pdftoppm** (poppler) on the system PATH. The code tries mutool first, falls back to pdftoppm (`handlers/pdf.go`).

## Conventions & Patterns

- **No ORM/database** — all persistence is flat-file JSON under `data/`. Storage types use `sync.RWMutex` for concurrency safety.
- **Handler pattern** — every handler is a method on `*Deps`. Page handlers call `d.render(w, "template.html", data)`. API handlers use `jsonOK(w, data)` / `jsonError(w, msg, code)`.
- **Template system** — `tmpl/loader.go` clones a shared base (layout + partials) per page template so `{{define "content"}}` blocks don't collide. Partials under `templates/partials/` can be rendered directly for htmx responses. Rich `FuncMap` includes `stageColor`, `relativeTime`, `json`, `deref`, `seq`, etc.
- **htmx partials** — routes like `GET /api/songs` return HTML fragments (rendered via partial templates) for htmx swaps; they are _not_ JSON APIs despite the `/api/` prefix.
- **JSON APIs** — `POST/PUT/PATCH/DELETE` endpoints under `/api/` return `{"success": true}` or `{"error": "..."}` JSON.
- **ID generation** — `handlers/pdf.go:generateID()` produces 32-char random hex strings (like UUID4 hex).
- **Song save preserves practice data** — `HandleSaveSong` merges exercise practice stats (`stage`, `totalPracticedSeconds`, etc.) from the existing song before overwriting.
- **Data migration** — `storage/songs.go:migrateSong()` normalizes legacy data on read (nil slices → empty, stage/difficulty clamped to 1–5).
- **5 practice stages** (1–5) with color coding defined in both `models/helpers.go` and `tmpl/loader.go`. Stage names are user-configurable via settings.
- **No test framework** is set up — there are no test files in the project.
