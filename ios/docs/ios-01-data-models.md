# iOS Port — Data Models

## 1. SwiftData `@Model` Classes

### 1.1 MemorizationEntry

Maps to web app's `MemorizationEntry`. Persisted in SwiftData, synced via iCloud.

```swift
@Model
final class MemorizationEntry {
    @Attribute(.unique) var id: UUID
    var startSurah: Int          // 1–114
    var startVerse: String       // "1" or "5.2" (fractional = partial verse)
    var endSurah: Int            // 1–114
    var endVerse: String         // "7" or "10.5"
    var createdAt: Date
    var updatedAt: Date

    init(startSurah: Int, startVerse: String, endSurah: Int, endVerse: String,
         createdAt: Date = .now, updatedAt: Date = .now) {
        self.id = UUID()
        self.startSurah = startSurah
        self.startVerse = startVerse
        self.endSurah = endSurah
        self.endVerse = endVerse
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}
```

**Notes:**
- `startVerse`/`endVerse` are `String` (not `Double`) to match web app's fractional verse format ("5.2")
- `@Attribute(.unique)` on `id` ensures CloudKit dedup

### 1.2 RevisionEntry

Maps to web app's `RevisionEntry`. Persisted in SwiftData, synced via iCloud.

```swift
@Model
final class RevisionEntry {
    @Attribute(.unique) var id: UUID
    var startSurah: Int
    var startVerse: String
    var endSurah: Int
    var endVerse: String
    var quality: Int             // 1–5
    var createdAt: Date
    var updatedAt: Date

    init(startSurah: Int, startVerse: String, endSurah: Int, endVerse: String,
         quality: Int, createdAt: Date = .now, updatedAt: Date = .now) {
        self.id = UUID()
        self.startSurah = startSurah
        self.startVerse = startVerse
        self.endSurah = endSurah
        self.endVerse = endVerse
        self.quality = quality
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}
```

### 1.3 ModelContainer Configuration

```swift
// In QuranTrackerApp.swift
@main
struct QuranTrackerApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .modelContainer(for: [MemorizationEntry.self, RevisionEntry.self],
                         isAutosaveEnabled: true,
                         isUndoEnabled: false)
        // CloudKit is enabled automatically when the app has the CloudKit capability
        // and the model container uses the default configuration
    }
}
```

For iCloud, use:
```swift
let config = ModelConfiguration(
    "QuranTracker",
    schema: Schema([MemorizationEntry.self, RevisionEntry.self]),
    cloudKitDatabase: .automatic  // .private for user data
)
let container = try ModelContainer(for: MemorizationEntry.self, RevisionEntry.self,
                                    configurations: config)
```

## 2. FSRS Types (Pure Swift, No SwiftData)

These are value types used by the FSRS engine. NOT persisted in SwiftData — held in memory only.

```swift
// FSRSTypes.swift

/// FSRS grade (1–4), converted from user's 5-point quality scale
enum FSRSGrade: Int {
    case again = 1
    case hard = 2
    case good = 3
    case easy = 4

    /// Map 5-point quality to FSRS grade (matches web app's qualityToGrade)
    static func from(quality: Int) -> FSRSGrade {
        switch quality {
        case ...1: return .again
        case 2: return .hard
        case 3, 4: return .good
        default: return .easy
        }
    }
}

/// Per-verse FSRS state. Key: "surahNum:verseNum" (e.g., "2:255")
struct CardState: Codable {
    var stability: Double    // S — memory strength in days (≥ 0.1)
    var difficulty: Double   // D — 1.0 to 10.0
    var lastReview: Date     // When last reviewed
    var reps: Int            // Total review count
}

/// Quality label mapping (matches web app)
enum QualityLabel: Int, CaseIterable {
    case poor = 1, weak = 2, okay = 3, good = 4, solid = 5

    var label: String {
        switch self {
        case .poor: "Poor"
        case .weak: "Weak"
        case .okay: "Okay"
        case .good: "Good"
        case .solid: "Solid"
        }
    }
}
```

## 3. Static Quran Data Types

Codable structs for deserializing the bundled JSON files. Read-only, loaded once.

```swift
// QuranDataManager.swift

/// A single surah's metadata (from surah_index.json)
struct SurahInfo: Identifiable {
    let num: Int           // 1–114
    let name: String       // "Al-Faatiha"
    let numVerses: Int     // 7
    let startPage: Int
    let endPage: Int

    var id: Int { num }
}

/// A single verse on a page (from verse_data.json)
struct VerseInfo {
    let surahNum: Int
    let verseNum: Int
    let wordCount: Int
}

/// A page of the Quran (from verse_data.json)
struct PageInfo {
    let pageNum: Int
    let verses: [VerseInfo]
}

/// Holds all static Quran data in memory
@Observable
final class QuranDataManager {
    static let shared = QuranDataManager()

    private(set) var surahs: [SurahInfo] = []          // 114 entries
    private(set) var pages: [Int: PageInfo] = [:]       // 604 pages
    private(set) var pageMap: [String: Int] = [:]       // "surah:verse" → pageNum

    // Lazy-built indexes (mirrors web app's getVerseIndex)
    private var verseIndex: [Int: [Int: VerseInfo]] = [:]  // surahNum → { verseNum → VerseInfo }
    private var maxVerse: [Int: Int] = [:]                  // surahNum → max verse number

    var isLoaded: Bool { !surahs.isEmpty }

    func load() throws { /* parse bundled JSON files */ }

    func surahName(_ num: Int) -> String { ... }
    func maxVerses(forSurah num: Int) -> Int { ... }
    func versesInRange(startSurah: Int, startVerse: Int,
                       endSurah: Int, endVerse: Int) -> [VerseInfo] { ... }
}
```

## 4. Import/Export DTOs (Codable)

These match the web app's JSON schema exactly for cross-platform data portability.

```swift
// DTOs.swift

/// Matches web app's MemorizationEntry JSON shape
struct MemorizationEntryDTO: Codable {
    let id: String
    let startSurah: IntOrString       // Web app may store as Int or String
    let startVerse: String
    let endSurah: IntOrString
    let endVerse: String
    let createdAt: String             // ISO 8601
    let updatedAt: String
}

/// Matches web app's RevisionEntry JSON shape
struct RevisionEntryDTO: Codable {
    let id: String
    let startSurah: IntOrString
    let startVerse: String
    let endSurah: IntOrString
    let endVerse: String
    let quality: Int
    let createdAt: String
    let updatedAt: String
}

/// Matches web app's CardState JSON shape
struct CardStateDTO: Codable {
    let stability: Double
    let difficulty: Double
    let lastReview: String            // ISO 8601
    let reps: Int
}

/// Top-level backup file structure
struct BackupFile: Codable {
    let memorization_entries: [MemorizationEntryDTO]   // key: "quran-memorization-entries"
    let revision_entries: [RevisionEntryDTO]            // key: "quran-revision-entries"
    let verse_fsrs_state: [String: CardStateDTO]?       // key: "quran-verse-fsrs-state"
    let exportedAt: String?
    let schemaVersion: Int?

    enum CodingKeys: String, CodingKey {
        case memorization_entries = "quran-memorization-entries"
        case revision_entries = "quran-revision-entries"
        case verse_fsrs_state = "quran-verse-fsrs-state"
        case exportedAt
        case schemaVersion
    }
}

/// Helper to handle web app's inconsistent int/string surah numbers
enum IntOrString: Codable {
    case int(Int)
    case string(String)

    var intValue: Int {
        switch self {
        case .int(let v): return v
        case .string(let s): return Int(s) ?? 0
        }
    }
}
```

## 5. Derived Types (Computed at Runtime)

These match the web app's computed types. Not persisted.

```swift
/// A classified memorization entry with revision status
struct ClassifiedEntry {
    let entry: MemorizationEntry      // or a resolved copy
    let isNew: Bool                   // minReps < 21
    let revisionCount: Int            // minReps across all verses
    let revisionsRemaining: Int       // 21 - revisionCount (if new)
}

/// Merged page entry (from PageMerger)
struct MergedPageEntry: Identifiable {
    let id: String                    // "page-{N}" for merged, entry.id for unmerged
    let pageNum: Int?
    let startSurah: Int
    let startVerse: String
    let endSurah: Int
    let endVerse: String
    let createdAt: Date
    let updatedAt: Date
    let sourceIds: [UUID]
    let sourceCount: Int
    let isMerged: Bool
}

/// Verse group within a surah suggestion (consecutive verses on same page)
struct VerseGroup: Identifiable {
    var id: String { "\(surahNum):\(pageNum):\(startVerse)-\(endVerse)" }
    let surahNum: Int
    let pageNum: Int
    let startVerse: Int
    let endVerse: Int
    let totalVerses: Int
    let reviewedVerses: Int
    let avgRetention: Double          // 0.0–1.0
    let avgReviews: Double
    let minDueIn: Double              // Days until due (≤ 0 = overdue)
    let isDue: Bool
    let overdueDays: Double
}

/// Surah-level suggestion aggregation
struct SurahSuggestion: Identifiable {
    var id: Int { surahNum }
    let surahNum: Int
    let startVerse: String
    let endVerse: String
    let allGroups: [VerseGroup]
    let dueGroups: [VerseGroup]
    let upcomingGroups: [VerseGroup]
    let totalDueGroups: Int
    let totalGroups: Int
    let isDue: Bool
    let minDueIn: Double
    let avgRetention: Double
}
```

## 6. Web → iOS Type Mapping Summary

| Web (JS) | iOS (Swift) | Storage |
|---|---|---|
| `MemorizationEntry` object | `MemorizationEntry` `@Model` | SwiftData + iCloud |
| `RevisionEntry` object | `RevisionEntry` `@Model` | SwiftData + iCloud |
| `verseSnapshot` `{}` | `[String: CardState]` dict | In-memory only |
| `surah_index.json` | `[SurahInfo]` | Bundled JSON |
| `verse_data.json` | `[Int: PageInfo]` | Bundled JSON |
| `pageMap.json` | `[String: Int]` | Bundled JSON |
| localStorage JSON | SwiftData `@Model` | Auto-persisted |
| `id` (UUID string) | `UUID` | Native UUID type |
| `createdAt` (ISO string) | `Date` | Native Date type |
| `quality` (1–5 number) | `Int` (1–5) | Same range |
| `startVerse` ("5.2" string) | `String` | Same format |
