import Foundation
import SwiftData

/// A logged revision (review) of a Quran section.
/// Maps to the web app's RevisionEntry in localStorage.
@Model
final class RevisionEntry {
    @Attribute(.unique) var id: UUID
    var startSurah: Int
    var startVerse: String
    var endSurah: Int
    var endVerse: String
    var quality: Int  // 1–5
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
