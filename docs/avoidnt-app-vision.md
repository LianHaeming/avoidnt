# Avoidnt — App Vision: Library & Exercise Views

> Thinking from the perspective of a guitar student with 200+ songs loaded, using this app daily for a year.

---

## The Problem at 200 Songs

Right now your library is a flat wall of identical-looking album art cards. With 3 songs that's fine. With 200, you're scrolling forever, you can't find anything, and the app gives you no guidance on *what to practice today*. The homepage needs to shift from "here are your songs" to **"here's what matters right now."**

---

## Library View (Homepage) — Redesign

### Header Bar (persistent across all views)

The header currently has "Avoidnt" on the left and a user icon on the right. Here's what it should grow into:

```
┌──────────────────────────────────────────────────────────────────┐
│  Avoidnt          [🔍 Search...]          [+]    [🎸]    [👤]  │
└──────────────────────────────────────────────────────────────────┘
```

**Left:** App name (clicking it always returns to library/home).

**Centre:** Search bar — this is the most important addition. With 200 songs, search is not optional. It should search song titles, artist names, and tags. On mobile, collapse to a 🔍 icon that expands into a full-width search overlay.

**Right, in order:**

- **+ button** — Add new song. The most common primary action, always accessible. Much better than the current floating bottom-right button which is easy to miss and feels like a mobile afterthought on desktop.
- **🎸 Guitar Tools** — A dropdown/popover with quick-access reference tools: chord chart, scale diagrams, fretboard note map, tuner link. These aren't features you build now — they can start as links to static images or simple reference pages you create once. The point is: this app becomes the student's *home base*, and having quick references in the header makes it sticky. You can hide this icon until you have at least one tool built, but reserve the architectural space for it.
- **👤 Profile/Settings** — as you have now.

**What should NOT go in the header:** Anything song-specific. The header is app-level navigation only. When you're inside a song's practice view, the header stays the same — it's your "escape hatch" back to the library and your access to app-wide tools.

---

### Main Content Area

Instead of two flat sections ("Recently Practiced" and "All Songs"), the homepage should have **purpose-driven sections** that adapt based on your data:

#### Section 1: "Continue Practicing" — the hero section

This replaces "Recently Practiced" but is smarter. Show 3–5 songs that you were *actively working on* — songs where you have exercises that are NOT at Stage 5 (Mastered) and that you practiced in the last 7–14 days. Horizontal scroll row, slightly larger cards than the grid below.

This is the Spotify "Continue Listening" / Netflix "Continue Watching" pattern. The user opens the app, sees their active work, taps one, and they're practicing **in under 3 seconds**. That's the goal — minimum friction from app-open to guitar-in-hands.

**Card design for this row should show:**
- Album art / thumbnail (small, left-aligned)
- Song title + artist
- A **mini progress bar** underneath (e.g. "4/7 exercises mastered")
- Optionally: "Last practiced 2 days ago" in very small muted text

That progress bar is the key differentiator from what you have now — it tells you at a glance how close you are to completing a song without having to enter it.

#### Section 2: "Needs Attention" — songs going stale

Songs you haven't practiced in 2+ weeks but still have un-mastered exercises. A gentle nudge. Smaller horizontal-scroll row. Maybe a subtle warm/orange accent to signal "don't forget about these."

This is where the app shifts from a *filing cabinet* to a *coach*. You don't even need to say "you should practice this" — just showing the row is the nudge. If someone has 200 songs and 40 of them are stale, seeing that row every time they open the app creates gentle accountability.

**When this section is empty** (everything recently practiced or everything mastered), don't show it. Sections should appear and disappear based on data — not be permanent fixtures with empty states.

#### Section 3: "All Songs" — the full searchable library

This is the fallback for finding anything. It needs real organisation tools:

**Filter chips (horizontal row above the list):**
- By progress: All / In Progress / Mastered / Not Started
- By tag: whatever tags the user has created (Rock, Classical, Exercises, etc.)

**Sort dropdown (small, top-right of section):**
- Last Practiced (default — what you were working on most recently)
- Alphabetical (A→Z)
- Date Added (newest first)
- Progress (least complete → most complete — "what needs the most work")

**View toggle: Grid vs List.**

Grid is what you have now — album art cards. Good for visual browsing when you have 10–30 songs.

List is what you need at 200 songs. It should look something like:

```
┌──────────────────────────────────────────────────────────────┐
│  [art]  Tears in Heaven          Eric Clapton     ████░░ 4/7 │
│  [art]  Stairway to Heaven       Led Zeppelin     ██░░░░ 2/8 │
│  [art]  Scale Exercise - Am      —                ██████ 6/6 │
│  [art]  Fingerpicking Pattern 3  —                ░░░░░░ 0/4 │
└──────────────────────────────────────────────────────────────┘
```

Small album art (40×40px), title, artist, and a mini progress bar with a fraction. Dense, scannable, efficient. This is the view that *actually works* at scale. The grid view is prettier; the list view is functional. Let the user choose.

#### Section 4 (future): Practice Stats Summary

A small card at the top of the homepage: "You've practiced 3 days this week" / "45 minutes today" / "12-day streak." Not essential for MVP, but **reserve the space** above Section 1. This is the kind of feature that makes people open the app even when they're not sure they want to practice — to check their streak.

---

### Tags / Organisation System

For organising 200 songs, start with **tags** (not folders). Tags are more flexible — a song can be tagged both "Rock" and "Fingerpicking" and "Intermediate." Folders force a single hierarchy, and you'll constantly argue with yourself about whether "Tears in Heaven" goes in the "Classic Rock" folder or the "Fingerpicking" folder. Tags eliminate that problem.

**Predefined tag categories to offer:**
- Genre: Rock, Classical, Jazz, Blues, Pop, Folk
- Type: Song, Exercise, Scale, Warm-up, Etude
- Difficulty: Beginner, Intermediate, Advanced
- Custom: anything the user types

Tags are added during song creation (the metadata step) and editable later. In the library, tags appear as filter chips. On each song card/row, show 1–2 tags as small badges.

If you later want folders/collections (e.g. "Songs my teacher assigned"), you can layer them on top of tags. But tags first.

---

## Exercise / Practice View — Redesign

This is where the actual learning happens, so it needs to be the most thoughtfully designed view.

### Song Info Panel (top of page)

What you have now is a good start — album art, title, artist, BPM, YouTube/Spotify links, section pills. Here's what to add and refine:

**Song-level additions:**
- **Progress summary:** "5 of 8 exercises mastered" with a visual progress bar. This gives the student immediate orientation — "I'm 60% done with this song."
- **Total practice time:** "4h 23m total" — satisfying to see, motivates continued effort.
- **Last practiced:** "2 days ago" — context for how fresh your memory is.
- **"View PDF" button:** Opens the original sheet music PDF in a side panel (desktop) or full-screen overlay (mobile). Students constantly need to reference the full sheet — to see context around a crop, check key signatures, read notes the crop didn't capture. This is probably the **single most important missing feature** for serious use.
- **Song structure map:** A small horizontal visual showing Intro → Verse → Chorus → Verse → Chorus → Bridge → Chorus → Outro, colour-coded to match section pills. Tapping a section scrolls to those exercises. This is both informational ("where am I in the song") and navigational ("jump to the bridge exercises").

**Section pills improvement:**
The coloured pills (Intro, Verse, Chorus, etc.) currently seem decorative. Make them **functional filters**: tapping "Chorus" shows only Chorus exercises, dimming or hiding the others. Tapping again shows all. This is crucial at scale — a song might have 15+ exercises across 8 sections. Being able to filter to just the Bridge exercises is powerful.

### Exercise Cards — Rethought

The current cards show the crop image, stage dropdown, play/timer, and reps. Here's the redesigned card:

**Always visible on the card (collapsed state):**
- Crop image (the sheet music snippet) — this is the hero content, keep it prominent
- Exercise name — e.g. "Main riff", "Bars 12–16"
- Section label — "Intro" / "Verse 2" etc., small coloured badge
- Stage indicator — a **coloured left border** on the card (red → orange → yellow → lime → green) plus small text: "Slow & Clean" / "Up to Tempo" etc.
- Last practiced — "2 days ago" or "Never" — creates gentle urgency

**Revealed on tap/expand:**
- Timer controls (play/pause + time display)
- Rep counter (+1, +5)
- Stage change dropdown
- Edit name / delete (only in expanded state, not in a three-dot menu)
- Any per-exercise notes the user has written

This keeps the default view **clean and scannable** — you see all your exercises at a glance with their status. Tap to expand one and interact with it. This is especially critical on mobile where space is precious.

### View Mode Toggles

Add a small toggle/dropdown above the exercise list:

- **Song Order** (default) — exercises in the order they appear in the song
- **Needs Work** — sorted by stage, lowest (Stage 1) first. "What should I practice right now?"
- **By Section** — grouped: all Verses together, all Choruses together. Good for drilling a specific section type.
- **Transitions** (future) — pairs of consecutive exercises shown side by side for practicing how sections connect

### New Features for the Exercise View

#### 1. PDF Viewer (high priority)
A button that opens the full PDF in a side panel (desktop) or overlay (mobile). Students constantly reference the original. The crop is just a snippet — the full sheet gives context. Implementation: serve the converted page images in a scrollable viewer, or use a basic PDF.js embed.

#### 2. Song Notes / Journal
A collapsible free-text area per song: "Remember to mute the 5th string in the chorus" / "Teacher said work on hammer-ons in bar 23." This is personal, messy, and incredibly useful. Just a textarea that saves via htmx on blur. Put it in a collapsible section below the song info panel — always accessible but not in the way.

#### 3. Key / Scale Reference (future)
If the user (or AI) has set the key of the song, show: "Key: A minor" and optionally a small fretboard diagram for the A minor scale. This turns the practice view into a self-contained learning environment. You don't need to leave the app to look up the scale. Start with just the text label; add the visual diagram later.

#### 4. Smart Practice Suggestion (future, algorithm-driven)
A "What to practice" button that generates a recommended sequence based on stage, last practiced date, and difficulty. E.g.: "Start with Exercise 3 (Stage 1 — most urgent), then Exercise 5 (Stage 2, not practiced in 5 days), then run through Exercises 1→2→3 for transitions." This is the feature that makes the app *genuinely* irreplaceable.

#### 5. Metronome (future)
A built-in metronome that defaults to the song's BPM. Shows as a floating bar at the bottom of the practice view. Can be slowed (50%, 75%, 100% tempo) for slow-practice stages. Every guitar student uses a metronome — having it in-app means one less thing to set up before practicing.

---

## Where Features Live — The Architecture Map

As you add features over the next year, this map tells you where each one belongs:

```
┌─────────────────────────────────────────────────────────────┐
│  HEADER (persistent, all views)                             │
│  ├── App logo → navigates to Library                        │
│  ├── Search (global: songs, artists, tags)                  │
│  ├── + Add Song                                             │
│  ├── 🎸 Guitar Tools (reference dropdown)                   │
│  │   ├── Chord chart                                        │
│  │   ├── Scale diagrams                                     │
│  │   ├── Fretboard note map                                 │
│  │   ├── Tuner (link or embedded)                           │
│  │   └── Common progressions cheat sheet                    │
│  └── 👤 Profile & Settings                                  │
├─────────────────────────────────────────────────────────────┤
│  LIBRARY VIEW (homepage)                                    │
│  ├── Practice Stats summary (future — streak, time today)   │
│  ├── Continue Practicing (smart horizontal row)             │
│  ├── Needs Attention (stale songs row)                      │
│  ├── All Songs                                              │
│  │   ├── Filter chips (tags, progress status)               │
│  │   ├── Sort dropdown (last practiced, alpha, progress)    │
│  │   ├── View toggle (grid / list)                          │
│  │   └── Song cards/rows                                    │
│  └── [no delete here — that's inside the song]              │
├─────────────────────────────────────────────────────────────┤
│  PRACTICE VIEW (song selected)                              │
│  ├── Song info (art, title, BPM, links, progress bar)       │
│  ├── Song structure map (clickable section navigation)      │
│  ├── Section filter pills (tap to filter exercises)         │
│  ├── View mode toggle (song order / needs work / by section)│
│  ├── Exercise cards (expandable — controls hidden by default│
│  ├── View PDF button → side panel / overlay                 │
│  ├── Song Notes / Journal (collapsible)                     │
│  ├── Key / Scale reference (future)                         │
│  ├── Smart Practice button (future)                         │
│  ├── Metronome (future — floating bottom bar)               │
│  └── Delete Song (very bottom, danger zone)                 │
├─────────────────────────────────────────────────────────────┤
│  SONG EDITOR (edit mode, entered from practice view)        │
│  ├── PDF viewer (left panel, slides in)                     │
│  ├── Crop selection tool                                    │
│  ├── Exercise metadata forms (right panel)                  │
│  └── Song metadata (title, artist, structure, tags)         │
├─────────────────────────────────────────────────────────────┤
│  SETTINGS                                                   │
│  ├── Account (name, email, password)                        │
│  ├── Stage definitions (customise the 5 stages)             │
│  ├── Practice preferences (show/hide reps, default timer)   │
│  ├── Data export / backup                                   │
│  └── About / Feedback                                       │
└─────────────────────────────────────────────────────────────┘
```

**The principle:** Each view has one job.
- Library's job → "Find and choose what to practice"
- Practice view's job → "Practice and track progress"
- Editor's job → "Set up and modify exercises"
- Guitar Tools → "Quick reference without leaving the app"
- Settings → "Configuration and account"

If a feature doesn't clearly belong to a view's job, it's either in Guitar Tools (reference material) or Settings (configuration). This keeps every view focused and prevents feature bloat in any one screen.

---

## What Makes This App Special (1 Year From Now)

The unique value isn't "upload sheet music and crop it." Any PDF app does viewing. The value is:

1. **Intelligent practice guidance** — the app knows what you're weak at and tells you what to work on next. No other guitar app does this at the exercise/crop level.
2. **Progress that feels real** — coloured stages, progress bars, time invested, streaks. You can *see* yourself improving. This creates the motivation loop.
3. **Zero friction** — open the app → see active songs → tap → practicing. Under 3 seconds. Every extra click you remove between "I should practice" and "I'm practicing" is worth 10 features.
4. **Self-contained** — PDF, metronome, chord references, notes, teacher's comments — everything in one place. You don't leave the app. Every time the student has to switch to another app (for a metronome, for the PDF, for a chord chart), there's a chance they get distracted and don't come back.

**That's the north star.** Every feature decision should be filtered through: *does this make the practice experience faster, smarter, or more satisfying?* If it doesn't clearly do one of those three things, it probably doesn't belong in the app.
