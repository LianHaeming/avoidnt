# Song Detail / Practice Page — Current Behaviour

> Route: `GET /songs/{songId}`
> Template: `templates/song-detail.html`
> Handler: `handlers/song_detail.go` → `HandleSongDetail`
> JS: `static/js/timer.js` (practice timer/reps), `static/js/app.js` (stage change, edit mode, crop resize, Spotify art, keyboard shortcuts)

---

## Page Layout (top to bottom)

### 1. Song Header

Displayed at the top of the page inside a `<header>` block.

| Element | Description |
|---------|-------------|
| **Album art** | If the song has a `spotifyUrl`, the page fetches the Spotify oEmbed API on page load and displays the album art thumbnail to the left of the title. Thumbnails are cached in `localStorage` for 7 days. Hidden if no Spotify URL or fetch fails. |
| **Title** | The song title (`h1`). |
| **Artist** | The artist name, shown below the title. |
| **BPM chip** | If the song has a `tempo` value, a small chip shows e.g. "120 BPM". |
| **YouTube link** | If the song has a `youtubeUrl`, a clickable link with the YouTube icon opens it in a new tab. |
| **Spotify link** | If the song has a `spotifyUrl`, a clickable link with the Spotify icon opens it in a new tab. |
| **Edit button** | A pencil icon (top-right) links to the Plan Designer / song editor page (`/songs/{songId}/edit?from=practice`). |

### 2. Section Navigation Pills

Shown below the header if the song has a defined `structure` (sections like Intro, Verse, Chorus, etc.).

- Each section gets a **pill button** labelled with the section type name (capitalised).
- If a section type appears more than once, they are numbered: e.g. "Verse (1)", "Verse (2)".
- Pills are **colour-coded** by the **lowest exercise stage** within that section (red → green gradient, stages 1–5).
  - Background: stage colour at 10% opacity (tint)
  - Border: stage colour at 35% opacity
  - Text: stage colour at 70% opacity
- Clicking a pill **smooth-scrolls** to that section's group on the page.
- Pills for sections with **no exercises** are `disabled` (greyed out, not clickable).
- When an exercise's stage changes, the pill colour **updates in real-time** (JS recomputes lowest stage for the section).

### 3. Edit Exercises Toolbar

Hidden by default. Toggled on/off by:
- Hovering over an exercise card and clicking the **pencil icon** that appears.
- Pressing **Escape** while edit mode is active (exits it).

When visible, the toolbar shows:

| Control | Behaviour |
|---------|-----------|
| **"Exercise Background" toggle** | A light/dark toggle switch. Toggles crop backgrounds between default (white/transparent) and dark (`#1e1e1e`). When dark is active, crop images get `filter: invert(1)` and `mix-blend-mode: difference` so sheet music notes appear white-on-dark. Title text also changes to light colour. Setting is **persisted per-song** via `PATCH /api/songs/{songId}/display`. |
| **"Done" button** | Exits edit mode. |
| **Hint text** | "Drag the bottom edge of each exercise to resize." |

While in edit mode (`editing-exercises` class on the view):
- The hover pencil icons on cards are hidden.
- **Resize drag handles** become visible at the bottom of each exercise card's crop area.

### 4. Exercise Cards (Main Content)

Exercises are displayed as a **vertical list of cards**, grouped by section. If the song has no structure, all exercises appear in a single ungrouped list.

#### Section Groups

Each section group has:
- A **section divider** — a horizontal line with the section label centred (e.g. "── Verse ──").
- If the section has no exercises, "No exercises" text is shown.

#### Empty State

If the song has **zero exercises**, an empty state is shown with:
- "No Exercises Yet" heading
- "Add exercises to get started" subtext
- "Add Exercises" CTA button linking to the editor

#### Individual Exercise Card

Each card (`expanded-card-wrapper`) contains:

**Visual Card (top part):**

| Element | Description |
|---------|-------------|
| **Left border colour** | Coloured by the exercise's current stage (1=red, 2=orange, 3=yellow, 4=lime, 5=green) at 35% opacity. |
| **Exercise name overlay** | The exercise name is overlaid at the top-left of the crop area. |
| **Crop image(s)** | One or more crop preview images loaded from `/api/songs/{songId}/preview/{cropId}`. Images are lazy-loaded. If a crop image fails to load, a "Failed to load" placeholder appears. If the exercise has no crops or no jobId, a 🎵 placeholder is shown. |
| **Crop scale** | Each exercise has an independent `cropScale` value (default 100%). The crop images' width is set to this percentage. Persisted per-exercise. |
| **Hover pencil** | A small pencil icon appears in the top-right on hover. Clicking it enters Edit Exercises mode. Hidden when already in edit mode. |
| **Resize handle** | A draggable bar at the bottom of the crop area (only visible in edit mode). Dragging it vertically rescales the crop images (range 30%–300%). The new scale is saved via `PATCH /api/songs/{songId}/exercises/{exerciseId}` on drag end. |
| **Clickable crop area** | Clicking anywhere on the crop area **toggles the practice timer** (starts or pauses). |

**Controls Bar (bottom part):**

| Control | Description |
|---------|-------------|
| **Stage dropdown** | A `<select>` showing the 5 user-configured stage names (defaults: "Not started", "Learning", "Slow & clean", "Up to tempo", "Mastered"). The text colour matches the stage colour. Changing the stage immediately PATCHes the server and updates the card's left border colour + the section nav pill colour. |
| **Timer play/pause button** | A small button with a play ▶ icon. Clicking it starts the timer for this exercise. While timing, the icon switches to pause ⏸ and the button turns red with a pulsing glow animation. |
| **Timer display** | Shows cumulative practice time for this exercise in `M:SS` or `H:MM:SS` format. Updates every second while the timer is running. |
| **Reps label + count** | Shows "Reps" label and the total reps count. |
| **+1 button** | Adds 1 rep, updates the display, and PATCHes the server immediately. Also sets `lastPracticedAt`. |
| **+5 button** | Adds 5 reps, same behaviour as +1. |

---

## Practice Timer Behaviour

The timer system is **single-exercise** — only one exercise can be timed at a time.

| Behaviour | Detail |
|-----------|--------|
| **Start** | Click the play button OR click the crop area. If another exercise was being timed, it stops first (saves its time). The card gets a `timing` CSS class. |
| **Pause/Stop** | Click the crop area again while timing, or click the play button. The `timing` class is removed. |
| **Auto-save** | Time is saved to the server every **30 seconds** during active timing. |
| **Save on stop** | Remaining unsaved time is saved when the timer stops. |
| **Inactivity timeout** | If no user interaction (click, touch, scroll, keypress) for **2 minutes**, the timer auto-pauses and saves. Any user interaction resets the inactivity countdown. |
| **Page unload** | The `beforeunload` event stops any active timer and saves. |
| **Visual feedback** | While timing: the play button turns red with a `pulse-glow` animation, the play icon swaps to a pause icon. |
| **Server persistence** | `PATCH /api/songs/{songId}/exercises/{exerciseId}` with `{ totalPracticedSeconds, lastPracticedAt }`. The total is cumulative (picks up from where it left off). |

---

## Crop Background Customisation

Each song has an optional `cropBgColor` setting.

- **Default**: transparent/white background, black sheet music notation.
- **Dark mode** (`#1e1e1e`): dark background with `invert(1)` + `mix-blend-mode: difference` on crop images, making notation appear white. Title text changes to light grey.
- Toggled via the light/dark switch in the Edit Exercises toolbar.
- Persisted per-song via `PATCH /api/songs/{songId}/display` with `{ cropBgColor }`.
- Applied on page load if the song has a saved dark background.

---

## Crop Resize (Edit Mode)

- Each exercise has an independent `cropScale` (default 100, range 30–300).
- In edit mode, a **drag handle** appears at the bottom of each card's crop area.
- Dragging vertically scales the crop images proportionally.
- On drag end, the new scale is saved via PATCH to the server.
- Scales are restored from `data-crop-scale` attributes on page load.

---

## Stage System

5 stages with colour coding:

| Stage | Default Name | Colour |
|-------|-------------|--------|
| 1 | Not started | `#ef4444` (red) |
| 2 | Learning | `#f97316` (orange) |
| 3 | Slow & clean | `#eab308` (yellow) |
| 4 | Up to tempo | `#84cc16` (lime) |
| 5 | Mastered | `#22c55e` (green) |

- Stage names are **user-configurable** via the Settings page.
- Stage colours are hardcoded (not configurable).
- Colours are used at various opacities: full for stage select text, 35% for card borders and section pill borders, 10% for section pill backgrounds, 70% for section pill text.

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| **Escape** | Closes any active practice session (stops timer), exits Edit Exercises mode, closes dropdown menus. |

---

## Data Persisted Per Exercise

All saved via `PATCH /api/songs/{songId}/exercises/{exerciseId}`:

| Field | Type | Description |
|-------|------|-------------|
| `stage` | int (1–5) | Current practice stage |
| `totalPracticedSeconds` | int | Cumulative seconds practiced |
| `totalReps` | int | Cumulative repetition count |
| `lastPracticedAt` | ISO string | Timestamp of last practice activity (timer or reps) |
| `cropScale` | float | Display scale of crop images (default 100) |

---

## Data Persisted Per Song (display)

Saved via `PATCH /api/songs/{songId}/display`:

| Field | Type | Description |
|-------|------|-------------|
| `cropBgColor` | string (hex) | Crop area background colour (empty string = default/white) |

---

## Navigation & Transitions

- The "Edit song" pencil in the header navigates to `/songs/{songId}/edit?from=practice`.
- When returning from the editor, a CSS animation (`returning-from-editor`) briefly applies to the view for a smooth transition. This is triggered by a `sessionStorage` flag (`avoidnt_from_editor`).

---

## What the Page Does NOT Have

- No reordering of exercises from this page (must use the editor).
- No adding/removing exercises (must use the editor).
- No renaming exercises (must use the editor).
- No editing sections/structure (must use the editor).
- No metronome or audio playback.
- No practice session history or session-level tracking (only cumulative totals).
- No filtering or sorting exercises.
- No bulk stage change (must change per-exercise).
- No notes/comments on exercises.
- No goal-setting or target timers.
