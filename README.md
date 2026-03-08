# Quran Memorization Tracker

A smart, offline-first web app that helps you **track Quran memorization progress** and **schedule revisions** using the FSRS v4 spaced repetition algorithm — the same science behind Anki's modern scheduler.

Built with React 19 + Vite 7. Zero backend — everything runs in your browser and persists to `localStorage`.

---

## Table of Contents

- [Features](#features)
- [Screenshots & UI Overview](#screenshots--ui-overview)
- [Getting Started](#getting-started)
- [Architecture Overview](#architecture-overview)
- [Data Model](#data-model)
- [FSRS v4 Algorithm](#fsrs-v4-algorithm)
- [Page Merging System](#page-merging-system)
- [State Management & Persistence](#state-management--persistence)
- [Component Tree](#component-tree)
- [Data Flow](#data-flow)
- [File Reference](#file-reference)

---

## Features

### Memorization Tracking
- **Log memorized sections** by surah and verse range (e.g., Al-Baqarah 1–20)
- **Fractional verse support** — split memorization across sessions (e.g., end at verse "5.2", continue next time from verse "5")
- **Automatic page merging** — entries that cover an entire Quran page are consolidated into a single page-level unit
- **21-day new period** — freshly memorized sections stay in the "new" category for daily review before graduating to spaced repetition

### Smart Revision Scheduling (FSRS v4)
- **Per-verse FSRS tracking** — each of the 6,236 Quran verses has its own spaced repetition card
- **Pre-computed snapshots** — O(1) lookup per verse instead of replaying revision history
- **Intelligent prioritization** — never-reviewed pages surface first, then lowest retention, then most overdue
- **Retention estimates** — see predicted recall probability for each page

### Revision Logging
- **Full form** with surah/verse range, quality rating (1–5), and date
- **Inline quick-log** — one-tap quality chips directly on suggestion cards
- **Quality scale**: Poor (1) → Weak (2) → Okay (3) → Good (4) → Solid (5)

### Dashboard
- **Due Now** — overdue pages with color-coded urgency (yellow = never reviewed, red = overdue)
- **Coming Up** — next 5 pages approaching their review date
- **New Memorization** — daily revision section grouped by Quran page
- **Page badges** — every suggestion shows which Quran page (p.XXX) it falls on

### Data Management
- **Export/Import** — JSON backup and restore
- **Schema versioning** — automatic migration when the data format evolves
- **Crash-safe persistence** — corrupt localStorage is detected and gracefully reset

---

## Screenshots & UI Overview

```
┌─────────────────────────────────────────────────┐
│           Quran Memorization Tracker             │
├─────────────────────────────────────────────────┤
│                                                  │
│  📋 Suggestions                                  │
│  ┌─────────────────────────────────────────┐     │
│  │ 🟡 New Memorization (daily for 21 days) │     │
│  │   ┌─ Page 5 ──────────────────────┐     │     │
│  │   │ Al-Baqarah 1 → 5    [Log Rev] │     │     │
│  │   │  ▸ Individual entries...       │     │     │
│  │   └────────────────────────────────┘     │     │
│  │                                          │     │
│  │ 🔴 Due for Revision (FSRS)              │     │
│  │   ┌────────────────────────────────┐     │     │
│  │   │ p.305  Al-Kahf 1–8   [Log Rev]│     │     │
│  │   │ Retention: 72%  Overdue: 3d    │     │     │
│  │   │ Reviewed: 8/8 verses           │     │     │
│  │   └────────────────────────────────┘     │     │
│  │                                          │     │
│  │ 🟢 Coming Up                             │     │
│  │   ┌────────────────────────────────┐     │     │
│  │   │ p.292  Al-Israa 30–40         │     │     │
│  │   │ Due in 2.3 days                │     │     │
│  │   └────────────────────────────────┘     │     │
│  └──────────────────────────────────────────┘    │
│                                                  │
│  ➕ Log Memorization    [Form]                   │
│  ➕ Log Revision        [Form]                   │
│  📜 Revision Log        [Paginated List]         │
│  📖 Memorized Sections  [New | Old]              │
│                                                  │
│  [Export] [Import] [Load Test Data] [Clear All]  │
└──────────────────────────────────────────────────┘
```

---

## Getting Started

```bash
# Clone and enter the project
cd quran-tracker-simple

# Install dependencies
npm install

# Start dev server (http://localhost:5173)
npm run dev

# Production build
npm run build
npm run preview
```

**Requirements:** Node.js 18+, npm 9+

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                     Browser (Client-Only)                     │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────┐    ┌──────────────┐    ┌─────────────────┐  │
│  │  React 19   │───▶│  Vite 7 Dev  │───▶│  Static Build   │  │
│  │  Components │    │  Server/HMR  │    │  (dist/)        │  │
│  └──────┬──────┘    └──────────────┘    └─────────────────┘  │
│         │                                                     │
│  ┌──────▼──────────────────────────────────────────────────┐  │
│  │                    App State Layer                       │  │
│  │  entries[] ─── revisions[] ─── verseSnapshot{}          │  │
│  │       │              │               │                  │  │
│  │       ▼              ▼               ▼                  │  │
│  │   useDebouncedWrite (300ms) ──▶ localStorage            │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                 Static Data (public/data/)              │  │
│  │  surah_index.json │ verse_data.json │ pageMap.json      │  │
│  │  (114 surahs)     │ (604 pages)     │ (6,236 verses)   │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                  Algorithm Layer                         │  │
│  │  FSRS v4 Engine ─── Page Merger ─── Partial Resolver    │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
└──────────────────────────────────────────────────────────────┘

   No server. No database. No network calls (after initial load).
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| UI Framework | React 19.2 |
| Build Tool | Vite 7.3 |
| Spaced Repetition | FSRS v4 (custom implementation) |
| Persistence | localStorage with debounced writes |
| Styling | Vanilla CSS (~530 lines) |
| State Management | React hooks (`useState`, `useMemo`, `useCallback`) |
| External Dependencies | **None** beyond React — zero runtime packages |

---

## Data Model

### Entity Relationship Diagram

```
┌─────────────────────────────┐
│     Memorization Entry      │
├─────────────────────────────┤
│ id          (UUID)          │
│ startSurah  (1–114)        │
│ startVerse  (string, "5.2")│
│ endSurah    (1–114)        │
│ endVerse    (string, "20") │
│ createdAt   (ISO date)     │
│ updatedAt   (ISO date)     │
├─────────────────────────────┤
│ After page merge:           │
│ pageNum     (1–604)        │
│ sourceIds   (UUID[])       │
│ sourceCount (number)       │
└─────────────────────────────┘

┌─────────────────────────────┐
│      Revision Entry         │
├─────────────────────────────┤
│ id          (UUID)          │
│ startSurah  (1–114)        │
│ startVerse  (string)       │
│ endSurah    (1–114)        │
│ endVerse    (string)       │
│ quality     (1–5)          │
│ createdAt   (ISO date)     │
└─────────────────────────────┘

┌─────────────────────────────┐
│   Verse FSRS Snapshot       │
├─────────────────────────────┤
│ Key: "surahNum:verseNum"    │
│ ┌─────────────────────────┐ │
│ │ stability   (float)     │ │
│ │ difficulty  (1–10)      │ │
│ │ lastReview  (ISO date)  │ │
│ │ reps        (integer)   │ │
│ └─────────────────────────┘ │
│                             │
│ 6,236 possible keys        │
│ (one per Quran verse)       │
└─────────────────────────────┘
```

### localStorage Schema

```
┌─────────────────────────────────┬─────────────────────────────────┐
│ Key                             │ Value                           │
├─────────────────────────────────┼─────────────────────────────────┤
│ quran-memorization-entries      │ JSON array of entries           │
│ quran-revision-entries          │ JSON array of revisions         │
│ quran-verse-fsrs-state          │ JSON object: verse → card state │
│ quran-tracker-schema-version    │ "2"                             │
└─────────────────────────────────┴─────────────────────────────────┘
```

### Static Reference Data

```
surah_index.json                 verse_data.json                  pageMap.json
┌──────────────────────┐         ┌──────────────────────┐         ┌────────────────┐
│ {                    │         │ { pages: {           │         │ {              │
│   "Al-Faatiha": {    │         │   "1": {             │         │   "1:1": 1,    │
│     numSurah: 1,     │         │     pageNum: 1,      │         │   "1:2": 1,    │
│     numVerses: 7,    │         │     totalWords: 29,  │         │   "1:3": 1,    │
│     startPage: 1,    │         │     verses: [        │         │   ...          │
│     endPage: 1       │         │       { surahNum: 1, │         │   "2:142": 22, │
│   },                 │         │         verseNum: 1, │         │   ...          │
│   "Al-Baqara": {     │         │         wordCount: 4 │         │   "114:6": 604 │
│     numSurah: 2,     │         │       },             │         │ }              │
│     numVerses: 286   │         │       ...            │         │ (6,236 entries)│
│   }, ...             │         │     ]                │         └────────────────┘
│ }                    │         │   }, ...             │
│ (114 surahs)         │         │ } }                  │
└──────────────────────┘         │ (604 pages)          │
                                 └──────────────────────┘
```

---

## FSRS v4 Algorithm

The app implements the **Free Spaced Repetition Scheduler v4** — a modern, mathematically-grounded algorithm that models memory decay as a power function and adapts review intervals based on item difficulty and review history.

Reference: [open-spaced-repetition/fsrs4anki](https://github.com/open-spaced-repetition/fsrs4anki)

### How It Works

```
                        User reviews a verse
                               │
                               ▼
                    ┌──────────────────────┐
                    │  Quality Rating 1–5  │
                    │  Poor → Weak → Okay  │
                    │   → Good → Solid     │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │  Map to FSRS Grade   │
                    │  1→Again  2→Hard     │
                    │  3,4→Good  5→Easy    │
                    └──────────┬───────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
     ┌────────▼──────┐  ┌─────▼──────┐  ┌──────▼──────┐
     │ First Review? │  │ Grade = 1  │  │ Grade ≥ 2   │
     │ Initialize    │  │ (Again)    │  │ (Pass)      │
     │ S = W[g-1]    │  │ Stability  │  │ Stability   │
     │ D = init(g)   │  │ decreases  │  │ increases   │
     └───────────────┘  └────────────┘  └─────────────┘
                               │
                    ┌──────────▼───────────┐
                    │  Updated Card State  │
                    │  { stability,        │
                    │    difficulty,        │
                    │    lastReview,        │
                    │    reps }             │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │  Compute Next        │
                    │  Review Interval     │
                    │  I = 9·S·(1/R - 1)   │
                    │  (capped at 14 days) │
                    └──────────────────────┘
```

### Core Equations

**Memory Retrievability** — probability of recall after *t* days with stability *S*:

```
R(t, S) = (1 + t / (9·S))⁻¹
```

**Next Interval** — days until the next review is needed (targeting 90% retention):

```
I(S) = 9·S · (1/R_target - 1)
```

When R_target = 0.9, this simplifies to I(S) ≈ S.

**Stability After Successful Review** (grade ≥ 2):

```
S' = S · (e^W₈ · (11 - D) · S^(-W₉) · (e^(W₁₀·(1-R)) - 1) · m_grade + 1)
```

Where m_grade is: W₁₅ for Hard, 1 for Good, W₁₆ for Easy.

**Stability After Failed Review** (grade = 1, Again):

```
S' = W₁₁ · D^(-W₁₂) · ((S+1)^W₁₃ - 1) · e^(W₁₄·(1-R))
```

**Difficulty Update** (mean-reverting):

```
D' = W₇ · W₄ + (1 - W₇) · (D - W₆ · (g - 3))
```

### FSRS Parameters (W₀–W₁₆)

```
┌──────┬────────┬─────────────────────────────────────┐
│ Param│ Value  │ Purpose                             │
├──────┼────────┼─────────────────────────────────────┤
│ W₀   │ 0.40   │ Initial stability: Again            │
│ W₁   │ 0.60   │ Initial stability: Hard             │
│ W₂   │ 2.40   │ Initial stability: Good             │
│ W₃   │ 5.80   │ Initial stability: Easy             │
│ W₄   │ 4.93   │ Initial difficulty mean             │
│ W₅   │ 0.94   │ Initial difficulty grade modifier   │
│ W₆   │ 0.86   │ Difficulty reversion to mean        │
│ W₇   │ 0.01   │ Difficulty mean reversion weight    │
│ W₈   │ 1.49   │ Stability increase (base)           │
│ W₉   │ 0.14   │ Stability penalty for difficulty    │
│ W₁₀  │ 0.94   │ Stability bonus for low recall      │
│ W₁₁  │ 2.18   │ Fail stability (base)               │
│ W₁₂  │ 0.05   │ Fail stability difficulty factor    │
│ W₁₃  │ 0.34   │ Fail stability prev-S factor        │
│ W₁₄  │ 1.26   │ Fail stability retrievability factor│
│ W₁₅  │ 0.29   │ Hard multiplier                     │
│ W₁₆  │ 2.61   │ Easy multiplier                     │
└──────┴────────┴─────────────────────────────────────┘
```

### Per-Verse Snapshot System

Instead of replaying the entire revision history on every render, the app maintains a **pre-computed snapshot** mapping each verse to its current FSRS card state.

```
Revision History                          Verse Snapshot
┌──────────────────────────┐             ┌───────────────────────────────┐
│ Rev 1: Al-Baqarah 1–5   │──apply──▶   │ "2:1" → { S:2.4, D:4.9, ... }│
│   quality: 4, Jan 5     │             │ "2:2" → { S:2.4, D:4.9, ... }│
│                          │             │ "2:3" → { S:2.4, D:4.9, ... }│
│ Rev 2: Al-Baqarah 1–5   │──apply──▶   │ "2:4" → { S:2.4, D:4.9, ... }│
│   quality: 3, Jan 8     │             │ "2:5" → { S:2.4, D:4.9, ... }│
│                          │             │                               │
│ Rev 3: Al-Baqarah 3–10  │──apply──▶   │ "2:6" → { S:2.4, D:4.9, ... }│
│   quality: 5, Jan 12    │             │ "2:7" → { S:2.4, D:4.9, ... }│
│                          │             │ ...                           │
└──────────────────────────┘             └───────────────────────────────┘
                                           Snapshot is the SOURCE OF TRUTH
                                           for FSRS computations.
```

**Update strategies:**

| Operation | Strategy | Complexity |
|-----------|----------|------------|
| Add revision | Incremental — `applyRevisionToSnapshot()` | O(verses in range) |
| Edit revision | Full rebuild — `rebuildSnapshot()` | O(total revisions × avg range) |
| Delete revision | Full rebuild — `rebuildSnapshot()` | O(total revisions × avg range) |
| Import data | Full rebuild — `rebuildSnapshot()` | O(total revisions × avg range) |
| Schema migration | Full rebuild (once) | O(total revisions × avg range) |

### Page-Level Aggregation

Suggestions are displayed at the **page level** (not individual verses). The aggregation works as follows:

```
Page 305 has verses: 18:1, 18:2, 18:3, 18:4, 18:5, 18:6, 18:7, 18:8

Per-verse snapshot lookup (O(1) each):
  18:1 → R=0.82, dueIn=-1.2, reps=3
  18:2 → R=0.78, dueIn=-2.0, reps=2
  18:3 → R=0.91, dueIn= 1.5, reps=4
  18:4 → R=0.85, dueIn=-0.3, reps=3
  18:5 → R=0.70, dueIn=-3.1, reps=2     ← most urgent verse
  18:6 → R=0.88, dueIn= 0.2, reps=3
  18:7 → (never reviewed)  R=0, dueIn=0
  18:8 → R=0.80, dueIn=-1.0, reps=2

Page-level aggregation:
  Avg Retention:  0.72 (72%)
  Min Due In:    -3.1  (3.1 days overdue) ← triggers page as "due"
  Reviewed:       7/8 verses
  Avg Reviews:    2.4
```

**Sorting priority:**

```
 Priority │ Condition                │ Sort Order
──────────┼──────────────────────────┼───────────────────
    1      │ Never-reviewed pages     │ First (highest)
    2      │ Lowest retention         │ Ascending
    3      │ Most overdue             │ Descending days
```

---

## Page Merging System

As memorized sections age past 21 days, they transition from "new" to "old" and are candidates for **page-level merging** — consolidating multiple entries that collectively cover an entire Quran page.

### Merge Pipeline

```
Raw Entries (user input)
    │
    ▼
┌─────────────────────────────────────┐
│  resolvePartialVerses()             │
│                                     │
│  Before:  Entry A: v1 → v5.2       │
│           Entry B: v5  → v10       │
│                                     │
│  After:   Entry A: v1 → v4  (trim) │
│           Entry B: v5 → v10 (extend)│
└───────────────────┬─────────────────┘
                    │
                    ▼
┌─────────────────────────────────────┐
│  Split by age (21 days)            │
│                                     │
│  newEntries:  [< 21 days old]       │
│  oldEntries:  [≥ 21 days old]       │
└───────────────────┬─────────────────┘
                    │
                    ▼
┌─────────────────────────────────────┐
│  mergeByPage(oldEntries)            │
│                                     │
│  1. Map each entry → page numbers   │
│     (via pageMap.json lookup)       │
│                                     │
│  2. Group entries by page           │
│                                     │
│  3. For each page:                  │
│     ┌───────────────────────┐       │
│     │ All verses covered?   │       │
│     │  YES → Create merged  │       │
│     │        page-N entry   │       │
│     │  NO  → Keep entries   │       │
│     │        as-is          │       │
│     └───────────────────────┘       │
│                                     │
│  4. Unmerged entries pass through   │
└───────────────────┬─────────────────┘
                    │
                    ▼
            mergedOldEntries[]
      (mix of page entries + partials)
```

### Page Coverage Check

```
Quran Page 5 has verses: 2:1, 2:2, 2:3, 2:4, 2:5

Entry A covers: 2:1 → 2:3     ✓ ✓ ✓ . .
Entry B covers: 2:4 → 2:5     . . . ✓ ✓
                               ─────────
Combined:                      ✓ ✓ ✓ ✓ ✓  → ALL covered → MERGE

Result: Single entry { id: "page-5", pageNum: 5, sourceCount: 2 }
```

```
Quran Page 6 has verses: 2:6, 2:7, 2:8, 2:9, 2:10, 2:11

Entry C covers: 2:6 → 2:9     ✓ ✓ ✓ ✓ . .
                               ───────────
Combined:                      ✓ ✓ ✓ ✓ . .  → NOT all covered → NO MERGE

Result: Entry C passes through unmodified
```

### Fractional Verse Resolution

When users memorize across multiple sessions, they may end partway through a verse. The partial verse resolver handles overlaps automatically:

```
Session 1:  User memorizes Al-Baqarah 1 → "5.2" (partway through verse 5)
Session 2:  User memorizes Al-Baqarah 5 → 10    (starts at verse 5)

Problem: Verse 5 is claimed by both entries

Resolution:
  Entry A:  1 → 4    (trimmed — verse 5 removed)
  Entry B:  5 → 10   (extended to whole verse 5)

If trimming makes an entry empty (start > end), it is dropped entirely.
```

---

## State Management & Persistence

### State Flow Diagram

```
                 ┌──────────────────────────┐
                 │       localStorage        │
                 │  ┌────────┐ ┌──────────┐ │
                 │  │entries │ │revisions │ │
                 │  └────┬───┘ └────┬─────┘ │
                 │  ┌────┴──────────┴─────┐ │
                 │  │   verseSnapshot     │ │
                 │  └─────────────────────┘ │
                 └───────────┬──────────────┘
                  Load on mount│  ▲ Debounced
                  (safeParse)  │  │ write (300ms)
                               ▼  │
         ┌──────────────────────────────────────────┐
         │              React State                  │
         │                                           │
         │  const [entries, setEntries]               │
         │  const [revisions, setRevisions]           │
         │  const [verseSnapshot, setVerseSnapshot]   │
         │               │                            │
         │    ┌──────────┼──────────────┐             │
         │    │          │              │             │
         │    ▼          ▼              ▼             │
         │  useMemo   useMemo        useMemo          │
         │  (split     (merge        (compute         │
         │   new/old)   by page)      FSRS            │
         │                            suggestions)    │
         │    │          │              │             │
         │    ▼          ▼              ▼             │
         │  newEntries  mergedOld    dueFsrs          │
         │  oldEntries  Entries      upcomingFsrs     │
         └──────────────┬───────────────────────────┘
                        │
                        ▼
                  Component Render
```

### Crash-Safe Persistence

```
┌─────────────────────────────────────────────┐
│ Read path (app startup)                      │
│                                              │
│  localStorage.getItem(key)                   │
│       │                                      │
│       ▼                                      │
│  raw === null? ──yes──▶ return fallback      │
│       │ no                                   │
│       ▼                                      │
│  JSON.parse(raw) ──throws──▶ return fallback │
│       │ ok                                   │
│       ▼                                      │
│  Type check:                                 │
│    Arrays  → Array.isArray(parsed)           │
│    Objects → typeof === 'object'             │
│               && !Array.isArray              │
│       │ wrong type                            │
│       ▼                                      │
│  return fallback                             │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ Write path (after state change)              │
│                                              │
│  State update (setState)                     │
│       │                                      │
│       ▼                                      │
│  useDebouncedWrite(value, callback, 300ms)   │
│       │                                      │
│       ├── Skips initial mount (no double-    │
│       │   write of just-loaded data)         │
│       │                                      │
│       ├── Debounces: waits 300ms after last  │
│       │   change before writing              │
│       │                                      │
│       ▼                                      │
│  localStorage.setItem(key, JSON.stringify()) │
└─────────────────────────────────────────────┘
```

### Schema Migration

```
Schema v1 (original):
  entries[] + revisions[]  (computeSuggestions replayed all revisions)

Schema v2 (current):
  entries[] + revisions[] + verseSnapshot{}  (pre-computed FSRS states)

Migration v1 → v2 (automatic, runs once):
  ┌───────────────────────────────────────────────────┐
  │ useEffect on first load:                          │
  │   if verseSnapshot is {} AND revisions exist:     │
  │     setVerseSnapshot(rebuildSnapshot(revisions))  │
  │                                                   │
  │ This replays all revisions chronologically to     │
  │ build the initial snapshot from existing data.    │
  └───────────────────────────────────────────────────┘
```

---

## Component Tree

```
<App>  ─────────────────────────────────────── State owner, all handlers
│
├── <SuggestionsPanel>  ────────────────────── Dashboard (3 sections)
│   │
│   ├── New Memorization (page-grouped)
│   │   ├── Page group headers with [Log Revision]
│   │   └── Expandable individual entries with [Log Revision]
│   │
│   ├── Due for Revision (FSRS overdue cards)
│   │   └── <InlineRevisionMenu>  ──────────── Quality chips + date
│   │
│   └── Coming Up (next 5 upcoming reviews)
│       └── <InlineRevisionMenu>
│
├── <MemorizationForm>  ────────────────────── Add/Edit memorized range
│   └── <SurahVerseFields>  ────────────────── Surah dropdowns + verse inputs
│
├── <RevisionForm>  ────────────────────────── Add/Edit revision log
│   └── <SurahVerseFields>
│
├── <RevisionLog>  ─────────────────────────── Paginated revision history
│
└── <MemorizedSections>  ───────────────────── Collapsible new/old sections
```

### Component Communication Pattern

```
┌──────────────┐     props (data + callbacks)      ┌──────────────────┐
│              │ ──────────────────────────────────▶│                  │
│    App.jsx   │                                    │   Child          │
│  (state +    │     callback invocation            │   Component      │
│   handlers)  │ ◀──────────────────────────────────│                  │
│              │                                    │                  │
└──────────────┘                                    └──────────────────┘

All state lives in App.jsx. Children are pure renderers + event dispatchers.
Components use React.memo to skip re-renders when props haven't changed.
Forms use key={editItem?.id || 'add'} to force clean remount on mode switch.
```

### Rendering Optimization

```
┌──────────────────────────────────────────────────────────────┐
│ Memoization Strategy                                          │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  useState        Minimal: entries, revisions, verseSnapshot,  │
│                  editingEntry, editingRevision                 │
│                                                               │
│  useMemo         All derived data:                            │
│                  • newEntries / oldEntries (age split)         │
│                  • mergedOldEntries (page merge)               │
│                  • fsrsSuggestions / dueFsrs / upcomingFsrs    │
│                  • sortedRevisions                             │
│                  • newEntriesByPage                            │
│                                                               │
│  useCallback     All handlers: submit, edit, delete, cancel,  │
│                  quickRevision, export, import, clear          │
│                                                               │
│  React.memo      On child components — only re-render when    │
│                  actual prop values change                     │
│                                                               │
│  Result:         State change → only affected useMemos         │
│                  recompute → only affected components render   │
└──────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### Adding a New Revision (Happy Path)

```
User taps "Good" (quality 4) on a suggestion card
                    │
                    ▼
┌──────────────────────────────────────────────────────┐
│ InlineRevisionMenu creates revision object:          │
│ {                                                    │
│   id: crypto.randomUUID(),                           │
│   startSurah, startVerse, endSurah, endVerse,       │
│   quality: 4,                                        │
│   createdAt: new Date().toISOString()                │
│ }                                                    │
└────────────────────────┬─────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────┐
│ handleQuickRevision(revision)                        │
│                                                      │
│  1. setRevisions(prev => [...prev, revision])        │
│                                                      │
│  2. setVerseSnapshot(prev => {                       │
│       const next = { ...prev }                       │
│       applyRevisionToSnapshot(next, revision, data)  │
│       return next   ← incremental, O(verses in rev) │
│     })                                               │
└────────────────────────┬─────────────────────────────┘
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
    revisions[]    verseSnapshot{}   useMemo recomputes
    updated        updated           fsrsSuggestions
          │              │              │
          ▼              ▼              ▼
    debouncedWrite  debouncedWrite  UI re-renders
    to localStorage to localStorage with new suggestions
```

### Editing / Deleting a Revision

```
User edits or deletes a past revision
                    │
                    ▼
┌──────────────────────────────────────────────────────┐
│ Cannot do incremental update (past revision changed) │
│                                                      │
│  1. Update revisions array (edit in place / filter)  │
│                                                      │
│  2. FULL REBUILD:                                    │
│     setVerseSnapshot(                                │
│       rebuildSnapshot(updatedRevisions, verseData)   │
│     )                                                │
│                                                      │
│     Sorts all revisions chronologically              │
│     Replays each one from scratch                    │
│     Returns fresh snapshot                           │
└──────────────────────────────────────────────────────┘
```

### Full Data Pipeline

```
┌─────────┐    ┌──────────┐    ┌────────────┐    ┌──────────────┐
│  User   │───▶│ entries  │───▶│ resolve    │───▶│ split by age │
│  Input  │    │ (raw)    │    │ partial    │    │ (21 days)    │
└─────────┘    └──────────┘    │ verses     │    └──────┬───────┘
                               └────────────┘           │
                                                ┌───────┴───────┐
                                                │               │
                                          ┌─────▼────┐   ┌──────▼─────┐
                                          │ newEntries│   │ oldEntries │
                                          │ (< 21d)  │   │ (≥ 21d)   │
                                          └─────┬────┘   └──────┬─────┘
                                                │               │
                                          ┌─────▼────┐   ┌──────▼─────┐
                                          │ group by │   │ mergeByPage│
                                          │ page     │   │ (full-page │
                                          │ number   │   │  entries)  │
                                          └─────┬────┘   └──────┬─────┘
                                                │               │
                                          ┌─────▼────┐   ┌──────▼───────┐
                                          │ newByPage│   │ mergedOld    │
                                          │ (display)│   │ Entries      │
                                          └──────────┘   └──────┬───────┘
                                                                │
                                                    ┌───────────▼──────────┐
                                                    │ computeSuggestions() │
                                                    │ + verseSnapshot      │
                                                    └───────────┬──────────┘
                                                                │
                                                    ┌───────────┴──────────┐
                                                    │                      │
                                              ┌─────▼────┐         ┌──────▼─────┐
                                              │ dueFsrs  │         │ upcoming   │
                                              │ (overdue)│         │ Fsrs (top5)│
                                              └──────────┘         └────────────┘
```

---

## File Reference

### Source Files

| File | Lines | Purpose |
|------|-------|---------|
| `src/App.jsx` | ~380 | Root component — state, handlers, layout |
| `src/App.css` | ~530 | All styles (no CSS framework) |
| `src/main.jsx` | 10 | React entry point |
| `src/index.css` | 12 | Global reset |
| `src/constants.js` | 20 | Schema version, storage keys, quality labels |
| `src/fsrs.js` | ~364 | FSRS v4 engine + snapshot management + suggestion computation |
| `src/pageMerge.js` | ~243 | Partial verse resolution + page-level entry merging |
| `src/hooks/useQuranData.js` | ~60 | Data fetching hook (3 JSON files) |
| `src/hooks/useDebounce.js` | ~20 | Debounced localStorage writer |
| `src/components/SuggestionsPanel.jsx` | ~260 | Dashboard: new/due/upcoming sections with inline quick-log |
| `src/components/RevisionForm.jsx` | ~110 | Revision add/edit form with quality rating |
| `src/components/RevisionLog.jsx` | ~80 | Paginated revision history with edit/delete |
| `src/components/MemorizationForm.jsx` | ~100 | Memorization add/edit form (fractional verse support) |
| `src/components/MemorizedSections.jsx` | ~140 | Collapsible memorized sections (new + old) |
| `src/components/SurahVerseFields.jsx` | ~80 | Reusable surah/verse range input fields |

### Static Data

| File | Records | Purpose |
|------|---------|---------|
| `public/data/surah_index.json` | 114 surahs | Surah metadata (names, verse counts, page ranges) |
| `public/data/verse_data.json` | 604 pages | Page → verse mapping with word counts |
| `public/data/pageMap.json` | 6,236 entries | Verse → page reverse lookup |
| `public/data/test_data.json` | — | Sample data for development |

### Key Dependency Versions

```json
{
  "react": "^19.2.0",
  "react-dom": "^19.2.0",
  "vite": "^7.3.1",
  "@vitejs/plugin-react": "^4.5.2"
}
```

Zero runtime dependencies beyond React itself.

---

## License

Private project — not currently open source.
