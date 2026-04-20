import Foundation
import SwiftData

/// Persists a single per-verse FSRS card state in SwiftData.
/// The full snapshot is the collection of all VerseState rows.
@Model
final class VerseState {
    @Attribute(.unique) var key: String  // "surahNum:verseNum" e.g. "2:255"
    var stability: Double
    var difficulty: Double
    var lastReview: Date
    var reps: Int

    init(key: String, stability: Double, difficulty: Double, lastReview: Date, reps: Int) {
        self.key = key
        self.stability = stability
        self.difficulty = difficulty
        self.lastReview = lastReview
        self.reps = reps
    }

    var cardState: CardState {
        CardState(stability: stability, difficulty: difficulty, lastReview: lastReview, reps: reps)
    }

    func update(from card: CardState) {
        stability = card.stability
        difficulty = card.difficulty
        lastReview = card.lastReview
        reps = card.reps
    }
}
