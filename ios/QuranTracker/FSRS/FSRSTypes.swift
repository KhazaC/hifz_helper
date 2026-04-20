import Foundation

// MARK: - FSRS Grade

/// FSRS grade (1–4), converted from the user's 5-point quality scale.
/// Matches the web app's `qualityToGrade()` mapping.
enum FSRSGrade: Int, Sendable {
    case again = 1
    case hard = 2
    case good = 3
    case easy = 4

    /// Map a 5-point quality rating to a 4-point FSRS grade.
    ///
    ///   Quality 1 (Poor)  → Again (1)
    ///   Quality 2 (Weak)  → Hard  (2)
    ///   Quality 3 (Okay)  → Good  (3)
    ///   Quality 4 (Good)  → Good  (3)
    ///   Quality 5 (Solid) → Easy  (4)
    static func from(quality: Int) -> FSRSGrade {
        switch quality {
        case ...1: return .again
        case 2:    return .hard
        case 3, 4: return .good
        default:   return .easy
        }
    }
}

// MARK: - Card State

/// Per-verse FSRS state. Keyed by "surahNum:verseNum" (e.g., "2:255").
/// Held in memory only — always derivable from revision history.
struct CardState: Codable, Sendable {
    var stability: Double   // S — memory strength in days (≥ 0.1)
    var difficulty: Double  // D — clamped to 1.0…10.0
    var lastReview: Date    // When last reviewed
    var reps: Int           // Total review count
}

// MARK: - Quality Label

/// Quality label mapping (matches web app's `qualityLabels`).
enum QualityLabel: Int, CaseIterable, Sendable {
    case poor = 1
    case weak = 2
    case okay = 3
    case good = 4
    case solid = 5

    var label: String {
        switch self {
        case .poor:  "Poor"
        case .weak:  "Weak"
        case .okay:  "Okay"
        case .good:  "Good"
        case .solid: "Solid"
        }
    }
}

// MARK: - Constants

enum AppConstants {
    /// Revisions required before an entry graduates from "new" to "old".
    static let newPeriodRevisions = 21

    /// Schema version for data migration.
    static let schemaVersion = 2

    /// Maximum interval cap in days.
    static let maxIntervalDays = 14

    /// Desired retention for FSRS scheduling.
    static let desiredRetention = 0.9
}
