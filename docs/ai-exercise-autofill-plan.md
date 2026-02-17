# AI Exercise Auto-Fill — Implementation Plan

## Overview

This feature adds a single button — **"✨ Auto-label exercises"** — that appears once the user has (a) uploaded a PDF and (b) cropped at least one exercise. Clicking it sends the full page images plus the crop metadata to an AI endpoint, which returns structured labels for each exercise: a description, a section assignment, and a difficulty estimate. Only confident results are applied.

The existing `✨ Auto-fill with AI` button (metadata extraction: title, artist, tempo, sections) remains separate and unchanged. This new feature is complementary — it operates on exercises, not song metadata.

---

## Architecture Summary

```
User clicks "Auto-label exercises"
  → JS collects:
      1. All page images as JPEG data URLs (up to 10 pages)
      2. All exercise crop metadata (pageIndex, rect, id)
      3. Current song structure (sections already defined)
      4. Current song metadata (title, artist) for context
  → POST /api/label-exercises
  → Server:
      1. Builds a vision prompt with all pages as images
      2. Includes a structured description of each crop's location
      3. Asks GPT-4o to return a JSON array matching exercises to sections/descriptions
      4. Parses response, returns to client
  → JS merges results into exercises (only filling empty fields)
  → Re-renders exercise list
```

---

## Step 1: Define the API Contract

### Request: `POST /api/label-exercises`

```json
{
  "songTitle": "Yesterday",
  "artist": "The Beatles",
  "pageImages": [
    "data:image/jpeg;base64,/9j/4AAQ...",
    "data:image/jpeg;base64,/9j/4AAQ..."
  ],
  "sections": [
    { "id": "abc123", "type": "intro", "order": 0 },
    { "id": "def456", "type": "verse", "order": 1 },
    { "id": "ghi789", "type": "chorus", "order": 2 }
  ],
  "exercises": [
    {
      "id": "ex-001",
      "crops": [
        { "pageIndex": 0, "rect": { "x": 0.02, "y": 0.15, "w": 0.96, "h": 0.12 } }
      ],
      "currentName": "",
      "currentSectionId": "",
      "currentDifficulty": 0
    },
    {
      "id": "ex-002",
      "crops": [
        { "pageIndex": 0, "rect": { "x": 0.02, "y": 0.85, "w": 0.96, "h": 0.15 } },
        { "pageIndex": 1, "rect": { "x": 0.02, "y": 0.0,  "w": 0.96, "h": 0.10 } }
      ],
      "currentName": "",
      "currentSectionId": "",
      "currentDifficulty": 0
    }
  ]
}
```

**Key points:**
- `pageImages` — all converted page images (JPEG data URLs). Cap at 10 pages. The server can also accept `jobId` + `pageCount` and load from disk (same pattern as existing `HandleAnalyzePDF`).
- `sections` — the currently defined song sections. The AI must pick from these (or suggest new ones, but only if very confident).
- `exercises` — each exercise's ID, crop locations, and current field values. The AI should skip fields that are already filled.
- Multi-page crops are represented as 2 entries in the `crops` array with consecutive `pageIndex` values.

### Response: `LabelExercisesResponse`

```json
{
  "exercises": [
    {
      "id": "ex-001",
      "name": "Bars 1-4, melody line",
      "sectionId": "abc123",
      "confidence": "high"
    },
    {
      "id": "ex-002",
      "name": "Bars 8-12, chord progression",
      "sectionId": "def456",
      "confidence": "medium"
    }
  ],
  "suggestedSections": ["bridge", "outro"]
}
```

**Fields:**
- `id` — matches the exercise ID from the request.
- `name` — a short, descriptive name (e.g., "Bars 1-4", "Main riff", "Melody line bars 17-20"). **Only returned if the exercise's `currentName` was empty.**
- `sectionId` — ID of the matching section from the provided sections list. **Only returned if `currentSectionId` was empty.** If the AI can't confidently place it, this is `null`.
- `confidence` — `"high"`, `"medium"`, or `"low"`. The client will only apply `"high"` and `"medium"` results.
- `suggestedSections` — section types the AI noticed in the PDF that aren't in the current structure (e.g., the user hasn't added "bridge" yet but the PDF has one). The client can prompt the user to add these.

**The AI does NOT return `difficulty`.** Difficulty/stage is a practice-progress concept, not something derivable from sheet music. We don't guess it.

---

## Step 2: Build the GPT-4o Vision Prompt

### File: `handlers/label_exercises.go` (new file)

The prompt is the most critical piece. Here's the exact prompt to use:

```
SYSTEM PROMPT:
You are a sheet music analysis assistant. You will receive:
1. Images of sheet music pages (numbered Page 1, Page 2, etc.)
2. A list of cropped regions from those pages, each defined by page index and normalized coordinates (x, y, w, h where 0-1 represents the full page dimensions)
3. The song's current section structure (e.g., Intro, Verse, Chorus)
4. The song title and artist (if known)

Your task is to identify what each cropped region contains and assign it to the correct song section.

RULES:
- For each exercise, determine what part of the song it corresponds to based on its position in the sheet music.
- Look for section markers in the sheet music (text labels like "Verse", "Chorus", "Bridge", rehearsal marks like A, B, C, or double barlines that indicate section boundaries).
- Generate a short, useful name for each exercise. Prefer bar numbers if visible (e.g., "Bars 1-4"). If bar numbers aren't visible, describe the content briefly (e.g., "Opening melody", "Main riff"). Keep names under 40 characters.
- ONLY assign a sectionId if you are reasonably confident. If unsure, set sectionId to null.
- If a crop spans two consecutive pages, it means the musical content continues from the bottom of one page to the top of the next. Treat it as a single continuous passage.
- Some sheet music has "variations" or "alternatives" at the bottom (e.g., "Intro variation 1", "Verse alt ending"). These are practice variations, NOT part of the main song flow. If a crop covers a variation section, set its name to include "Variation:" prefix (e.g., "Variation: Intro alt ending") and set sectionId to null.
- Do NOT fill in fields that already have values (if currentName is non-empty, don't return a name for that exercise).
- Set confidence to "high" when section markers are clearly visible near the crop, "medium" when you're inferring from position/context, and "low" when you're guessing.
- If you notice section labels in the sheet music that aren't in the provided sections list, include them in suggestedSections.

Respond with ONLY a JSON object (no markdown fences) in this exact format:
{
  "exercises": [
    {
      "id": "exercise-id-here",
      "name": "Short description" | null,
      "sectionId": "section-id-here" | null,
      "confidence": "high" | "medium" | "low"
    }
  ],
  "suggestedSections": ["bridge", "outro"]
}

USER MESSAGE:
Song: "{title}" by "{artist}"

Current sections:
{for each section: "- {section.id}: {section.type} (position {section.order})"}

Exercises to label:
{for each exercise:
  "- Exercise {id}:
     Crops: [{pageIndex}: x={rect.x}, y={rect.y}, w={rect.w}, h={rect.h}}, ...]
     Current name: {currentName or "(empty)"}
     Current section: {currentSectionId or "(unassigned)"}
  "
}

[Attached: Page 1 image, Page 2 image, ...]
```

### Prompt Construction Notes

- The normalized coordinates (0-1) tell the AI exactly where on each page the crop sits. Combined with seeing the actual page images, the AI can visually locate each region.
- Include ALL pages, not just the ones with crops. Context matters — the AI needs to see the whole song structure to determine sections.
- The multi-page crop case is handled naturally: the AI sees both pages and the crop metadata tells it "this exercise spans page 3 bottom + page 4 top."

---

## Step 3: Backend Implementation

### 3.1 New File: `handlers/label_exercises.go`

```go
package handlers

// HandleLabelExercises handles POST /api/label-exercises
// 
// Flow:
// 1. Decode request body into LabelExercisesRequest
// 2. Validate: must have at least 1 exercise and either pageImages or jobId+pageCount
// 3. Load page images (from request body or from disk via jobId)
// 4. Cap at 10 pages
// 5. Build the GPT-4o vision prompt (system + user message with images)
// 6. Call OpenAI API with model "gpt-4o"
// 7. Parse JSON response (strip markdown fences if present, same as HandleAnalyzePDF)
// 8. Validate response: ensure exercise IDs match, confidence values are valid
// 9. Return LabelExercisesResponse
```

**Request struct:**

```go
type LabelExercisesRequest struct {
    SongTitle  string                    `json:"songTitle"`
    Artist     string                    `json:"artist"`
    PageImages []string                  `json:"pageImages"`  // data URLs
    JobID      string                    `json:"jobId"`       // alternative to pageImages
    PageCount  int                       `json:"pageCount"`   // alternative to pageImages
    Sections   []LabelSection            `json:"sections"`
    Exercises  []LabelExerciseInput      `json:"exercises"`
}

type LabelSection struct {
    ID    string `json:"id"`
    Type  string `json:"type"`
    Order int    `json:"order"`
}

type LabelExerciseInput struct {
    ID               string      `json:"id"`
    Crops            []LabelCrop `json:"crops"`
    CurrentName      string      `json:"currentName"`
    CurrentSectionID string      `json:"currentSectionId"`
    CurrentDifficulty int        `json:"currentDifficulty"`
}

type LabelCrop struct {
    PageIndex int        `json:"pageIndex"`
    Rect      models.Rect `json:"rect"`
}
```

**Response struct:**

```go
type LabelExercisesResponse struct {
    Exercises         []LabelExerciseResult `json:"exercises"`
    SuggestedSections []string              `json:"suggestedSections"`
}

type LabelExerciseResult struct {
    ID         string  `json:"id"`
    Name       *string `json:"name"`       // nil = don't change
    SectionID  *string `json:"sectionId"`  // nil = don't change
    Confidence string  `json:"confidence"` // "high", "medium", "low"
}
```

**Implementation notes:**
- Reuse the same OpenAI client setup as `HandleAnalyzePDF` (read `OPENAI_API_KEY` from env).
- Reuse the same image loading logic: if `pageImages` is provided, use those. If `jobId` + `pageCount` is provided, read from `data/converted/{jobId}/page_{n}.jpg` and base64 encode them.
- Reuse the same JSON response parsing logic (strip ```json fences).
- Set `max_tokens` to 2000 (responses should be small).
- Set `temperature` to 0.2 for consistency.

### 3.2 Register the Route

In your router setup (likely `main.go` or `routes.go`):

```go
mux.HandleFunc("POST /api/label-exercises", deps.HandleLabelExercises)
```

---

## Step 4: Frontend Implementation

All changes in `static/js/plan-designer.js`.

### 4.1 Add the Button to the Template

In `templates/plan-designer.html`, add a new button in the exercises header area, right next to or below the existing auto-fill section. Place it between the crop toolbar and the exercise list:

```html
<div id="pd-label-section" style="display:none; margin-bottom:12px;">
  <button id="pd-label-btn" class="auto-fill-btn" onclick="window.pdLabelExercises()">
    ✨ Auto-label exercises
  </button>
  <div id="pd-label-error" style="display:none; color:#ef4444; font-size:13px; margin-top:4px;"></div>
  <div id="pd-label-info" style="display:none; color:#6b7280; font-size:13px; margin-top:4px;"></div>
</div>
```

### 4.2 Show/Hide Logic

Add a function `updateLabelBtn()` that shows the label button only when:
- `jobId` and `pageCount` are set (PDF is uploaded)
- `exercises.length > 0` (at least one crop exists)

Call `updateLabelBtn()` after:
- `loadPageImages()` completes
- `addCropFromSelection()` adds a new exercise
- `pdDeleteExercise()` removes an exercise

### 4.3 Implement `pdLabelExercises()`

```javascript
window.pdLabelExercises = async function() {
    const btn = document.getElementById('pd-label-btn');
    const errorEl = document.getElementById('pd-label-error');
    const infoEl = document.getElementById('pd-label-info');
    
    errorEl.style.display = 'none';
    infoEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = '⏳ Analyzing exercises...';
    
    try {
        // 1. Collect page images as JPEG data URLs (reuse pattern from pdAutoFill)
        const pageImages = [];
        const imgs = document.querySelectorAll('#pd-pages-inner .page-image');
        const maxPages = Math.min(imgs.length, 10);
        
        for (let i = 0; i < maxPages; i++) {
            const img = imgs[i];
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            pageImages.push(canvas.toDataURL('image/jpeg', 0.8));
        }
        
        // 2. Build exercise metadata (only exercises that need labeling)
        const exerciseInputs = exercises.map(ex => ({
            id: ex.id,
            crops: ex.crops.map(c => ({
                pageIndex: c.pageIndex,
                rect: c.rect
            })),
            currentName: ex.description || '',
            currentSectionId: ex.sectionId || '',
            currentDifficulty: ex.difficulty || 0
        }));
        
        // 3. POST to /api/label-exercises
        const resp = await fetch('/api/label-exercises', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                songTitle: songTitle || '',
                artist: artist || '',
                pageImages: pageImages,
                sections: structure.map(s => ({ id: s.id, type: s.type, order: s.order })),
                exercises: exerciseInputs
            })
        });
        
        if (!resp.ok) {
            const errText = await resp.text();
            throw new Error(errText || 'Server error');
        }
        
        const result = await resp.json();
        
        // 4. Merge results into exercises
        let appliedCount = 0;
        let skippedCount = 0;
        
        for (const labelResult of (result.exercises || [])) {
            // Skip low-confidence results
            if (labelResult.confidence === 'low') {
                skippedCount++;
                continue;
            }
            
            const ex = exercises.find(e => e.id === labelResult.id);
            if (!ex) continue;
            
            // Only fill empty name
            if (labelResult.name && !ex.description) {
                ex.description = labelResult.name;
                appliedCount++;
            }
            
            // Only fill empty sectionId
            if (labelResult.sectionId && !ex.sectionId) {
                // Verify the sectionId actually exists in our structure
                if (structure.some(s => s.id === labelResult.sectionId)) {
                    ex.sectionId = labelResult.sectionId;
                    appliedCount++;
                }
            }
            
            updateCompleteness(ex);
        }
        
        // 5. Handle suggested sections
        if (result.suggestedSections && result.suggestedSections.length > 0 && structure.length > 0) {
            const existingTypes = new Set(structure.map(s => s.type.toLowerCase()));
            const newSuggestions = result.suggestedSections.filter(
                s => !existingTypes.has(s.toLowerCase())
            );
            if (newSuggestions.length > 0) {
                infoEl.textContent = `Tip: AI also detected these sections: ${newSuggestions.join(', ')}. Add them using the + button above.`;
                infoEl.style.display = 'block';
            }
        }
        
        // 6. Re-render
        if (appliedCount > 0) {
            isDirty = true;
            renderExercises();
            renderSectionPills();
            renderCropOverlaysAll(); // re-render all overlays to update complete state
        }
        
        btn.textContent = `✨ Auto-label exercises (${appliedCount} updated)`;
        setTimeout(() => {
            btn.textContent = '✨ Auto-label exercises';
        }, 3000);
        
    } catch (err) {
        errorEl.textContent = 'Auto-label failed: ' + err.message;
        errorEl.style.display = 'block';
        btn.textContent = '✨ Auto-label exercises';
    } finally {
        btn.disabled = false;
    }
};
```

### 4.4 Helper: `renderCropOverlaysAll()`

Add a small helper that re-renders crop overlays on all loaded page images:

```javascript
function renderCropOverlaysAll() {
    const wrappers = document.querySelectorAll('#pd-pages-inner .page-wrapper');
    wrappers.forEach((wrapper, idx) => {
        const img = wrapper.querySelector('.page-image');
        if (img && img.complete) {
            renderCropOverlays(wrapper.querySelector('.page-img-container'), idx, img);
        }
    });
}
```

---

## Step 5: Handling Edge Cases

### 5.1 Multi-Page Crops

The prompt explicitly describes multi-page crops to the AI:

```
- Exercise ex-002:
    Crops: [page 0: x=0.02, y=0.85, w=0.96, h=0.15], [page 1: x=0.02, y=0.0, w=0.96, h=0.10]
    Current name: (empty)
    Current section: (unassigned)
```

The system prompt instruction "If a crop spans two consecutive pages, treat it as a single continuous passage" handles this. The AI sees both full page images and understands the crop straddles the page break.

### 5.2 Variations / Alternative Sections

The prompt instructs the AI to:
- Detect text like "variation", "alt", "alternative", "ossia" near a crop
- Prefix the name with "Variation:" 
- Set `sectionId` to `null` (don't assign to main song structure)

This way variations get labeled descriptively but don't pollute the song structure.

### 5.3 Exercises With Existing Labels

The request includes `currentName` and `currentSectionId`. The prompt says "Do NOT fill in fields that already have values." The client also double-checks: it won't overwrite non-empty fields even if the AI returns values.

### 5.4 No Sections Defined Yet

If the user hasn't added any sections before clicking auto-label:
- The AI can't assign `sectionId` (no IDs to reference)
- The AI will return `sectionId: null` for all exercises
- `suggestedSections` will contain the section types it detected
- The info message will tell the user to add sections first (or use the suggestion)

This is fine — the user can add sections, then re-run the labeling.

### 5.5 Very Long PDFs (>10 pages)

Cap at 10 page images in the request. If the PDF has more than 10 pages:
- Send the first 10 pages
- For exercises on pages 11+, still include their crop metadata but note in the prompt that images beyond page 10 are not included
- The AI will return `confidence: "low"` for those exercises (the client will skip them)

### 5.6 OpenAI API Key Not Configured

Same pattern as existing auto-fill: if `OPENAI_API_KEY` is not set, the endpoint returns a 400 error. The button can be hidden entirely by checking a data attribute set by the template (same approach as the existing auto-fill button).

Add to the template:
```html
data-has-openai="{{if env "OPENAI_API_KEY"}}true{{else}}false{{end}}"
```

(Or reuse whatever mechanism the existing auto-fill button uses to show/hide itself.)

---

## Step 6: UX Flow Summary

```
1. User uploads PDF                    → pages load, "Auto-fill with AI" appears
2. User clicks "Auto-fill with AI"     → title, artist, tempo, sections extracted  
3. User draws crops on pages           → exercise cards created
4. "Auto-label exercises" button appears
5. User clicks "Auto-label exercises"  → exercises get names + section assignments
6. User reviews, fixes anything wrong  → manual tweaks
7. User clicks Save                    → done
```

The ideal flow is: upload → auto-fill metadata → crop exercises → auto-label → minor tweaks → save. Two AI calls total, each doing one thing well.

---

## Step 7: Testing Checklist

Before considering this complete, verify:

- [ ] **Happy path**: Upload PDF, add sections via auto-fill, crop 3+ exercises, auto-label → names and sections populated
- [ ] **Multi-page crop**: Crop spanning page boundary gets labeled correctly
- [ ] **Partial labeling**: Some exercises already labeled → those are skipped, only empty ones filled
- [ ] **No sections**: Auto-label with no sections defined → exercises get names but no section assignment, suggested sections shown
- [ ] **Variations**: Crop a "variation" section at bottom of PDF → name prefixed with "Variation:", no section assigned
- [ ] **Re-run**: Click auto-label again after partial manual edits → only empty fields filled, existing work preserved
- [ ] **Large PDF (10+ pages)**: First 10 pages sent, exercises on later pages gracefully handled
- [ ] **Error handling**: Network error, API error, invalid response → error message shown, no state corruption
- [ ] **No API key**: Button hidden or shows appropriate message
- [ ] **Save after auto-label**: All auto-labeled data persists correctly through save flow

---

## File Changes Summary

| File | Change |
|------|--------|
| `handlers/label_exercises.go` | **NEW** — `HandleLabelExercises` handler, request/response structs, prompt builder, OpenAI call |
| `main.go` (or `routes.go`) | Add route: `POST /api/label-exercises` → `deps.HandleLabelExercises` |
| `templates/plan-designer.html` | Add label button section, `pd-label-section`, `pd-label-btn`, `pd-label-error`, `pd-label-info` |
| `static/js/plan-designer.js` | Add `pdLabelExercises()`, `updateLabelBtn()`, `renderCropOverlaysAll()`, wire up show/hide logic |
| `static/css/app.css` | No changes needed — reuse `.auto-fill-btn` class for the new button |

---

## Implementation Order

1. **Backend first**: Create `handlers/label_exercises.go` with the handler, prompt construction, and OpenAI call. Register the route. Test with curl.
2. **Template**: Add the button HTML to `plan-designer.html`.
3. **Frontend**: Implement `pdLabelExercises()`, `updateLabelBtn()`, and `renderCropOverlaysAll()` in `plan-designer.js`.
4. **Integration test**: Full flow — upload, auto-fill, crop, auto-label, save.
5. **Edge case testing**: Multi-page crops, variations, re-runs, missing API key.
