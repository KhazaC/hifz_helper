# iOS Port — Architecture Overview

## Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| UI | SwiftUI | Declarative, iOS 17+ |
| Data | SwiftData (`@Model`) | Built on Core Data, iCloud-ready |
| Sync | CloudKit (via SwiftData) | Automatic iCloud sync across devices |
| Notifications | `UNUserNotificationCenter` | Local notifications for due revisions |
| Algorithm | Pure Swift module | FSRS v4, no dependencies |
| Static Data | Bundled JSON files | `surah_index.json`, `verse_data.json`, `pageMap.json` |
| Minimum Target | iOS 17.0 | Required for SwiftData |

## Project Location

```
quran-tracker-simple/
├── ios/
│   ├── QuranTracker.xcodeproj
│   ├── QuranTracker/
│   │   ├── QuranTrackerApp.swift          // @main entry, ModelContainer setup
│   │   ├── ContentView.swift              // Root TabView
│   │   ├── Models/
│   │   │   ├── MemorizationEntry.swift    // @Model
│   │   │   ├── RevisionEntry.swift        // @Model
│   │   │   ├── AppSettings.swift          // @Model (schema version, preferences)
│   │   │   └── DTOs.swift                 // Codable structs for JSON import/export
│   │   ├── FSRS/
│   │   │   ├── FSRSEngine.swift           // Core FSRS v4 algorithm (pure functions)
│   │   │   ├── FSRSTypes.swift            // CardState struct, Grade enum
│   │   │   └── SnapshotManager.swift      // Apply/rebuild verse snapshot
│   │   ├── Logic/
│   │   │   ├── QuranDataManager.swift     // Load & cache static JSON data
│   │   │   ├── ClassificationEngine.swift // New/Old classification, partial verse resolution
│   │   │   ├── PageMerger.swift           // Page-level merging for old entries
│   │   │   ├── SuggestionEngine.swift     // Compute surah suggestions
│   │   │   └── DateHelpers.swift          // Local timezone date utilities
│   │   ├── Views/
│   │   │   ├── Suggestions/
│   │   │   │   ├── SuggestionsTab.swift
│   │   │   │   ├── NewMemorizationSection.swift
│   │   │   │   ├── OldMemorizationSection.swift
│   │   │   │   ├── ComingUpSection.swift
│   │   │   │   └── InlineRevisionMenu.swift
│   │   │   ├── Revisions/
│   │   │   │   ├── RevisionsTab.swift
│   │   │   │   ├── RevisionForm.swift
│   │   │   │   ├── RevisionLog.swift
│   │   │   │   └── RevisionFilters.swift
│   │   │   ├── Memorizations/
│   │   │   │   ├── MemorizationsTab.swift
│   │   │   │   ├── MemorizationForm.swift
│   │   │   │   └── MemorizedSections.swift
│   │   │   ├── Stats/
│   │   │   │   ├── StatsTab.swift
│   │   │   │   ├── ProgressOverview.swift
│   │   │   │   ├── StatisticsGrid.swift
│   │   │   │   └── CalendarHeatmap.swift
│   │   │   ├── Shared/
│   │   │   │   ├── SurahVersePicker.swift
│   │   │   │   ├── QualityPicker.swift
│   │   │   │   └── CollapsibleSection.swift
│   │   │   └── Settings/
│   │   │       └── DataManagementView.swift
│   │   ├── Services/
│   │   │   ├── NotificationService.swift
│   │   │   └── ImportExportService.swift
│   │   └── Resources/
│   │       ├── surah_index.json           // Copied from public/data/
│   │       ├── verse_data.json
│   │       └── pageMap.json
│   └── QuranTrackerTests/
│       ├── FSRSEngineTests.swift
│       ├── ClassificationTests.swift
│       ├── PageMergerTests.swift
│       ├── SuggestionEngineTests.swift
│       └── ImportExportTests.swift
```

## Architecture Diagram

```
┌─────────────────────────────────────────────────┐
│                   SwiftUI Views                  │
│  ┌──────────┬───────────┬──────────┬──────────┐ │
│  │Suggestions│ Revisions │Memorize  │  Stats   │ │
│  └─────┬────┴─────┬─────┴────┬─────┴────┬─────┘ │
│        │          │          │          │         │
│  ┌─────▼──────────▼──────────▼──────────▼─────┐  │
│  │            Business Logic Layer             │  │
│  │  Classification · PageMerger · Suggestions  │  │
│  └─────────────────┬──────────────────────────┘  │
│                    │                              │
│  ┌────────┬────────▼────────┬─────────────────┐  │
│  │ FSRS   │   SwiftData    │  QuranData       │  │
│  │ Engine │   (iCloud)     │  (bundled JSON)  │  │
│  └────────┴────────────────┴─────────────────┘  │
└─────────────────────────────────────────────────┘
```

## Key Architecture Decisions

### 1. SwiftData as Source of Truth (not ViewModels)
Use `@Query` in views to directly observe SwiftData models. Business logic operates on `ModelContext`. No need for intermediate ViewModel state — SwiftData's change tracking + SwiftUI observation handles reactivity automatically.

### 2. FSRS as a Pure Function Module
The FSRS engine is a standalone Swift file with zero dependencies on SwiftData or SwiftUI. It takes simple structs in and returns simple structs out. This makes it independently unit-testable and identical to the web version's logic.

### 3. Snapshot as In-Memory Derived Data
The verse snapshot (`[String: CardState]`) is **computed from revisions** and cached in memory via an `@Observable SnapshotManager`. On app launch, rebuilt from all `RevisionEntry` records. Not persisted in SwiftData — always derivable from revisions.

**Rationale**: Avoids 6,236 potential SwiftData records. Web app already rebuilds from revisions on migration. If rebuild becomes slow (>1s), add an on-disk JSON cache invalidated when revisions change.

### 4. Static Quran Data: Bundle, Don't Store
The three JSON files are bundled in the app's resource bundle. Loaded once at startup, held in memory as a singleton `QuranDataManager`. Never stored in SwiftData.

### 5. iCloud Sync Strategy
SwiftData with CloudKit syncs `MemorizationEntry` and `RevisionEntry` automatically. The verse snapshot is rebuilt locally after sync delivers changes.
- Conflict resolution: CloudKit's default last-writer-wins per record
- No custom merge logic needed (unique UUIDs per entry)
- Snapshot consistency: always derived from current revision set

### 6. Data Compatibility with Web App
Import/export uses the exact same JSON format as the web app. `DTOs.swift` defines `Codable` structs matching the web JSON schema. `ImportExportService` maps between DTOs and SwiftData `@Model` objects.
