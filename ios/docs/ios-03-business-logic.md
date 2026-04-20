# iOS Port — Business Logic

Ports of `src/pageMerge.js`, classification logic from `App.jsx`, and `computeSurahSuggestions` from `src/fsrs.js`.

## 1. Date Helpers (DateHelpers.swift)

Port of `localDateStr()` and `isoToLocalDate()` from `constants.js`.

```swift
enum DateHelpers {
    /// Calendar for date-only comparisons (strips time component)
    private static let calendar = Calendar.current

    /// Today's date at midnight (local timezone)
    static func today() -> Date {
        calendar.startOfDay(for: .now)
    }

    /// Strip time from a Date, returning midnight local
    static func startOfDay(_ date: Date) -> Date {
        calendar.startOfDay(for: date)
    }

    /// Format date as "YYYY-MM-DD" in local timezone
    static func dateString(_ date: Date) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
    }

    /// Check if two dates fall on the same calendar day (local timezone)
    static func isSameDay(_ a: Date, _ b: Date) -> Bool {
        calendar.isDate(a, inSameDayAs: b)
    }

    /// Elapsed full days between two dates (date-only, no time component)
    static func daysBetween(_ from: Date, _ to: Date) -> Double {
        let fromDay = startOfDay(from)
        let toDay = startOfDay(to)
        return toDay.timeIntervalSince(fromDay) / 86400.0
    }
}
```

**Key difference from web**: Swift uses native `Date` objects (not ISO strings), so `isoToLocalDate()` is only needed for import. All internal comparisons use `Calendar.isDate(_:inSameDayAs:)`.

## 2. Classification Engine (ClassificationEngine.swift)

Port of the `useMemo` block in `App.jsx` that classifies entries as new/old.

### 2.1 Partial Verse Resolution

Direct port of `pageMerge.js resolvePartialVerses()`. Key behaviors:

```
Input:  [MemorizationEntry] (from SwiftData)
Output: [ResolvedEntry] (copies with adjusted startVerse/endVerse)

struct ResolvedEntry {
    let original: MemorizationEntry   // reference to SwiftData object (for edit/delete)
    var startSurah: Int
    var startVerse: String
    var endSurah: Int
    var endVerse: String
    var createdAt: Date
    var updatedAt: Date
}

Algorithm:
1. Sort entries by (startSurah, startVerse numeric, createdAt)
2. Build hash index: "surah:verseInt" → [indices] for start positions
3. For each entry with fractional endVerse:
   a. Look up candidates at same "endSurah:floor(endVerse)" in start index
   b. Find next entry B (index > i) starting at that integer verse
   c. Trim A's endVerse to floor(endVerse) - 1
   d. Set B's startVerse to the integer
   e. If A becomes empty (startVerse > endVerse after trim), mark for removal
4. Filter out removed entries
```

- Port `verseInt()` as: `Int(Double(verseStr)!)` (floor of numeric parse)
- Port `isFractional()` as: `Double(verseStr)! != Double(Int(Double(verseStr)!))`

### 2.2 New/Old Classification

```
func classifyEntries(
    resolved: [ResolvedEntry],
    snapshot: [String: CardState],
    quranData: QuranDataManager
) -> (new: [ClassifiedEntry], old: [ResolvedEntry])

For each resolved entry:
    verses = quranData.versesInRange(entry's range)
    minReps = min(snapshot["\(v.surahNum):\(v.verseNum)"]?.reps ?? 0 for v in verses)
    if minReps == ∞: minReps = 0    // no verses found
    if minReps < 21:
        → new, with revisionCount = minReps, revisionsRemaining = 21 - minReps
    else:
        → old
```

### 2.3 Today Filter for New Entries

Port of `hasRevisionToday()` from `SuggestionsPanel.jsx`:

```
func isRevisedToday(entry: ClassifiedEntry, revisions: [RevisionEntry]) -> Bool {
    let today = DateHelpers.today()
    return revisions.contains { rev in
        guard DateHelpers.isSameDay(rev.createdAt, today) else { return false }
        return rangesOverlap(
            aStart: (entry.startSurah, entry.startVerse),
            aEnd: (entry.endSurah, entry.endVerse),
            bStart: (rev.startSurah, rev.startVerse),
            bEnd: (rev.endSurah, rev.endVerse)
        )
    }
}
```

### 2.4 Range Overlap Check

Port of the inline overlap check in `SuggestionsPanel.jsx` and `App.jsx`:

```
func rangesOverlap(
    aStart: (surah: Int, verse: Int),
    aEnd: (surah: Int, verse: Int),
    bStart: (surah: Int, verse: Int),
    bEnd: (surah: Int, verse: Int)
) -> Bool {
    // Two ranges are disjoint if B ends before A starts OR B starts after A ends
    let bEndsBefore = bEnd.surah < aStart.surah ||
                      (bEnd.surah == aStart.surah && bEnd.verse < aStart.verse)
    let bStartsAfter = bStart.surah > aEnd.surah ||
                       (bStart.surah == aEnd.surah && bStart.verse > aEnd.verse)
    return !(bEndsBefore || bStartsAfter)
}
```

## 3. Page Merger (PageMerger.swift)

Port of `pageMerge.js mergeByPage()`. Only applies to old entries.

### 3.1 Get Pages for Entry

```
func pagesForEntry(_ entry: ResolvedEntry, pageMap: [String: Int]) -> [Int]

Same surah:
  for v in startVerse...endVerse: collect pageMap["\(surah):\(v)"]
Multi-surah:
  startPage = pageMap["\(startSurah):\(startVerse)"]
  endPage = pageMap["\(endSurah):\(endVerse)"]
  return Array(startPage...endPage)
```

### 3.2 Full Page Coverage Check

```
func pageFullyCovered(_ pageNum: Int, entries: [ResolvedEntry], quranData: QuranDataManager) -> Bool {
    let pageVerses = quranData.pages[pageNum]?.verses ?? []
    return pageVerses.allSatisfy { verse in
        entries.contains { entry in entryCoversVerse(entry, verse.surahNum, verse.verseNum) }
    }
}
```

### 3.3 Merge Algorithm

```
func mergeByPage(
    oldEntries: [ResolvedEntry],
    quranData: QuranDataManager,
    pageMap: [String: Int]
) -> [MergedPageEntry]

1. Build pageGroups: [Int: [ResolvedEntry]]  (page → entries touching it)
2. consumedIds: Set<UUID> = []
3. result: [MergedPageEntry] = []
4. For each (pageNum, entries) in pageGroups:
   if pageFullyCovered(pageNum, entries):
     → Create MergedPageEntry(id: "page-\(pageNum)", pageNum, bounds, sourceIds, isMerged: true)
     → Add all entry IDs to consumedIds
5. For each old entry NOT in consumedIds:
   → Create MergedPageEntry wrapping the unmerged entry (isMerged: false)
6. Sort by createdAt descending
```

## 4. Suggestion Engine (SuggestionEngine.swift)

Port of `fsrs.js computeSurahSuggestions()`. The most complex business logic.

### 4.1 Compute Surah Suggestions

```
func computeSurahSuggestions(
    oldEntries: [ResolvedEntry],
    snapshot: [String: CardState],
    quranData: QuranDataManager,
    pageMap: [String: Int]
) -> [SurahSuggestion]

Step 1: Collect all memorized verse keys from old entries
    memorizedVerses: Set<String> = []
    for entry in oldEntries:
        for v in quranData.versesInRange(entry's range):
            memorizedVerses.insert("\(v.surahNum):\(v.verseNum)")

Step 2: Compute per-verse FSRS state using DATE-ONLY math
    let now = DateHelpers.today()  // midnight, no time component
    var verseInfos: [(surahNum, verseNum, pageNum, dueIn, retention, reps, reviewed)]

    for key in memorizedVerses:
        let (surahNum, verseNum) = parse(key)
        let pageNum = pageMap[key]
        let card = snapshot[key]

        if card == nil:
            dueIn = 0, retention = 0, reps = 0, reviewed = false
        else:
            let lastDay = DateHelpers.startOfDay(card.lastReview)
            let d = now.timeIntervalSince(lastDay) / 86400
            retention = FSRSEngine.retrievability(t: d, S: card.stability)
            interval = min(FSRSEngine.nextInterval(S: card.stability), 14)
            dueIn = Double(interval) - d
            reps = card.reps
            reviewed = true

Step 3: Group by surah → page
    surahPageGroups: [Int: [Int: [VerseInfo]]]

Step 4: Build verse groups (consecutive verses on same page)
    For each surah → page → sorted verses:
        Group consecutive verseNums into ranges
        Finalize each group: avgRetention, avgReviews, minDueIn, isDue, overdueDays

Step 5: Split into dueGroups / upcomingGroups per surah
Step 6: Build SurahSuggestion for each surah
Step 7: Sort: due surahs first, then by earliest minDueIn
```

### 4.2 Due Count Computation

Port of `dueCount` useMemo in `App.jsx`:

```
func computeDueCount(
    newEntries: [ClassifiedEntry],
    revisions: [RevisionEntry],
    surahSuggestions: [SurahSuggestion]
) -> Int {
    let newDue = newEntries.filter { !isRevisedToday($0, revisions) }.count
    let oldDue = surahSuggestions.reduce(0) { $0 + $1.totalDueGroups }
    return newDue + oldDue
}
```

## 5. Surah Scoping for Forms

Port of `memorizedSurahNums` and `fullyMemorizedSurahNums` from `App.jsx`:

```
/// Surahs with at least one memorized verse (for revision form dropdown)
func memorizedSurahNumbers(entries: [MemorizationEntry]) -> Set<Int> {
    var nums = Set<Int>()
    for entry in entries {
        for s in entry.startSurah...entry.endSurah {
            nums.insert(s)
        }
    }
    return nums
}

/// Surahs fully memorized (excluded from memorization form)
func fullyMemorizedSurahNumbers(
    entries: [MemorizationEntry],
    quranData: QuranDataManager
) -> Set<Int> {
    var memorizedBySurah: [Int: Set<Int>] = [:]
    for entry in entries {
        let verses = quranData.versesInRange(entry's range)
        for v in verses {
            memorizedBySurah[v.surahNum, default: []].insert(v.verseNum)
        }
    }
    var full = Set<Int>()
    for surah in quranData.surahs {
        if let mem = memorizedBySurah[surah.num], mem.count >= surah.numVerses {
            full.insert(surah.num)
        }
    }
    return full
}
```

## 6. Unit Test Plan

| Test File | Tests |
|---|---|
| `ClassificationTests.swift` | Partial verse resolution (fractional trimming, empty entry removal), new/old classification at boundary (20 reps → new, 21 → old), range overlap checks |
| `PageMergerTests.swift` | Full page coverage detection, multi-surah page spans, partial page passthrough, merge with sourceIds tracking |
| `SuggestionEngineTests.swift` | Date-only math (no time component leaking), due/upcoming split, consecutive verse grouping, sorting (due first, then by minDueIn) |
| `ImportExportTests.swift` | Round-trip: export from web → import to iOS → export from iOS → matches original |
