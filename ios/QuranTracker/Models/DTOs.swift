import Foundation

// MARK: - Import/Export DTOs

/// Matches the web app's JSON backup file structure exactly.
struct BackupFile: Codable {
    let memorizationEntries: [MemorizationEntryDTO]
    let revisionEntries: [RevisionEntryDTO]
    let verseFsrsState: [String: CardStateDTO]?
    let exportedAt: String?
    let schemaVersion: Int?

    enum CodingKeys: String, CodingKey {
        case memorizationEntries = "quran-memorization-entries"
        case revisionEntries = "quran-revision-entries"
        case verseFsrsState = "quran-verse-fsrs-state"
        case exportedAt
        case schemaVersion
    }
}

/// Matches the web app's MemorizationEntry JSON shape.
struct MemorizationEntryDTO: Codable {
    let id: String
    let startSurah: IntOrString
    let startVerse: String
    let endSurah: IntOrString
    let endVerse: String
    let createdAt: String
    let updatedAt: String
}

/// Matches the web app's RevisionEntry JSON shape.
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

/// Matches the web app's CardState JSON shape.
struct CardStateDTO: Codable {
    let stability: Double
    let difficulty: Double
    let lastReview: String
    let reps: Int
}

// MARK: - IntOrString

/// Handles web app's inconsistent int/string surah numbers.
enum IntOrString: Codable, Sendable {
    case int(Int)
    case string(String)

    var intValue: Int {
        switch self {
        case .int(let v): return v
        case .string(let s): return Int(s) ?? 0
        }
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let intVal = try? container.decode(Int.self) {
            self = .int(intVal)
        } else if let strVal = try? container.decode(String.self) {
            self = .string(strVal)
        } else {
            throw DecodingError.typeMismatch(
                IntOrString.self,
                DecodingError.Context(codingPath: decoder.codingPath,
                                      debugDescription: "Expected Int or String")
            )
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .int(let v): try container.encode(v)
        case .string(let s): try container.encode(s)
        }
    }
}

// MARK: - Derived Types (Computed at Runtime)

/// A classified memorization entry with revision status.
struct ClassifiedEntry: Identifiable {
    let entry: MemorizationEntry
    let isNew: Bool
    let revisionCount: Int
    let revisionsRemaining: Int

    var id: UUID { entry.id }
}

/// Merged page entry (from PageMerger).
struct MergedPageEntry: Identifiable {
    let id: String
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

/// Verse group within a surah suggestion (consecutive verses on same page).
struct VerseGroup: Identifiable {
    var id: String { "\(surahNum):\(pageNum):\(startVerse)-\(endVerse)" }
    let surahNum: Int
    let pageNum: Int
    let startVerse: Int
    let endVerse: Int
    let totalVerses: Int
    let reviewedVerses: Int
    let avgRetention: Double
    let avgReviews: Double
    let minDueIn: Double
    let isDue: Bool
    let overdueDays: Double
}

/// Surah-level suggestion aggregation.
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
