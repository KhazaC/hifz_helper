import Foundation
import SwiftData

/// A memorized section of the Quran.
/// Maps to the web app's MemorizationEntry in localStorage.
@Model
final class MemorizationEntry {
    @Attribute(.unique) var id: UUID
    var startSurah: Int
    var startVerse: String
    var endSurah: Int
    var endVerse: String
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
