# Plan Designer — Complete Documentation

The **Plan Designer** is the primary authoring interface in Avoidnt. It is used to create new songs and edit existing ones. Users upload a sheet music PDF, visually crop regions of the PDF into exercises, organize those exercises into song sections, and assign metadata — all through a two-panel WYSIWYG interface.

---

## Table of Contents

1. [Feature Overview](#1-feature-overview)
2. [User-Facing Behaviour](#2-user-facing-behaviour)
   - [Two Modes: Create & Edit](#21-two-modes-create--edit)
   - [Two-Column Layout](#22-two-column-layout)
   - [PDF Upload & Viewing](#23-pdf-upload--viewing)
   - [Crop Drawing](#24-crop-drawing)
   - [Song Header (WYSIWYG)](#25-song-header-wysiwyg)
   - [Section Management](#26-section-management)
   - [Exercise Cards](#27-exercise-cards)
   - [Crop Display Controls](#28-crop-display-controls)
   - [AI Auto-fill](#29-ai-auto-fill)
   - [Saving & Navigation](#210-saving--navigation)
   - [Resizable Panels](#211-resizable-panels)
   - [Zoom Controls](#212-zoom-controls)
3. [Routes](#3-routes)
4. [Backend Code](#4-backend-code)
   - [Handler: `plan_designer.go`](#41-handler-plan_designergo)
   - [Template Data: `PlanDesignerData`](#42-template-data-plandesignerdata)
   - [Save Endpoint: `HandleSaveSong`](#43-save-endpoint-handlesavesong)
   - [AI Endpoint: `HandleAnalyzePDF`](#44-ai-endpoint-handleanalyzepdf)
   - [PDF Conversion: `HandleConvertPDF`](#45-pdf-conversion-handleconvertpdf)
   - [Preview Serving: `HandlePreview`](#46-preview-serving-handlepreview)
   - [Page Serving: `HandleGetPage`](#47-page-serving-handlegetpage)
5. [Domain Models](#5-domain-models)
   - [`Song`](#51-song)
   - [`Section`](#52-section)
   - [`Exercise`](#53-exercise)
   - [`Crop`](#54-crop)
   - [`Rect`](#55-rect)
   - [`UserSettings`](#56-usersettings)
   - [`SongSummary`](#57-songsummary)
6. [Frontend Code (`plan-designer.js`)](#6-frontend-code-plan-designerjs)
   - [Constants](#61-constants)
   - [Client-Side State](#62-client-side-state)
   - [Initialization & Loading](#63-initialization--loading)
   - [WYSIWYG Header Rendering](#64-wysiwyg-header-rendering)
   - [Inline Field Editing](#65-inline-field-editing)
   - [Section Pill Rendering](#66-section-pill-rendering)
   - [Page Image Loading](#67-page-image-loading)
   - [Crop Drawing System](#68-crop-drawing-system)
   - [Crop Overlay Rendering](#69-crop-overlay-rendering)
   - [Exercise Rendering & Grouping](#610-exercise-rendering--grouping)
   - [Exercise Card Builder](#611-exercise-card-builder)
   - [Exercise Interactions](#612-exercise-interactions)
   - [Crop Background Color](#613-crop-background-color)
   - [Crop Resize (Drag Handle)](#614-crop-resize-drag-handle)
   - [PDF Upload](#615-pdf-upload)
   - [AI Auto-fill](#616-ai-auto-fill)
   - [Zoom](#617-zoom)
   - [Save Logic](#618-save-logic)
   - [Discard / Navigation Guard](#619-discard--navigation-guard)
   - [Helper Functions](#620-helper-functions)
7. [Template (`plan-designer.html`)](#7-template-plan-designerhtml)
   - [Root Element & Data Attributes](#71-root-element--data-attributes)
   - [Left Column (PDF Viewer)](#72-left-column-pdf-viewer)
   - [Right Column (Editor)](#73-right-column-editor)
8. [CSS Classes & Styling](#8-css-classes--styling)
9. [Data Flow Diagrams](#9-data-flow-diagrams)
   - [Create Flow](#91-create-flow)
   - [Edit Flow](#92-edit-flow)
   - [Save Flow](#93-save-flow)
10. [Storage & File Layout](#10-storage--file-layout)

---

## 1. Feature Overview

The Plan Designer allows a user to:

- **Upload** a PDF of sheet music, which is server-side converted to page images.
- **View** the converted pages in a scrollable, zoomable viewer.
- **Crop** regions of the pages by click-and-drag to create exercises.
- **Organize** exercises into named song sections (Intro, Verse, Chorus, etc.).
- **Set metadata** — song title, artist, tempo (BPM), YouTube URL, Spotify URL.
- **Customize** the exercise card background color (white, dark, sepia, etc.).
- **Resize** exercise crop previews by dragging the bottom edge.
- **Auto-fill** metadata using AI (OpenAI GPT-4o vision) from the sheet music images.
- **Reorder** exercises via drag-and-drop.
- **Save** the song, which persists all data as JSON + PNG preview files.

---

## 2. User-Facing Behaviour

### 2.1 Two Modes: Create & Edit

| Mode | URL | Behaviour |
|------|-----|-----------|
| **Create** | `GET /songs/new` | Generates a fresh `songId`, shows an empty designer. User starts by uploading a PDF. |
| **Edit** | `GET /songs/{songId}/edit` | Loads existing song data. PDF pages are already converted. Exercises, sections, and metadata are pre-populated. A "← Back to song" link appears at the top of the editor panel. |

### 2.2 Two-Column Layout

The page is split into two resizable columns:

| Column | Purpose |
|--------|---------|
| **Left (`col-pdf`)** | PDF page viewer. Displays upload zone initially, then scrollable page images after upload. Users draw crop selections here. |
| **Right (`col-editor`)** | Song metadata header, section pills, crop display controls, and exercise cards. The save button is fixed at the bottom. |

A draggable resize handle between them allows adjusting the split. Double-clicking the handle resets to 50/50.

On screens ≤ 900px, the layout stacks vertically (PDF on top, editor below) and the resize handle is hidden.

### 2.3 PDF Upload & Viewing

1. **Upload zone** — Drop area with "Drop PDF here or click to upload" message.
2. **Progress indicator** — Spinner shown during upload.
3. **Error bar** — Dismissible error message on upload failure.
4. After upload, the server converts the PDF via `mutool` or `pdftoppm` and returns a `jobId` + `pageCount`.
5. Page images are loaded as `<img>` tags from `/api/pages/{jobId}/{pageNum}`.
6. Pages stack vertically in a scrollable container.

If the uploaded PDF has no title set yet, the filename (minus `.pdf` extension) is used as the song title.

### 2.4 Crop Drawing

Users click and drag on the page images to draw a selection rectangle:

1. A blue dashed selection box appears during drag.
2. On release, the selection is mapped to normalized coordinates (0–1) relative to each page image it overlaps.
3. A crop can span **at most 2 consecutive pages** (multi-page selections are stitched vertically).
4. Selections smaller than 10×10 pixels are discarded.
5. A canvas is used to extract the pixel data and generate a PNG preview (`previewDataUrl`).
6. A new exercise card is created with the crop(s) and automatically scrolled into view.

### 2.5 Song Header (WYSIWYG)

The header mirrors the song detail page's visual style. Each field is **click-to-edit**:

| Field | Display | Click behaviour |
|-------|---------|-----------------|
| **Title** | Large heading text or placeholder "Song title" | Replaces text with an inline `<input>` |
| **Artist** | Subtitle text or placeholder "Artist" | Inline input |
| **Tempo** | Chip showing "120 BPM" or placeholder "BPM" | Inline numeric input (80px wide) |
| **YouTube** | Link text "YouTube" or placeholder | Inline URL input |
| **Spotify** | Link text "Spotify" or placeholder | Inline URL input; also triggers album art fetch |

- **Edit icon (✎)** appears on hover next to each field.
- Pressing **Enter** or clicking away commits the value.
- Pressing **Escape** reverts to the previous value.
- When a Spotify URL is set, album art is fetched via `window.fetchSpotifyThumbnail()` and displayed.

### 2.6 Section Management

Sections define the song structure (e.g., Intro → Verse → Chorus → Solo → Outro).

- **Section pills** are rendered as colored buttons below the header.
- Each pill's color is determined by the lowest difficulty/stage of exercises assigned to that section.
- Clicking a pill scrolls to that section's exercises.
- Hovering a pill reveals an **× remove** button.
- A **+ button** opens a popover with quick-add options:
  - Standard sections: Intro, Verse, Chorus, Bridge, Solo, Outro
  - **+ Custom** — reveals an inline text input for a custom section name
  - **Done** — closes the popover
- When a section is removed, any exercises assigned to it become "unsorted" (their `sectionId` is cleared).
- Duplicate section types are automatically numbered (e.g., "Verse (1)", "Verse (2)").

### 2.7 Exercise Cards

Each exercise is rendered as a card containing:

1. **Crop preview image(s)** — the cropped region from the PDF page(s).
2. **Inline title input** — placeholder "e.g., Main riff, Bar 47-48", editable directly.
3. **Crop resize handle** — a draggable bar at the bottom of the crop area to resize the preview (30%–300% scale).
4. **Controls bar** beneath the card:
   - **Stage select** — dropdown with the 5 configurable stage names, color-coded.
   - **Section select** — dropdown to assign the exercise to a section.
   - **Delete button (✕)** — removes the exercise.
5. **Left border color** — matches the current stage/difficulty color.
6. **Sequence number badge** — shown on the crop overlay in the PDF viewer, links back to the card.
7. **Drag-and-drop reordering** — cards can be dragged to reorder within the list.

Exercises are **grouped by section**. Each section group has:
- A section divider label
- The exercises assigned to that section
- "No exercises" placeholder if the section is empty

Exercises without a section appear in an **"Unsorted"** group at the bottom.

A **progress badge** in the exercises header shows completion status (e.g., "3 of 5" or "All 5 labeled ✓"). An exercise is "complete" when it has both a `sectionId` and a `difficulty ≥ 1`.

### 2.8 Crop Display Controls

A toolbar above the exercises list controls how crop previews appear:

- **Background color** — preset swatches (White, Dark, Warm Dark, Blue Dark, Warm, Sepia, Cool) plus a custom color picker.
- When a dark background is selected, crop images are inverted using CSS `filter: invert(1); mix-blend-mode: difference` for readability.
- **Hint text** — "Drag the bottom edge of each exercise to resize."

### 2.9 AI Auto-fill

When a PDF is uploaded and an `OPENAI_API_KEY` is configured:

1. An "✨ Auto-fill with AI" button appears.
2. Clicking it captures the first 4 page images as JPEG data URLs.
3. Sends them to `POST /api/analyze-pdf`.
4. The server uses OpenAI GPT-4o vision to extract:
   - Song title
   - Artist / composer
   - Tempo (BPM)
   - Section names (e.g., ["Intro", "Verse", "Chorus"])
5. Results are merged into the current state **only for empty fields** (won't overwrite user-entered data).
6. Extracted sections are added to the structure if no sections exist yet.
7. Errors are displayed inline below the button.

### 2.10 Saving & Navigation

- The **Save button** is in the bottom-right footer.
- Clicking Save:
  1. Assembles the full song JSON payload.
  2. Merges practice data (stage, totalPracticedSeconds, totalReps, lastPracticedAt) from existing exercises to preserve progress.
  3. POSTs to `POST /api/songs`.
  4. On success, redirects to `/songs/{songId}`.
  5. On failure, shows an error message.
- **Unsaved changes guard** — the `beforeunload` event fires a browser confirmation dialog if `isDirty` is true.
- In edit mode, a "← Back to song" link navigates to the song detail page.

### 2.11 Resizable Panels

The resize handle between the left and right columns supports:
- **Drag** — smoothly adjusts the editor panel width (min 320px, max 1200px).
- **Double-click** — resets to 50% of the viewport width.

### 2.12 Zoom Controls

A floating zoom control appears after a PDF is loaded:
- **−** button decreases zoom by 25% (min 50%)
- **+** button increases zoom by 25% (max 300%)
- Current zoom level displayed (e.g., "100%")
- Zoom is applied via CSS `transform: scale()` on the page stack container.

---

## 3. Routes

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| `GET` | `/songs/new` | `HandlePlanDesignerNew` | Render Plan Designer in create mode |
| `GET` | `/songs/{songId}/edit` | `HandlePlanDesignerEdit` | Render Plan Designer in edit mode |
| `POST` | `/api/convert` | `HandleConvertPDF` | Upload PDF → convert to page images |
| `GET` | `/api/pages/{jobId}/{pageNum}` | `HandleGetPage` | Serve a converted page image |
| `POST` | `/api/songs` | `HandleSaveSong` | Create or update a song |
| `GET` | `/api/songs/{songId}/preview/{cropId}` | `HandlePreview` | Serve a crop preview PNG |
| `POST` | `/api/analyze-pdf` | `HandleAnalyzePDF` | AI-based metadata extraction |

---

## 4. Backend Code

### 4.1 Handler: `plan_designer.go`

**File:** `handlers/plan_designer.go`

Contains two handlers, both methods on `*Deps`:

#### `HandlePlanDesignerNew`
- Generates a new `songId` via `generateID()` (32-char random hex).
- Loads user settings (for stage names).
- Renders `plan-designer.html` with `Mode: "create"` and `Song: nil`.

#### `HandlePlanDesignerEdit`
- Extracts `songId` from the URL path (`r.PathValue("songId")`).
- Loads the song from storage via `d.Songs.Get(songID)`.
- Returns 404 if the song doesn't exist, 500 on storage error.
- Renders `plan-designer.html` with `Mode: "edit"` and the loaded song data.

### 4.2 Template Data: `PlanDesignerData`

```go
type PlanDesignerData struct {
    Settings models.UserSettings  // User settings (theme, stage names, etc.)
    Mode     string               // "create" or "edit"
    SongID   string               // Pre-generated or existing song ID
    Song     *models.Song         // nil for create, populated for edit
}
```

### 4.3 Save Endpoint: `HandleSaveSong`

**File:** `handlers/api.go`

- Decodes a `models.Song` from the JSON request body.
- Validates that `id` and `title` are present.
- **Preserves practice data:** If the song already exists, it merges `stage`, `totalPracticedSeconds`, `totalReps`, and `lastPracticedAt` from existing exercises into the incoming data (by matching exercise IDs).
- Preserves `cropBgColor` if the incoming payload doesn't set one but the existing song has one.
- Preserves `cropScale` from existing exercises if not set in the incoming payload.
- Calls `d.Songs.Save(&song)` which:
  - Creates the song directory `data/songs/{songId}/`.
  - Extracts base64-encoded crop previews from the JSON, writes them as `preview_{cropId}.png` files.
  - Strips the `previewBase64` field from each crop before writing `song.json`.
- Returns `{"success": true, "songId": "..."}`.

### 4.4 AI Endpoint: `HandleAnalyzePDF`

**File:** `handlers/analyze.go`

- Requires `OPENAI_API_KEY` environment variable.
- Accepts either:
  - `pageImages` — array of data URLs (base64 image strings) sent directly from the client.
  - `jobId` + `pageCount` — loads images from disk.
- Limits to 4 pages maximum.
- Calls OpenAI GPT-4o with a system prompt instructing it to extract `title`, `artist`, `tempo`, and `sections` from sheet music images.
- Parses the JSON response (stripping markdown code fences if present).
- Returns `AnalyzeResponse`:

```go
type AnalyzeResponse struct {
    Title    *string  `json:"title"`
    Artist   *string  `json:"artist"`
    Tempo    *int     `json:"tempo"`
    Sections []string `json:"sections"`
}
```

### 4.5 PDF Conversion: `HandleConvertPDF`

**File:** `handlers/api.go`

- Accepts multipart form upload (max 50MB).
- Validates the file starts with `%PDF-`.
- Generates a `jobId` and creates a directory `data/converted/{jobId}/`.
- Converts PDF pages to images using `mutool` (falls back to `pdftoppm`).
- Returns:

```json
{
  "id": "abc123...",
  "pageCount": 4,
  "pages": [
    { "pageNum": 1, "url": "/api/pages/abc123/1" },
    ...
  ]
}
```

### 4.6 Preview Serving: `HandlePreview`

- Serves `data/songs/{songId}/preview_{cropId}.png` as `image/png`.
- Sets `Cache-Control: public, max-age=86400`.

### 4.7 Page Serving: `HandleGetPage`

- Serves `data/converted/{jobId}/page_{pageNum}.jpg` (or `.png`).
- Sets appropriate `Content-Type` and caching headers.

---

## 5. Domain Models

All models are in the `models/` package.

### 5.1 Song

**File:** `models/song.go`

```go
type Song struct {
    ID          string     `json:"id"`          // 32-char hex ID
    Title       string     `json:"title"`       // Song title
    Artist      string     `json:"artist"`      // Artist / composer
    Tempo       *float64   `json:"tempo"`       // BPM (nullable)
    YoutubeURL  *string    `json:"youtubeUrl"`  // YouTube link (nullable)
    SpotifyURL  *string    `json:"spotifyUrl"`  // Spotify link (nullable)
    JobID       string     `json:"jobId"`       // PDF conversion job ID
    PageCount   int        `json:"pageCount"`   // Number of PDF pages
    Structure   []Section  `json:"structure"`   // Ordered song sections
    Exercises   []Exercise `json:"exercises"`   // All exercises
    CreatedAt   string     `json:"createdAt"`   // ISO 8601 timestamp
    CropBgColor *string    `json:"cropBgColor,omitempty"` // Exercise card bg color
}
```

**Methods:**
- `LowestStage() *int` — returns the minimum stage across all exercises (nil if no exercises).
- `LastPracticed() *string` — returns the most recent `lastPracticedAt` across exercises.
- `ToSummary() SongSummary` — converts to a lightweight summary for list views.

### 5.2 Section

```go
type Section struct {
    ID    string `json:"id"`    // UUID
    Type  string `json:"type"`  // e.g. "intro", "verse", "chorus", "bridge", "solo", "outro", or custom
    Order int    `json:"order"` // 0-based position in the structure
}
```

### 5.3 Exercise

```go
type Exercise struct {
    ID                    string   `json:"id"`                    // UUID
    Name                  string   `json:"name"`                  // User-given name
    SectionID             string   `json:"sectionId"`             // FK to Section.ID
    Difficulty            int      `json:"difficulty"`            // 1–5 stage/difficulty
    Stage                 int      `json:"stage"`                 // 1–5 practice stage
    Crops                 []Crop   `json:"crops"`                 // 1–2 crop regions
    TotalPracticedSeconds int      `json:"totalPracticedSeconds"` // Cumulative practice time
    TotalReps             int      `json:"totalReps"`             // Cumulative repetitions
    LastPracticedAt       *string  `json:"lastPracticedAt"`       // ISO 8601 (nullable)
    CreatedAt             string   `json:"createdAt"`             // ISO 8601
    CropScale             *float64 `json:"cropScale,omitempty"`   // Preview display scale %
}
```

> **Note:** In the Plan Designer, the `difficulty` field is used interchangeably with `stage` for new exercises. The `stage` field is preserved from existing exercises during save and is used for practice tracking.

### 5.4 Crop

```go
type Crop struct {
    ID            string  `json:"id"`                       // UUID
    PageIndex     int     `json:"pageIndex"`                // 0-based page number
    Rect          Rect    `json:"rect"`                     // Normalized coordinates
    PreviewBase64 *string `json:"previewBase64,omitempty"`  // Transient; stripped on save
}
```

### 5.5 Rect

```go
type Rect struct {
    X float64 `json:"x"` // Left edge (0–1, fraction of page width)
    Y float64 `json:"y"` // Top edge (0–1, fraction of page height)
    W float64 `json:"w"` // Width (0–1)
    H float64 `json:"h"` // Height (0–1)
}
```

All coordinates are **normalized** to the range 0–1, relative to the natural dimensions of the page image.

### 5.6 UserSettings

**File:** `models/settings.go`

```go
type UserSettings struct {
    Theme       string   `json:"theme"`       // "light" or "dark"
    StageNames  []string `json:"stageNames"`  // 5 custom stage names
    DisplayName string   `json:"displayName"` // User's name
}
```

Default stage names: `["Not started", "Learning", "Slow & clean", "Up to tempo", "Mastered"]`

### 5.7 SongSummary

```go
type SongSummary struct {
    ID              string  `json:"id"`
    Title           string  `json:"title"`
    Artist          string  `json:"artist"`
    JobID           string  `json:"jobId"`
    PageCount       int     `json:"pageCount"`
    CreatedAt       string  `json:"createdAt"`
    ExerciseCount   int     `json:"exerciseCount"`
    LowestStage     *int    `json:"lowestStage"`
    LastPracticedAt *string `json:"lastPracticedAt"`
    SpotifyURL      *string `json:"spotifyUrl,omitempty"`
}
```

---

## 6. Frontend Code (`plan-designer.js`)

**File:** `static/js/plan-designer.js`

The entire Plan Designer client logic is wrapped in an IIFE (`(function() { ... })()`) to avoid polluting the global scope. Functions exposed to HTML `onclick` handlers are assigned to `window.*`.

### 6.1 Constants

```javascript
const STANDARD_SECTIONS = ['intro', 'verse', 'chorus', 'bridge', 'solo', 'outro'];
const DIFFICULTY_LABELS = { 1:'Easiest', 2:'Easy', 3:'Medium', 4:'Hard', 5:'Hardest' };
const STAGE_COLORS = { 1:'#ef4444', 2:'#f97316', 3:'#eab308', 4:'#84cc16', 5:'#22c55e' };
const DEFAULT_STAGE_COLOR = '#9ca3af';
```

### 6.2 Client-Side State

| Variable | Type | Description |
|----------|------|-------------|
| `mode` | `string` | `"create"` or `"edit"` |
| `songId` | `string` | The song's unique ID |
| `createdAt` | `string` | ISO 8601 creation timestamp |
| `songTitle` | `string` | Current song title |
| `artist` | `string` | Current artist name |
| `tempo` | `number\|null` | BPM |
| `youtubeUrl` | `string\|null` | YouTube URL |
| `spotifyUrl` | `string\|null` | Spotify URL |
| `structure` | `Section[]` | Array of section objects |
| `jobId` | `string\|null` | PDF conversion job ID |
| `pageCount` | `number` | Number of converted pages |
| `exercises` | `ExerciseCard[]` | Array of exercise card objects (client-side shape) |
| `isDirty` | `boolean` | Whether unsaved changes exist |
| `saving` | `boolean` | Whether a save is in progress |
| `zoom` | `number` | Current zoom level (1 = 100%) |
| `existingExercises` | `Exercise[]` | Original exercises from loaded song (for preserving practice data) |
| `cropBgColor` | `string\|null` | Current crop background color hex |
| `stageNames` | `string[]` | 5 stage display names from settings |
| `selecting` | `boolean` | Whether user is currently drawing a selection |
| `dragStart` | `{x,y}\|null` | Pointer-down position for selection |
| `dragCurrent` | `{x,y}\|null` | Current pointer position for selection |

#### Client-Side Exercise Card Object

The client-side exercise card differs slightly from the server-side `Exercise` model:

```javascript
{
  id: string,             // UUID
  crops: [{               // Array of crop objects
    cropId: string,       // UUID
    pageIndex: number,    // 0-based page index
    rect: { x, y, w, h },// Normalized coordinates
    previewDataUrl: string|null, // Blob URL or data URL
    previewBase64: string|null   // Base64 string for saving
  }],
  previewDataUrl: string|null,  // Combined preview (for multi-page crops)
  sequenceNumber: number,       // 1-based display order
  description: string,          // User-entered name
  sectionId: string,            // FK to section ID (empty = unsorted)
  difficulty: number,           // 1–5
  cropScale: number,            // Preview scale % (default 100)
  isComplete: boolean           // true if sectionId is set AND difficulty ≥ 1
}
```

### 6.3 Initialization & Loading

**`init()`** — runs on `DOMContentLoaded`:
1. Reads data attributes from the `#plan-designer` root element: `data-mode`, `data-song-id`, `data-song`, `data-stage-names`.
2. Caches DOM references (`pagesScroll`, `pagesInner`, `uploadZone`, `selectionBoxEl`).
3. In edit mode, parses the embedded song JSON and calls `loadFromSong()`.
4. Registers pointer event listeners for crop drawing.
5. Calls initial render functions.

**`loadFromSong(song)`** — populates all state from an existing song:
1. Sets all metadata fields (`songTitle`, `artist`, `tempo`, etc.).
2. Copies `structure` array.
3. Stores `existingExercises` for practice data preservation during save.
4. Maps server-side exercises to client-side card objects.
5. Loads page images from `/api/pages/{jobId}/{pageNum}`.
6. Loads crop preview images from `/api/songs/{songId}/preview/{cropId}` for each crop.

### 6.4 WYSIWYG Header Rendering

**`renderHeader()`** — updates the song header display:
- For each metadata field (title, artist, tempo, YouTube, Spotify):
  - If the field has a value: shows the value, removes the placeholder class.
  - If empty: shows placeholder text, adds the placeholder class.
  - Only updates if an inline input is **not** currently active (to avoid disrupting editing).
- For Spotify: fetches and displays album art via `window.fetchSpotifyThumbnail()`.

### 6.5 Inline Field Editing

**`window.pdEditField(field)`** — triggered by clicking on a header field:
1. Looks up the field configuration (element ID, input type, placeholder, getter/setter).
2. Hides the display text and edit icon.
3. Creates an `<input>` element with the current value.
4. Focuses and selects the input.
5. On **blur** (or **Enter**): commits the value, sets `isDirty = true`, re-renders the header.
6. On **Escape**: reverts to the previous value and blurs.
7. Click events on the input are stopped to prevent re-triggering the parent's `onclick`.

Field configuration map:

| Field | Input Type | Placeholder | InputMode |
|-------|-----------|-------------|-----------|
| `title` | `text` | "Song title" | — |
| `artist` | `text` | "Artist" | — |
| `tempo` | `text` | "BPM" | `numeric` |
| `youtube` | `url` | "YouTube URL" | — |
| `spotify` | `url` | "Spotify URL" | — |

### 6.6 Section Pill Rendering

**`renderSectionPills()`** — rebuilds the section pill bar:
1. For each section in `structure`:
   - Computes a label (e.g., "Verse" or "Verse (2)" for duplicates).
   - Determines the lowest difficulty among exercises in that section → picks a stage color.
   - Creates a pill `<button>` with tinted background, colored border/text.
   - Clicking a pill scrolls to the section's exercise group.
   - A remove button (×) appears on hover.
2. Appends a "+" pill that opens/closes the section popover.

**`getSectionLabel(section)`** — returns a display label for a section:
- Capitalizes the type name.
- If multiple sections share the same type, appends a numbered suffix: "Verse (1)", "Verse (2)".

### 6.7 Page Image Loading

**`loadPageImages(jId, pCount)`**:
1. Hides the upload zone, shows the pages scroll area and zoom controls.
2. For each page (1 to `pCount`):
   - Creates a wrapper `<div>` with a page label ("Page 1", "Page 2", etc.).
   - Creates an `<img>` with `src="/api/pages/{jobId}/{pageNum}"` and lazy loading.
   - On image load, calls `renderCropOverlays()` to draw existing crop regions.
3. Updates the hint message and auto-fill button state.

### 6.8 Crop Drawing System

Uses pointer events (`pointerdown`, `pointermove`, `pointerup`) on the pages scroll container.

**`onPointerDown(event)`**:
- Ignores non-left-clicks and clicks on existing crop overlays.
- Sets pointer capture on the scroll container.
- Records the start position in container-relative coordinates.

**`onPointerMove(event)`**:
- Updates the selection rectangle's position and size.

**`onPointerUp(event)`**:
- Releases pointer capture.
- If the selection is too small (< 10×10px), cancels.
- Otherwise calls `addCropFromSelection()`.

**`toContainerPoint(event)`** — converts a mouse/touch event to coordinates relative to the scroll container (accounting for scroll offset).

**`updateSelectionBox()`** — positions and sizes the blue dashed selection rectangle.

**`addCropFromSelection()`** — the core crop creation logic:
1. Iterates all page images, finding which ones intersect with the selection box.
2. For each intersecting page, calculates the intersection rectangle in natural image coordinates (pixels) and normalized coordinates (0–1).
3. Limits to at most 2 consecutive pages.
4. Uses `<canvas>` to extract the pixel data from each page's crop region.
5. Stitches multi-page crops vertically into a combined canvas.
6. Generates `previewDataUrl` (data URL) and `previewBase64` (for server save).
7. Creates a new exercise card object and adds it to the `exercises` array.
8. Triggers re-render and scrolls to the new card.

### 6.9 Crop Overlay Rendering

**`renderCropOverlays(container, pageIndex, img)`** — draws colored rectangles on page images:
- For each exercise, for each crop on the given page:
  - Creates a `<div class="crop-overlay">` positioned absolutely using percentage coordinates.
  - Adds a `complete` class if the exercise is complete (has section + difficulty).
  - Shows a numbered badge (the exercise's `sequenceNumber`).
  - Clicking an overlay scrolls to and highlights the corresponding exercise card.

**`scrollToCard(id)`** — scrolls an exercise card into view and briefly highlights it with a blue outline. Also focuses the title input for immediate editing.

### 6.10 Exercise Rendering & Grouping

**`groupExercisesBySections()`** — organizes exercises into section-based groups:
1. For each section in `structure`: collects and sorts exercises with matching `sectionId`.
2. Computes the lowest difficulty within each group.
3. Collects "unsorted" exercises (no `sectionId`) into a separate group.
4. Returns an array of group objects:

```javascript
{
  section: { id, type },
  label: string,          // e.g. "Verse (2)"
  exercises: ExerciseCard[],
  lowestStage: number     // 1–5
}
```

**`renderExercises()`** — rebuilds the entire exercise list:
1. Groups exercises by section.
2. For each group: renders a section divider label and exercise cards (or "No exercises" placeholder).
3. Re-binds drag-and-drop handlers on each card wrapper.
4. Calls `updateExerciseUI()`.

### 6.11 Exercise Card Builder

**`buildExerciseCard(ex)`** — generates the HTML string for a single exercise card:

Structure:
```
.expanded-card-wrapper#card-{id}
  .expanded-card  (border-left colored by difficulty)
    .card-crop-area  (background from cropBgColor)
      .card-overlay-header
        input.card-title-edit  (name/description)
      .card-crop-item (per crop)
        img.card-crop-img  (preview image)
      .card-crop-resize-handle
  .card-controls-bar
    select.card-stage-select  (difficulty 1–5)
    select.card-section-select  (section assignment)
    button.card-delete-btn  (✕)
```

- If `cropBgColor` is dark, applies CSS `filter: invert(1); mix-blend-mode: difference` to crop images.
- If no preview image exists, shows a 🎵 placeholder.
- The crop scale is applied as `width: {scale}%` on the image.

### 6.12 Exercise Interactions

| Function | Trigger | Behaviour |
|----------|---------|-----------|
| `pdDeleteExercise(id)` | Delete button | Removes exercise, re-sequences, re-renders |
| `pdSetDesc(id, value)` | Title input `oninput` | Updates exercise description, sets dirty |
| `pdSetSection(id, sectionId)` | Section select `onchange` | Assigns exercise to section, re-renders (moves card to section group) |
| `pdSetDifficulty(id, val)` | Stage select `onchange` | Updates difficulty, re-renders card and section pills |
| `updateCompleteness(ex)` | Internal | Sets `isComplete` flag based on `sectionId` and `difficulty ≥ 1` |

### 6.13 Crop Background Color

**`pdSetCropBgColor(swatch, color)`** — called when a preset swatch is clicked:
- Sets `cropBgColor` to the selected color (or `null` for white).
- Updates active swatch state.
- Re-renders all exercises.

**`pdSetCropBgColorCustom(input)`** — called from the custom color picker:
- Sets `cropBgColor` from the color input's value.
- Re-renders exercises.

**`pdIsColorDark(hex)`** — determines if a color is dark using luminance formula:
- $L = \frac{0.299R + 0.587G + 0.114B}{255}$
- Returns `true` if $L < 0.5$.

### 6.14 Crop Resize (Drag Handle)

**`pdCropResizeStart(event, handle)`** — initiates a vertical drag to resize the crop preview:
1. Finds the parent card and exercise.
2. Records the start Y position and current scale.
3. Registers global `mousemove`/`touchmove` and `mouseup`/`touchend` listeners.
4. Sets cursor to `ns-resize` and disables text selection.

**`pdCropResizeMove(event)`**:
- Computes delta Y from start.
- Calculates new scale as `startScale × (startHeight + deltaY) / startHeight`.
- Clamps to 30–300%.
- Applies immediately via inline `style.width`.

**`pdCropResizeEnd()`**:
- Cleans up event listeners and cursor.
- Sets `isDirty = true`.

### 6.15 PDF Upload

**`pdOnDrop(event)`** — handles drag-and-drop of PDF files onto the upload zone.

**`pdOnFileSelected(event)`** — handles file picker selection.

**`doUpload(file)`**:
1. Shows upload progress spinner.
2. POSTs the file as `FormData` to `/api/convert`.
3. On success: stores `jobId` and `pageCount`, loads page images, auto-fills title from filename.
4. On failure: shows error message.

### 6.16 AI Auto-fill

**`pdAutoFill()`** — async function:
1. Captures up to 4 page images as JPEG data URLs using canvas.
2. POSTs to `/api/analyze-pdf` with `{ pageImages: [...] }`.
3. Merges returned data into state (only fills empty fields).
4. If sections are returned and none exist, creates section objects from the AI response.
5. Shows spinner during analysis, error message on failure.

**`updateAutoFillBtn()`** — enables/disables the button and shows/hides the section based on whether `jobId` and `pageCount` are set.

### 6.17 Zoom

**`pdZoom(delta)`**:
- Adjusts `zoom` by `delta` (typically ±0.25).
- Clamps to range [0.5, 3.0].
- Applies `transform: scale({zoom})` to the page stack.
- Updates the zoom level label.

### 6.18 Save Logic

**`updateSaveState()`** — updates the Save button's disabled state. The button is disabled only during an active save.

**`pdSave()`** — async function:
1. Sets `saving = true`, shows spinner on button.
2. Maps client-side exercise cards to the server-side `Exercise` format:
   - For existing exercises (matching ID in `existingExercises`), preserves `stage`, `totalPracticedSeconds`, `totalReps`, `lastPracticedAt`.
   - For new exercises, defaults: `stage: 1`, `totalPracticedSeconds: 0`, `totalReps: 0`, `lastPracticedAt: null`.
   - Sets `name` to the description or "Exercise N" fallback.
   - Includes `previewBase64` for new crops (to be saved as PNG files server-side).
   - Only includes `cropScale` if it differs from 100.
3. Assembles the full `Song` JSON.
4. POSTs to `/api/songs`.
5. On success: sets `isDirty = false`, redirects to `/songs/{songId}`.
6. On failure: displays error message.

### 6.19 Discard / Navigation Guard

**`pdDiscard()`** — called when user wants to leave:
- If `isDirty`, shows a `confirm()` dialog.
- In edit mode, navigates to `/songs/{songId}`.
- In create mode, navigates to `/songs`.

**`beforeunload` listener** — prevents accidental tab/window closure when `isDirty` is true.

### 6.20 Helper Functions

| Function | Description |
|----------|-------------|
| `generateUuid()` | Uses `crypto.randomUUID()` if available, otherwise a polyfill pattern |
| `escHtml(s)` | HTML-escapes a string using a temporary DOM element |
| `escAttr(s)` | Escapes a string for use in HTML attributes (`&`, `"`, `'`, `<`, `>`) |
| `hexToRGBA(hex, alpha)` | Converts a hex color to `rgba(r,g,b,alpha)` string |

---

## 7. Template (`plan-designer.html`)

**File:** `templates/plan-designer.html`

Defines the `{{content}}` block. The page uses the shared layout via the template system.

### 7.1 Root Element & Data Attributes

```html
<div class="designer-view" id="plan-designer"
     data-mode="{{.Mode}}"
     data-song-id="{{.SongID}}"
     data-song="{{json .Song}}"          <!-- only in edit mode -->
     data-stage-names="{{json .Settings.StageNames}}">
```

The Go `json` template function serializes the Song and StageNames as JSON strings embedded in HTML attributes for the JS to parse on init.

### 7.2 Left Column (PDF Viewer)

| Element | ID | Purpose |
|---------|----|---------|
| Upload zone | `pd-upload-zone` | Drag-and-drop / click-to-upload area |
| File input | `pd-file-input` | Hidden `<input type="file">` for PDF selection |
| Upload progress | `pd-upload-progress` | Spinner shown during upload |
| Upload error | `pd-upload-error` | Dismissible error bar |
| Pages scroll | `pd-pages` | Scrollable container for page images |
| Pages inner | `pd-pages-inner` | Inner stack where `<img>` elements are appended |
| Selection box | `pd-selection-box` | Blue dashed rectangle shown during crop drawing |
| Zoom controls | `pd-zoom-controls` | Floating zoom +/− buttons |
| Crop hint | `pd-crop-hint` | "Click and drag on the PDF to select a section" |

### 7.3 Right Column (Editor)

| Element | ID | Purpose |
|---------|----|---------|
| Header wrapper | `pd-header` | WYSIWYG song header |
| Title display | `pd-title-display` | Click-to-edit song title |
| Artist display | `pd-artist-display` | Click-to-edit artist name |
| Album art | `pd-album-art` | Album art image (from Spotify) |
| Tempo display | `pd-tempo-display` | Click-to-edit BPM |
| YouTube display | `pd-youtube-display` | Click-to-edit YouTube URL |
| Spotify display | `pd-spotify-display` | Click-to-edit Spotify URL |
| Section pills | `pd-section-pills` | Section navigation buttons |
| Section popover | `pd-section-popover` | Quick-add section popover |
| Auto-fill section | `pd-autofill-section` | AI auto-fill button area |
| Auto-fill button | `pd-autofill-btn` | "✨ Auto-fill with AI" button |
| Analyze error | `pd-analyze-error` | AI error display |
| Crop toolbar | `pd-crop-toolbar` | Background color controls |
| Exercise badge | `pd-exercise-badge` | "3 of 5" progress indicator |
| Empty state | `pd-exercises-empty` | "No exercises yet" placeholder |
| Exercise list | `pd-exercise-list` | Container for exercise cards |
| Save error | `pd-save-error` | Save failure message |
| Missing hint | `pd-missing-msg` | Warning icon for missing fields |
| Save button | `pd-save-btn` | Save button |

---

## 8. CSS Classes & Styling

Key CSS classes (from `static/css/app.css`):

| Class | Description |
|-------|-------------|
| `.designer-view` | Root container, fills the viewport |
| `.designer-two-col` | Flexbox row for the two-column layout |
| `.col-pdf` | Left column; `flex: 1`, dark background |
| `.col-editor` | Right column; fixed width `420px`, scrollable |
| `.col-resize-handle` | 8px-wide draggable divider between columns |
| `.upload-zone` | Dashed-border drop zone for PDF upload |
| `.pages-scroll` | Scrollable container for page images |
| `.page-stack` | Flex column for stacking page wrappers |
| `.page-wrapper` | Contains a page label + image container |
| `.page-image` | The actual page image, `max-width: 100%` |
| `.crop-overlay` | Positioned selection overlay on a page image |
| `.crop-overlay.complete` | Green-tinted overlay for complete exercises |
| `.overlay-badge` | Numbered badge on crop overlays |
| `.selection-rect` | Blue dashed selection rectangle during drawing |
| `.zoom-controls` | Floating zoom buttons (position: absolute, bottom-right) |
| `.pd-header` | Plan Designer header with reduced margin |
| `.pd-editable` | Click-to-edit element with cursor: pointer |
| `.pd-edit-icon` | Pencil icon (✎), opacity 0 until parent hover |
| `.pd-placeholder` | Gray italic placeholder text |
| `.pd-inline-input` | Inline input that replaces display text |
| `.pd-section-pill-wrap` | Wrapper for section pill + remove button |
| `.pd-pill-remove` | Red × button on section pills |
| `.pd-add-section-pill` | Dashed "+" button to add sections |
| `.pd-section-popover` | Floating popover with quick-add buttons |
| `.pd-crop-toolbar` | Background color toolbar |
| `.auto-fill-btn` | Gradient-bordered AI button |
| `.expanded-card-wrapper` | Outer wrapper for exercise card (draggable) |
| `.expanded-card` | Card with left border color, shadow, rounded corners |
| `.card-crop-area` | Crop preview area (variable background) |
| `.card-crop-img` | Crop preview image within a card |
| `.card-crop-resize-handle` | Bottom drag handle for crop resize |
| `.card-controls-bar` | Controls row below card (stage, section, delete) |
| `.col-right-footer` | Sticky footer with save button |
| `.save-btn` | Save button styling |

**Dark mode:** All components have `.dark-mode` variants that adjust backgrounds, borders, and colors for dark theme compatibility.

**Responsive (≤ 900px):** The two-column layout stacks vertically, the resize handle is hidden, and the editor takes full width.

---

## 9. Data Flow Diagrams

### 9.1 Create Flow

```
User visits /songs/new
  → HandlePlanDesignerNew generates songId
  → Renders plan-designer.html (mode="create", Song=nil)
  → User uploads PDF
    → POST /api/convert
    → Server: converts PDF via mutool/pdftoppm → page images
    → Response: { id: jobId, pageCount: N }
    → JS: loadPageImages() → fetches GET /api/pages/{jobId}/{1..N}
  → User draws crops on pages → exercises created client-side
  → User sets title, artist, sections, assigns exercises
  → User clicks Save
    → POST /api/songs with full Song JSON (including base64 crop previews)
    → Server: writes song.json + preview_*.png files
    → Redirect to /songs/{songId}
```

### 9.2 Edit Flow

```
User visits /songs/{songId}/edit
  → HandlePlanDesignerEdit loads song from storage
  → Renders plan-designer.html (mode="edit", Song=loaded)
  → JS: loadFromSong() parses embedded song data
  → JS: loads page images from /api/pages/{jobId}/{1..N}
  → JS: loads crop previews from /api/songs/{songId}/preview/{cropId}
  → User modifies exercises, sections, metadata
  → User clicks Save
    → POST /api/songs (merges practice data from existing exercises)
    → Redirect to /songs/{songId}
```

### 9.3 Save Flow

```
Client: pdSave()
  → Assemble Song JSON
    → Map exercises: merge practice data from existingExercises
    → Include previewBase64 for new/changed crops
  → POST /api/songs
    ↓
Server: HandleSaveSong
  → Decode Song JSON
  → If song exists: preserve stage, totalPracticedSeconds, totalReps, lastPracticedAt, cropScale
  → Songs.Save(&song)
    → Create data/songs/{songId}/ directory
    → For each crop with previewBase64:
      → Decode base64 → write preview_{cropId}.png
      → Strip previewBase64 from JSON
    → Write song.json
  → Return { success: true, songId }
    ↓
Client: redirect to /songs/{songId}
```

---

## 10. Storage & File Layout

```
data/
├── songs/
│   └── {songId}/
│       ├── song.json              # Full song data (no base64 previews)
│       ├── preview_{cropId1}.png  # Crop preview image
│       ├── preview_{cropId2}.png
│       └── ...
├── converted/
│   └── {jobId}/
│       ├── page_1.jpg             # Converted PDF page images
│       ├── page_2.jpg
│       └── ...
└── settings.json                  # User settings
```

- **Song JSON** is the canonical store for all song data. Preview base64 data is **never** stored in the JSON — it's extracted and written as separate PNG files during save.
- **Converted pages** persist indefinitely under their `jobId`. Multiple songs could theoretically reference the same `jobId` (though the UI doesn't support this).
- **Concurrency safety** is handled by `sync.RWMutex` in the `SongStore`.
- **Migration** (`migrateSong()`) runs on every read, normalizing nil slices and clamping stage/difficulty to 1–5.
