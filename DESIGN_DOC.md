# Quran Memorization Tracker — Design Document

> **Purpose**: This document describes the Quran Memorization Tracker application in a platform-agnostic way. An engineer should be able to read this document and implement the application in any language, for any platform (web, iOS, Android, desktop), without referencing the original source code.

---

## 1. Overview

The Quran Memorization Tracker helps users manage their Quran memorization (hifz) journey by:

1. **Recording** which sections of the Quran have been memorized
2. **Logging** revision sessions with a quality rating
3. **Scheduling** future revisions using spaced repetition (FSRS v4 algorithm)
4. **Tracking** per-verse FSRS state for precise scheduling granularity

The system distinguishes between **new memorization** (< 21 revisions — needs daily practice) and **old memorization** (≥ 21 revisions — scheduled via FSRS algorithm with spaced intervals).

---

## 2. Domain Concepts

### 2.1 The Quran Structure

The Quran contains **114 surahs** (chapters), each with a variable number of **ayat** (verses). The text is also divided into **604 pages** (based on the standard Uthmani/Madani mushaf). A single page may contain verses from one or two surahs.

Three static data sources describe this structure:

| Data Source | Content |
|---|---|
| **Surah Index** | Each surah's number (1–114), name, and verse count |
| **Verse Data** | For each of the 604 pages: page number, list of verses with `{surahNum, verseNum, wordCount}` |
| **Page Map** | Flat lookup: `"surahNum:verseNum"` → `pageNum` (e.g., `"2:255"` → `42`) |

### 2.2 Verse Ranges

Users specify memorized sections and revisions as **ranges**: `(startSurah, startVerse)` to `(endSurah, endVerse)`. A range can span multiple surahs.

**Fractional verses** (e.g., `"5.2"`) indicate partial memorization of a verse. The integer portion identifies the verse; the decimal indicates a partial position within it. This is used for resolving overlapping entries (see §7.1).

### 2.3 Quality Scale

Revisions are rated on a 5-point scale:

| Quality | Label | FSRS Grade |
|---|---|---|
| 1 | Poor | Again (1) |
| 2 | Weak | Hard (2) |
| 3 | Okay | Good (3) |
| 4 | Good | Good (3) |
| 5 | Solid | Easy (4) |

Note: Qualities 3 and 4 both map to FSRS grade "Good".

---

## 3. Data Models

### 3.1 Memorization Entry

Represents a section of the Quran that has been memorized.

```
MemorizationEntry {
    id:          string    // Unique identifier (UUID)
    startSurah:  integer   // 1–114
    startVerse:  string    // e.g., "1" or "5.2" (fractional = partial verse)
    endSurah:    integer   // 1–114
    endVerse:    string    // e.g., "7" or "10.5"
    createdAt:   datetime  // When this memorization was recorded
    updatedAt:   datetime  // Last modification time
}
```

### 3.2 Revision Entry

Represents a revision/review session of a verse range.

```
RevisionEntry {
    id:          string    // UUID
    startSurah:  integer
    startVerse:  string
    endSurah:    integer
    endVerse:    string
    quality:     integer   // 1–5 (see §2.3)
    createdAt:   datetime  // When this revision occurred
    updatedAt:   datetime
}
```

### 3.3 FSRS Card State (per-verse)

Each verse has its own spaced-repetition state. The key is `"surahNum:verseNum"` (e.g., `"2:255"`).

```
CardState {
    stability:   float     // S — memory strength in days (≥ 0.1)
    difficulty:  float     // D — 1.0 to 10.0
    lastReview:  datetime  // When last reviewed
    reps:        integer   // Total review count
}
```

The collection of all card states is called the **Verse Snapshot** — a map from verse key to CardState.

### 3.4 Derived: Merged Page Entry

When all verses on a Quran page are memorized (old entries only), they merge into a single page-level entry for display. Not persisted — computed at runtime.

```
MergedPageEntry {
    id:          string    // "page-{pageNum}"
    pageNum:     integer
    startSurah, startVerse, endSurah, endVerse  // Page bounds
    createdAt:   datetime  // Earliest entry's creation date
    updatedAt:   datetime  // Latest entry's update date
    sourceIds:   string[]  // IDs of the original entries
    sourceCount: integer
}
```

### 3.5 Derived: Verse Group (Suggestion)

Consecutive verses on the same page within a surah, with aggregated FSRS stats.

```
VerseGroup {
    surahNum:       integer
    pageNum:        integer
    startVerse:     integer
    endVerse:       integer
    totalVerses:    integer
    reviewedVerses: integer   // How many have been reviewed at least once
    avgRetention:   float     // 0.0–1.0, average probability of recall
    avgReviews:     float     // Average review count
    minDueIn:       float     // Days until earliest verse is due (≤0 = overdue)
    isDue:          boolean   // minDueIn ≤ 0
    overdueDays:    float     // max(0, -minDueIn)
}
```

### 3.6 Derived: Surah Suggestion

Aggregation of all verse groups for a surah.

```
SurahSuggestion {
    surahNum:        integer
    startVerse:      string   // Earliest memorized verse in surah
    endVerse:        string   // Latest memorized verse in surah
    allGroups:       VerseGroup[]
    dueGroups:       VerseGroup[]    // Groups where isDue = true
    upcomingGroups:  VerseGroup[]    // Groups not yet due, sorted by minDueIn
    totalDueGroups:  integer
    totalGroups:     integer
    isDue:           boolean         // Any due groups?
    minDueIn:        float           // Earliest dueIn across all groups
    avgRetention:    float
}
```

---

## 4. FSRS v4 Algorithm

The application uses the **Free Spaced Repetition Scheduler v4** to determine when verses should be reviewed. Reference: https://github.com/open-spaced-repetition/fsrs4anki

### 4.1 Parameters

17 weights (w₀ through w₁₆):

```
w₀  = 0.4     // Initial stability for Again
w₁  = 0.6     // Initial stability for Hard
w₂  = 2.4     // Initial stability for Good
w₃  = 5.8     // Initial stability for Easy
w₄  = 4.93    // Initial difficulty mean
w₅  = 0.94    // Initial difficulty modifier
w₆  = 0.86    // Difficulty reversion towards mean
w₇  = 0.01    // Difficulty mean reversion weight
w₈  = 1.49    // Stability increase base
w₉  = 0.14    // Stability penalty for difficulty
w₁₀ = 0.94    // Stability bonus for low retrievability
w₁₁ = 2.18    // Fail stability base
w₁₂ = 0.05    // Fail stability difficulty factor
w₁₃ = 0.34    // Fail stability previous-stability factor
w₁₄ = 1.26    // Fail stability retrievability factor
w₁₅ = 0.29    // Hard penalty multiplier
w₁₆ = 2.61    // Easy bonus multiplier

DESIRED_RETENTION = 0.9  // Target 90% recall probability
```

### 4.2 Core Formulas

**Retrievability** — Probability of recall after `t` days with stability `S`:

```
R(t, S) = (1 + t / (9 × S))⁻¹
```

**Next Interval** — Days until recall probability drops to desired retention:

```
I(S) = max(1, round(9 × S × (1/DESIRED_RETENTION - 1)))
     = max(1, round(S))    // Simplifies for DESIRED_RETENTION = 0.9
```

**Initial Stability** (first review):

```
S₀(grade) = w[grade - 1]    // w₀ for Again, w₁ for Hard, w₂ for Good, w₃ for Easy
```

**Initial Difficulty** (first review):

```
D₀(grade) = clamp(w₄ - (grade - 3) × w₅, 1.0, 10.0)
```

**Difficulty Update** (subsequent reviews):

```
D' = w₇ × w₄ + (1 - w₇) × (D - w₆ × (grade - 3))
D' = clamp(D', 1.0, 10.0)
```

**Stability Update on Success** (grade ≥ 2):

```
modifier = w₁₅ if grade=2, w₁₆ if grade=4, 1.0 if grade=3

S' = S × (exp(w₈) × (11 - D) × S⁻ʷ⁹ × (exp(w₁₀ × (1 - R)) - 1) × modifier + 1)
```

**Stability Update on Failure** (grade = 1):

```
S' = w₁₁ × D⁻ʷ¹² × ((S + 1)ʷ¹³ - 1) × exp(w₁₄ × (1 - R))
```

**Stability Floor**: `S' = max(0.1, S')`

### 4.3 Review Processing

```
function processReview(card, grade, reviewDate):
    if card is null or card.reps == 0:
        // First review
        return CardState {
            stability:  S₀(grade)
            difficulty: D₀(grade)
            lastReview: reviewDate
            reps:       1
        }

    elapsedDays = max(0, (reviewDate - card.lastReview) in days)
    R = retrievability(elapsedDays, card.stability)
    newDifficulty = updateDifficulty(card.difficulty, grade)

    if grade == 1:
        newStability = updateStabilityFail(card.difficulty, card.stability, R)
    else:
        newStability = updateStabilitySuccess(card.difficulty, card.stability, R, grade)

    return CardState {
        stability:  max(0.1, newStability)
        difficulty: newDifficulty
        lastReview: reviewDate
        reps:       card.reps + 1
    }
```

### 4.4 Snapshot Management

The **Verse Snapshot** maps every reviewed verse to its current FSRS CardState.

**Incremental Update** (adding a new revision):
1. Get all verses in the revision's range
2. For each verse, look up its current card state (or null if first time)
3. Apply `processReview(card, grade, revisionDate)`
4. Store the updated card state back

**Full Rebuild** (after editing or deleting a past revision):
1. Clear the snapshot
2. Sort all revisions chronologically
3. Replay each revision through the incremental update process

---

## 5. New vs Old Memorization Classification

An entry is classified based on the **minimum `reps`** across all verses in its range:

```
NEW_PERIOD_REVISIONS = 21

for each memorization entry:
    minReps = minimum reps across all verses in the entry's range (from Verse Snapshot)
    if no verse data available: minReps = 0

    if minReps < 21:
        classify as NEW
        revisionCount = minReps
        revisionsRemaining = 21 - minReps
    else:
        classify as OLD
```

**New entries** are expected to be revised daily. They appear in a dedicated "New Memorization" section.

**Old entries** are scheduled by the FSRS algorithm and appear in the "Old Memorization" section with due dates.

---

## 6. Suggestion Computation

### 6.1 Old Memorization Suggestions (FSRS-Based)

Algorithm (`computeSurahSuggestions`):

1. **Collect** all memorized verse positions from old entries
2. **Compute** per-verse state using date-only math (strip time component for "today" accuracy):
   - Look up CardState from snapshot
   - Calculate `dueIn = min(nextInterval(S), MAX_INTERVAL) - elapsedDays`
   - `isDue = (dueIn ≤ 0)`
3. **Group** verses by surah → page, then group consecutive verses on the same page into verse ranges
4. **Aggregate** each group: average retention, average reviews, minimum dueIn
5. **Split** into `dueGroups` (due now) and `upcomingGroups` (coming soon)
6. **Sort** surahs: due surahs first, then by earliest dueIn

**Maximum interval cap**: 14 days. No verse goes longer than 14 days between reviews regardless of FSRS output.

### 6.2 New Memorization Suggestions

1. Filter new entries to **exclude** those already revised today
   - "Revised today" = any revision from today whose range overlaps the entry's range
2. Group remaining entries by surah
3. Sort by surah number
4. Display revision count and remaining revisions for each entry

### 6.3 "Coming Up" Section

Collects upcoming (not-yet-due) verse groups from all surahs, sorted by `minDueIn` ascending, limited to 5 items.

### 6.4 Range Overlap Check

Two ranges overlap if they are NOT disjoint. Two ranges are disjoint if:
- Range A ends before Range B starts, OR
- Range A starts after Range B ends

Comparison is done as `(surah, verse)` tuples with natural ordering.

---

## 7. Page Merging Algorithm

### 7.1 Partial Verse Resolution

Before any classification or merging, resolve fractional verse overlaps:

1. Sort entries by position (surah, verse), then by creation date
2. For each entry A ending at a fractional verse (e.g., `"5.2"`):
   a. Find the next entry B starting at the same integer verse in the same surah
   b. Trim A's endVerse to `floor(endVerse) - 1`
   c. Set B's startVerse to the whole integer
   d. If trimming makes A empty (start > end after trim), remove A
3. Return the resolved list (new objects — originals are not mutated)

### 7.2 Page Merging (Old Entries Only)

1. For each old entry, determine which pages it spans using the Page Map
2. Group entries by page number
3. For each page, check if the entries **collectively cover every verse** on that page
4. If fully covered → create a merged page entry with `id = "page-{N}"`
   - `createdAt` = earliest entry's creation date
   - `updatedAt` = latest entry's update date
   - Track `sourceIds` (original entry IDs) and `sourceCount`
5. If NOT fully covered → entries pass through unmerged
6. Remove original entries that were consumed by a full-page merge

### 7.3 Page Spans for Multi-Surah Entries

For entries spanning multiple surahs, find the start page and end page, then include all pages in between (inclusive).

---

## 8. User Interface & Navigation

### 8.1 Four-Page Layout

| Page | Route | Content |
|---|---|---|
| **Suggestions** | default/home | Today's revision suggestions (new + old memorization) |
| **Revisions** | revisions | Log/edit revision form + revision history log |
| **Memorizations** | memorizations | Log/edit memorization form + memorized sections list |
| **Stats** | stats | Progress overview, statistics, and activity calendar |

A persistent navigation bar allows switching between pages. The **Suggestions** tab displays a red badge with the count of items due today (new entries not yet revised today + overdue old groups).

### 8.2 Suggestions Page

Three collapsible sections:

**New Memorization Section:**
- Header: "New Memorization (daily for 21 revisions) — N entries"
- Entries grouped by surah, each showing:
  - Verse range (e.g., "Al-Baqarah — 1 to 5")
  - Revision count: "Revision X of 21"
  - Remaining revisions
- Entries already revised today are hidden
- Each entry has a "Log Revision" quick-action (inline quality picker + optional date)

**Old Memorization Section:**
- Header: "Old Memorization (FSRS) — N due across P pages, S surahs"
- Grouped by surah, then by page within each surah
- Each verse group shows:
  - Page number badge
  - Verse range
  - Retention percentage, review count, overdue days
  - Color coding: yellow = never reviewed, red = overdue, green = upcoming
- Surah-level and group-level "Log Revision" quick-action
- "All caught up!" message when nothing is due

**Coming Up Section:**
- Up to 5 upcoming verse groups sorted by days until due
- Shows surah name, page number, verse range, days until due

### 8.3 Revisions Page

**Revision Form:**
- Start surah/verse and end surah/verse selectors
- Only surahs with at least one memorized verse appear in the dropdown
- Quality rating: radio button group (1–5 with labels)
- Date picker (defaults to today, allows backdating)
- Submit and Cancel buttons
- When editing, form pre-fills with existing values

**Revision Log:**
- Chronological list (newest first)
- Each entry shows: verse range, quality badge (color-coded), date
- Edit and Delete actions per entry
- Paginated: shows 5 initially, then "Show more" in increments of 10
- **Filters** (collapsible panel):
  - Surah dropdown: show only revisions for a specific surah
  - Quality dropdown: show only revisions with a specific quality rating
  - Date range: from-date and to-date inputs to narrow by revision date
  - Active filter indicator (dot) and result count shown when filters are active
  - "Clear filters" button to reset all filters

### 8.4 Memorizations Page

**Memorization Form:**
- Start/end surah and verse selectors
- Surahs already fully memorized are excluded from the dropdown
- Date picker
- Submit and Cancel buttons

**Memorized Sections:**
- Two sub-sections: New Memorization, Old Memorization
- Each entry shows: verse range, creation date, status badge
  - New entries: "X rev left" badge
- Edit and Delete actions per entry
- Paginated with "Show more"

### 8.5 Stats Page

Three sections:

**Progress Overview:**
- Total verses memorized out of 6236, shown as a progress bar with percentage
- Expandable surah-by-surah breakdown: for each surah with memorized content, show verses memorized vs. total verses with a progress bar

**Statistics Grid:**
- Total revisions
- Revisions today / this week / this month
- Average quality (across all revisions)
- Current streak (consecutive days with at least one revision, counting back from today or yesterday)
- Best streak (longest consecutive-day run in history)

**Activity Calendar (Heatmap):**
- 13-week (91-day) GitHub-style grid rendered as SVG
- Rows = days of the week (Mon–Sun), columns = weeks
- Cell color intensity based on revision count for that day (4 levels)
- Hover tooltip shows date and revision count
- Month labels along the top

### 8.6 Data Management Controls

Always visible at the bottom of every page:
- **Export Data**: Downloads a JSON backup file
- **Import Data**: Uploads and replaces all data (with confirmation)
- **Load Test Data**: Loads sample data (development aid)
- **Clear All Data**: Erases everything (with confirmation)

### 8.7 Surah/Verse Input Component

Shared between memorization and revision forms:
- Surah dropdown (filterable list of surahs)
- Verse number input (validated against max verses for selected surah)
- Auto-clamping: verse numbers are constrained to valid range for the selected surah
- When start surah changes, verse resets to 1
- When end surah changes, verse resets to max verses for that surah

---

## 9. Data Persistence

### 9.1 Storage Model

All data is stored locally (no server). Four storage keys:

| Key | Type | Content |
|---|---|---|
| `quran-memorization-entries` | JSON Array | All memorization entries |
| `quran-revision-entries` | JSON Array | All revision entries |
| `quran-verse-fsrs-state` | JSON Object | Verse snapshot: `"surah:verse"` → CardState |
| `quran-tracker-schema-version` | Number | Currently `2` |

### 9.2 Write Strategy

Writes are **debounced** with a 300ms delay. Each data store (entries, revisions, snapshot) has its own independent debounce timer. The first write after initialization is skipped to avoid overwriting with initial state.

### 9.3 Crash Safety

All reads from storage use safe parsing with fallbacks:
- Arrays fall back to `[]`
- Objects fall back to `{}`
- Corrupt data logs a warning and returns the fallback

### 9.4 Schema Migration

On app startup, check the stored schema version against the current version. If they differ, run migration logic and stamp the new version. Currently no migration transformations are needed — the version is simply stamped.

If the verse snapshot is empty but revisions exist (migration from an older schema that didn't persist the snapshot), rebuild the snapshot from all revisions.

---

## 10. Export / Import Format

### 10.1 Export

Generates a JSON file named `quran-tracker-backup-YYYY-MM-DD.json`:

```json
{
    "quran-memorization-entries": [ ...MemorizationEntry[] ],
    "quran-revision-entries":     [ ...RevisionEntry[] ],
    "quran-verse-fsrs-state":     { "surah:verse": CardState, ... },
    "exportedAt":                 "ISO-8601 datetime",
    "schemaVersion":              2
}
```

### 10.2 Import

1. Parse the JSON file
2. Validate: entries and revisions must be arrays
3. Prompt user for confirmation (shows entry/revision counts)
4. Replace all current data with imported data
5. If the file contains `quran-verse-fsrs-state` (valid object), use it directly
6. Otherwise, rebuild the snapshot from the imported revisions

---

## 11. Key Business Rules

1. **21-revision threshold**: Entries stay in the "new" category until the least-reviewed verse in their range has been revised 21 times. After 21, they enter FSRS scheduling.

2. **Maximum interval cap**: 14 days. FSRS cannot schedule a verse further than 14 days out, ensuring regular review of all memorized content.

3. **Fractional verse resolution**: When entry A ends at "5.2" and entry B starts at "5", the partial verse is attributed to B (the later entry). A is trimmed to end at verse 4.

4. **Page merging**: Only occurs when ALL verses on a page are covered by old memorization entries. Partial pages remain as individual entries.

5. **Date-only math for suggestions**: When computing whether a verse is due today, time-of-day is stripped from both "now" and "last review" dates. This ensures that items due "today" always appear in the due list regardless of what time it is.

6. **Today filter for new entries**: New memorization entries that have already been revised today (any overlapping revision from today) are hidden from the suggestions.

9. **Local timezone for date comparisons**: All "today" comparisons and date-string extractions use the user's local timezone (via `getFullYear/getMonth/getDate`), not UTC. This prevents mismatches where a late-evening local revision appears as "tomorrow" in UTC.

7. **Incremental vs full rebuild**:
   - Adding a revision → incremental snapshot update (fast)
   - Editing or deleting a revision → full snapshot rebuild from all revisions (necessary for correctness)

8. **Surah scoping in forms**:
   - Revision form only shows surahs that have at least one memorized verse
   - Memorization form excludes surahs that are already fully memorized

---

## 12. Algorithmic Pseudocode Summary

### Classify Entries as New/Old

```
for each memorization entry:
    resolve partial verse overlaps
    verses = getAllVersesInRange(entry, verseData)
    minReps = min(snapshot[v].reps for v in verses)  // 0 if no card exists
    if minReps < 21: NEW
    else: OLD
```

### Compute Suggestions for Old Entries

```
memorizedVerses = set of all verse keys from old entries
for each memorized verse:
    card = snapshot[verseKey]
    if no card: dueIn = 0, retention = 0
    else:
        elapsed = (today - card.lastReview) in days (date-only)
        retention = R(elapsed, card.stability)
        interval = min(nextInterval(card.stability), 14)
        dueIn = interval - elapsed

group verses by surah → page → consecutive ranges
for each group: aggregate stats (avg retention, min dueIn, etc.)
split into due (dueIn ≤ 0) vs upcoming
sort surahs: due first, then by earliest dueIn
```

### Check if New Entry Was Revised Today

```
for each revision logged today:
    if revision range overlaps entry range:
        entry is already revised today → hide from suggestions
```

---

## 13. Static Data Requirements

Any implementation needs these three data files describing the Quran's structure:

### Surah Index
Array of 114 surahs, each with:
- `num`: Surah number (1–114)
- `name`: Surah name (transliterated)
- `numVerses`: Total verse count

### Verse Data
Map of page numbers (1–604) to page objects, each containing:
- `pageNum`: Page number
- `verses`: Array of `{surahNum, verseNum, wordCount}`

### Page Map
Flat lookup from `"surahNum:verseNum"` string to page number integer. Covers every verse in the Quran.

---

## 14. Visual Design Guidelines

- **Layout**: Single-column, max-width ~600px, centered, mobile-first
- **Color coding**:
  - Yellow (`#fef3c7`): Never reviewed
  - Red (`#fee2e2`): Overdue
  - Green (`#f0fdf4`): Upcoming / not due
  - Purple (`#ede9fe`): New memorization
- **Quality badges**: Color gradient from red (1/Poor) through yellow (3/Okay) to blue (5/Solid)
- **Page badges**: Indigo (`#6366f1`) inline badges showing Quran page numbers
- **Sections**: Collapsible with toggle indicators (▾/▸)
- **Lists**: Paginated — show 5 initially, "Show more" loads 10 more at a time
- **Typography**: System font stack, readable line height
