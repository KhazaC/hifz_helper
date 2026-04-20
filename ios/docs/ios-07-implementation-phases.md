# iOS Port — Implementation Phases

## Phase 1: Foundation (Blocks everything else)

**Goal**: Xcode project, data models, FSRS engine, static data loading. No UI yet.

### Steps

1. **Create Xcode project**
   - New SwiftUI App, iOS 17+, target name `QuranTracker`
   - Location: `quran-tracker-simple/ios/`
   - Enable CloudKit capability with container `iCloud.com.{bundleId}`
   - Enable Background Modes → Remote notifications
   - Add unit test target `QuranTrackerTests`

2. **Bundle static JSON files**
   - Copy `public/data/surah_index.json`, `verse_data.json`, `pageMap.json` into `Resources/`
   - Add to Xcode target membership

3. **Implement `FSRSTypes.swift`**
   - `FSRSGrade` enum (again/hard/good/easy)
   - `CardState` struct (stability, difficulty, lastReview, reps)
   - `QualityLabel` enum (poor/weak/okay/good/solid)
   - Port from: `src/constants.js` quality labels, `src/fsrs.js` types

4. **Implement `FSRSEngine.swift`**
   - All 8 functions: retrievability, nextInterval, initStability, initDifficulty, updateDifficulty, updateStabilitySuccess, updateStabilityFail, processReview
   - 17 weights as static constants
   - Port from: `src/fsrs.js` lines 1–140

5. **Implement `DateHelpers.swift`**
   - today(), startOfDay(), dateString(), isSameDay(), daysBetween()
   - Port from: `src/constants.js` localDateStr, isoToLocalDate

6. **Implement `QuranDataManager.swift`**
   - Parse surah_index.json → `[SurahInfo]`
   - Parse verse_data.json → `[Int: PageInfo]`
   - Parse pageMap.json → `[String: Int]`
   - Build verse index (lazy, cached) — port `getVerseIndex()` from `src/fsrs.js`
   - `versesInRange()` — port `getVersesInRange()` from `src/fsrs.js`
   - `surahName()`, `maxVerses()`

7. **Implement SwiftData models**
   - `MemorizationEntry.swift` — `@Model` with `@Attribute(.unique) var id: UUID`
   - `RevisionEntry.swift` — `@Model` with quality, dates
   - Port from: `src/App.jsx` state shapes, `DESIGN_DOC.md` §3.1-3.2

8. **Implement `SnapshotManager.swift`**
   - `@Observable` class holding `[String: CardState]`
   - `applyRevision()` — port from `src/fsrs.js applyRevisionToSnapshot()`
   - `rebuildFromRevisions()` — port from `src/fsrs.js rebuildSnapshot()`

9. **Write unit tests**
   - `FSRSEngineTests.swift`: All core formula tests (see 02-FSRS-ENGINE.md §4)
   - Verify against known JS outputs: run identical inputs through both implementations

### Verification
- All unit tests pass
- `QuranDataManager` loads all 114 surahs, 604 pages, 6236 verse mappings
- FSRS `processReview` output matches web app for same inputs
- Project builds for iOS 17 simulator

### Dependencies
- None (this is the foundation)

---

## Phase 2: Business Logic (Depends on Phase 1)

**Goal**: Classification, page merging, suggestion computation. All testable without UI.

### Steps

1. **Implement `ClassificationEngine.swift`**
   - `resolvePartialVerses()` — port from `src/pageMerge.js`
   - `classifyEntries()` — port from `src/App.jsx` useMemo block (lines ~120-145)
   - `rangesOverlap()` — port from `src/components/SuggestionsPanel.jsx`
   - `isRevisedToday()` — port from `src/components/SuggestionsPanel.jsx hasRevisionToday()`
   - Surah scoping: `memorizedSurahNumbers()`, `fullyMemorizedSurahNumbers()` — port from `src/App.jsx`

2. **Implement `PageMerger.swift`**
   - `pagesForEntry()` — port from `src/pageMerge.js getPagesForEntry()`
   - `pageFullyCovered()` — port from `src/pageMerge.js`
   - `mergeByPage()` — port from `src/pageMerge.js mergeByPage()`
   - `MergedPageEntry` struct

3. **Implement `SuggestionEngine.swift`**
   - `computeSurahSuggestions()` — port from `src/fsrs.js` lines 400-550
   - `VerseGroup`, `SurahSuggestion` types
   - Date-only math (strip time components)
   - Due count computation

4. **Implement `DTOs.swift`**
   - `MemorizationEntryDTO`, `RevisionEntryDTO`, `CardStateDTO`
   - `BackupFile` with custom CodingKeys matching web JSON
   - `IntOrString` helper for flexible int/string parsing
   - Conversion methods: `toDTO()` and `toModel()`

5. **Write unit tests**
   - `ClassificationTests.swift`: Partial verse resolution, new/old boundary, overlap checks, today filter
   - `PageMergerTests.swift`: Full page coverage, multi-surah spans, merge output
   - `SuggestionEngineTests.swift`: Date-only math, grouping, sorting

### Verification
- All unit tests pass
- Import web app's `test_data.json` → verify classification matches web app output
- Suggestion computation produces same surah ordering as web app
- Partial verse resolution handles edge cases (fractional, empty after trim)

### Dependencies
- Phase 1 complete

---

## Phase 3: Core UI — Suggestions & Revisions (Depends on Phase 2)

**Goal**: Working app with Suggestions and Revisions tabs. Can log and view revisions.

### Steps

1. **App entry point**
   - `QuranTrackerApp.swift` — ModelContainer setup with CloudKit config
   - `ContentView.swift` — TabView with 4 tabs (stubs for Memorizations/Stats)
   - Wire up `QuranDataManager` and `SnapshotManager` as `@Environment` objects

2. **Shared components**
   - `SurahVersePicker.swift` — surah dropdowns + verse text fields
   - `QualityPicker.swift` — 5 quality chip buttons
   - `CollapsibleSection.swift` — DisclosureGroup wrapper

3. **Suggestions tab**
   - `SuggestionsTab.swift` — ScrollView with 3 sections
   - `NewMemorizationSection.swift` — grouped by surah, revision count, today filter
   - `OldMemorizationSection.swift` — grouped by surah → page, color coding, due badges
   - `ComingUpSection.swift` — top 5 upcoming groups
   - `InlineRevisionMenu.swift` — quality picker + optional date + submit

4. **Revisions tab**
   - `RevisionsTab.swift` — form + log layout
   - `RevisionForm.swift` — SurahVersePicker + QualityPicker + DatePicker
   - `RevisionLog.swift` — paginated list with swipe actions
   - `RevisionFilters.swift` — collapsible filter panel

5. **Revision handlers**
   - Add revision → insert into ModelContext + incremental snapshot update
   - Edit revision → update in ModelContext + full snapshot rebuild
   - Delete revision → delete from ModelContext + full snapshot rebuild
   - Quick revision (from suggestions) → same as add

### Verification
- Can log a revision from the Suggestions tab inline menu
- Can log a revision from the Revisions tab form
- Can edit/delete a revision with swipe actions
- Revision log filters work (surah, quality, date range)
- Due count badge updates on Suggestions tab
- New memorization entries hide after being revised today
- Old memorization shows correct due/upcoming split

### Dependencies
- Phase 2 complete

---

## Phase 4: Memorizations & Stats (Parallel with Phase 3 after shared components exist)

**Goal**: Complete all 4 tabs.

### Steps

1. **Memorizations tab**
   - `MemorizationsTab.swift`
   - `MemorizationForm.swift` — SurahVersePicker + DatePicker, surah exclusion
   - `MemorizedSections.swift` — new/old split, merged page badges, pagination
   - Handlers: add, edit, delete memorization entries

2. **Stats tab**
   - `StatsTab.swift`
   - `ProgressOverview.swift` — verse count, progress bar, surah breakdown
   - `StatisticsGrid.swift` — LazyVGrid of stat cards, streak computation
   - `CalendarHeatmap.swift` — 13-week grid with color intensity

### Verification
- Can add/edit/delete memorization entries
- Fully memorized surahs excluded from dropdown
- Stats show correct counts (today/week/month)
- Streak computation correct (consecutive days ending today or yesterday)
- Heatmap renders 91 days with correct color intensities
- Progress bar shows accurate verse count

### Dependencies
- Shared components from Phase 3 (SurahVersePicker, QualityPicker)
- Business logic from Phase 2

---

## Phase 5: Import/Export & Data Management (Depends on Phase 3)

**Goal**: Data portability with web app. Test data loading.

### Steps

1. **Implement `ImportExportService.swift`**
   - `exportData()` → JSON `Data` matching web format
   - `exportAndShare()` → write to temp file, return URL for ShareLink
   - `importData(from:)` → parse, validate, return counts
   - `confirmImport(from:)` → delete all, insert imported, rebuild snapshot
   - `loadTestData()` → load bundled test_data.json

2. **Implement `DataManagementView.swift`**
   - Export button → ShareLink (AirDrop, Files, email, etc.)
   - Import button → fileImporter for .json
   - Load Test Data button (debug only)
   - Clear All Data button → confirmationDialog

3. **Bundle test data**
   - Copy `public/data/test_data.json` into Resources (debug config only)

### Verification
- Export from web → import to iOS → all entries/revisions match
- Export from iOS → import to web → all data intact
- Round-trip: web export → iOS import → iOS export → compare JSON
- Clear all data removes everything
- Test data loads correctly

### Dependencies
- Phase 3 (needs working SwiftData models and SnapshotManager)

---

## Phase 6: Notifications (Depends on Phase 3)

**Goal**: Local notifications for due revisions and streak protection.

### Steps

1. **Implement `NotificationService.swift`**
   - Permission request
   - Daily summary scheduling
   - Streak risk notification
   - Badge count updates
   - Cancellation on revision logged

2. **Add notification settings UI**
   - Toggle notifications on/off
   - Set daily reminder time
   - Toggle streak reminders

3. **Wire notification refresh points**
   - App launch → schedule/update
   - Revision logged → cancel streak, update badge
   - App background → update badge
   - Data import → reschedule all

### Verification
- Notification permission dialog appears on first enable
- Daily summary fires at configured time
- Streak reminder fires at 9 PM if no revision today
- Streak reminder cancels when revision logged
- Badge shows correct due count
- Notifications work when app is in background

### Dependencies
- Phase 3 (needs due count computation and revision logging)

---

## Phase 7: iCloud Sync Polish (Depends on Phase 5)

**Goal**: Verify and polish multi-device sync.

### Steps

1. **Test sync scenarios**
   - Add entry on Device A → appears on Device B
   - Add revision on Device A → Device B snapshot rebuilds
   - Edit entry on both devices simultaneously → conflict resolution
   - Delete on one device → removes from other
   - Offline changes → sync when back online

2. **Handle remote change notifications**
   - `NSPersistentStoreRemoteChange` observer in SnapshotManager
   - Rebuild snapshot on remote changes
   - Ensure UI refreshes (SwiftData should handle via `@Query`)

3. **First-launch sync**
   - New device installs app → pulls existing data from iCloud
   - Progress indicator while initial sync completes

### Verification
- Changes appear on second device within ~30 seconds
- Snapshot is correct after sync on both devices
- App works fully offline
- No data loss during conflict resolution

### Dependencies
- Phase 5 (import/export ensures data integrity)

---

## Phase 8: Widgets (Future — Depends on Phase 7)

**Goal**: Home screen and lock screen widgets.

### Steps

1. **Set up App Group**
   - Create App Group in Xcode capabilities
   - Move SwiftData container URL to shared App Group container
   - Verify main app still works with new container location

2. **Create Widget extension target**
   - Add WidgetKit extension
   - Share FSRS, Models, Logic code via shared Swift package or target membership

3. **Implement widgets**
   - Due Count widget (small)
   - Today Summary widget (medium)
   - Timeline provider with midnight refresh

### Dependencies
- All previous phases complete
- Main app stable

---

## Phase Summary

| Phase | Description | Depends On | Estimated Effort |
|---|---|---|---|
| 1 | Foundation (models, FSRS, data loading) | — | Core |
| 2 | Business Logic (classification, merging, suggestions) | Phase 1 | Core |
| 3 | Core UI (Suggestions + Revisions tabs) | Phase 2 | Core |
| 4 | Memorizations + Stats tabs | Phase 2 + shared components | Can parallel Phase 3 |
| 5 | Import/Export & Data Management | Phase 3 | Important |
| 6 | Notifications | Phase 3 | Enhancement |
| 7 | iCloud Sync Polish | Phase 5 | Enhancement |
| 8 | Widgets | Phase 7 | Future |

```
Phase 1 ──▶ Phase 2 ──┬──▶ Phase 3 ──┬──▶ Phase 5 ──▶ Phase 7 ──▶ Phase 8
                       │              │
                       └──▶ Phase 4   └──▶ Phase 6
                       (can parallel)  (can parallel with 5)
```

## Key Risk Areas

1. **SwiftData + CloudKit maturity**: SwiftData's CloudKit integration is iOS 17+ and may have edge cases. Test sync thoroughly on real devices (simulator doesn't support CloudKit).
2. **Snapshot rebuild performance**: With thousands of revisions, `rebuildFromRevisions()` could take >1s. If so, add an on-disk JSON cache with a revision count checksum.
3. **Web app date format quirks**: The web app's ISO date strings may have timezone offsets. Test import with dates from various timezones.
4. **DisclosureGroup nesting**: Deep nesting (surah → page → verse group) may cause SwiftUI performance issues. Use `LazyVStack` and test with large datasets.
5. **Widget data freshness**: Widgets can only refresh on a timeline. Due count may be stale until next refresh (midnight or background app refresh).
