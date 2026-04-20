import Foundation
import SwiftData

/// Manages the in-memory per-verse FSRS snapshot, backed by SwiftData (VerseState).
/// The in-memory `snapshot` dict is the fast lookup; VerseState rows are the persistence layer.
@Observable
final class SnapshotManager {

    /// Per-verse FSRS state. Key: "surahNum:verseNum" (e.g., "2:255").
    private(set) var snapshot: [String: CardState] = [:]

    private let quranData: QuranDataManager
    private var modelContext: ModelContext?

    init(quranData: QuranDataManager = .shared) {
        self.quranData = quranData
    }

    /// Attach the SwiftData model context. Call once from ContentView.
    func setModelContext(_ context: ModelContext) {
        self.modelContext = context
    }

    /// Load snapshot from SwiftData VerseState rows into memory.
    /// Returns true if any rows were found.
    @discardableResult
    func loadFromStore() -> Bool {
        guard let ctx = modelContext else { return false }
        do {
            let states = try ctx.fetch(FetchDescriptor<VerseState>())
            guard !states.isEmpty else { return false }
            snapshot = [:]
            for s in states {
                snapshot[s.key] = s.cardState
            }
            return true
        } catch {
            return false
        }
    }

    /// Apply a single revision to the snapshot (incremental update).
    func applyRevision(_ revision: RevisionEntry) {
        let grade = FSRSGrade.from(quality: revision.quality)
        let verses = quranData.versesInRange(
            startSurah: revision.startSurah,
            startVerse: revision.startVerse,
            endSurah: revision.endSurah,
            endVerse: revision.endVerse
        )
        var updatedKeys: [String: CardState] = [:]
        for v in verses {
            let key = "\(v.surahNum):\(v.verseNum)"
            let card = snapshot[key]
            let newCard = FSRSEngine.processReview(
                card: card, grade: grade, reviewDate: revision.createdAt
            )
            snapshot[key] = newCard
            updatedKeys[key] = newCard
        }
        persistKeys(updatedKeys)
    }

    /// Rebuild the entire snapshot from scratch by replaying all revisions chronologically.
    func rebuild(from revisions: [RevisionEntry]) {
        snapshot = [:]
        let sorted = revisions.sorted { $0.createdAt < $1.createdAt }
        for rev in sorted {
            let grade = FSRSGrade.from(quality: rev.quality)
            let verses = quranData.versesInRange(
                startSurah: rev.startSurah,
                startVerse: rev.startVerse,
                endSurah: rev.endSurah,
                endVerse: rev.endVerse
            )
            for v in verses {
                let key = "\(v.surahNum):\(v.verseNum)"
                let card = snapshot[key]
                snapshot[key] = FSRSEngine.processReview(
                    card: card, grade: grade, reviewDate: rev.createdAt
                )
            }
        }
        persistAll()
    }

    /// Load snapshot from imported card states (for import).
    func rebuild(fromCards cards: [String: CardState]) {
        snapshot = cards
        persistAll()
    }

    /// Get the card state for a specific verse.
    func cardState(surah: Int, verse: Int) -> CardState? {
        snapshot["\(surah):\(verse)"]
    }

    /// Build a unique key for a memorized section.
    static func sectionKey(startSurah: Int, startVerse: String, endSurah: Int, endVerse: String) -> String {
        "\(startSurah):\(startVerse)-\(endSurah):\(endVerse)"
    }

    // MARK: - Private persistence

    /// Upsert specific keys into SwiftData.
    private func persistKeys(_ updates: [String: CardState]) {
        guard let ctx = modelContext else { return }
        for (key, card) in updates {
            let predicate = #Predicate<VerseState> { $0.key == key }
            let descriptor = FetchDescriptor(predicate: predicate)
            if let existing = try? ctx.fetch(descriptor).first {
                existing.update(from: card)
            } else {
                ctx.insert(VerseState(
                    key: key, stability: card.stability,
                    difficulty: card.difficulty, lastReview: card.lastReview,
                    reps: card.reps
                ))
            }
        }
        try? ctx.save()
    }

    /// Replace all VerseState rows with the current snapshot.
    private func persistAll() {
        guard let ctx = modelContext else { return }
        do {
            try ctx.delete(model: VerseState.self)
            for (key, card) in snapshot {
                ctx.insert(VerseState(
                    key: key, stability: card.stability,
                    difficulty: card.difficulty, lastReview: card.lastReview,
                    reps: card.reps
                ))
            }
            try ctx.save()
        } catch {
            // Best-effort — snapshot can always be rebuilt from revisions
        }
    }
}
