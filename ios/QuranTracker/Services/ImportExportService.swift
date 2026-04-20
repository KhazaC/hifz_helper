import Foundation
import SwiftData

/// Handles JSON import/export compatible with the web app.
enum ImportExportService {

    // MARK: - Export

    /// Export all data to a JSON backup compatible with the web app format.
    static func exportBackup(
        memorization: [MemorizationEntry],
        revisions: [RevisionEntry],
        snapshot: [String: CardState]
    ) throws -> Data {
        let memDTOs = memorization.map { e in
            MemorizationEntryDTO(
                id: e.id.uuidString,
                startSurah: .int(e.startSurah),
                startVerse: e.startVerse,
                endSurah: .int(e.endSurah),
                endVerse: e.endVerse,
                createdAt: DateHelpers.toISO(e.createdAt),
                updatedAt: DateHelpers.toISO(e.updatedAt)
            )
        }

        let revDTOs = revisions.map { r in
            RevisionEntryDTO(
                id: r.id.uuidString,
                startSurah: .int(r.startSurah),
                startVerse: r.startVerse,
                endSurah: .int(r.endSurah),
                endVerse: r.endVerse,
                quality: r.quality,
                createdAt: DateHelpers.toISO(r.createdAt),
                updatedAt: DateHelpers.toISO(r.updatedAt)
            )
        }

        let cardDTOs = snapshot.mapValues { card in
            CardStateDTO(
                stability: card.stability,
                difficulty: card.difficulty,
                lastReview: DateHelpers.toISO(card.lastReview),
                reps: card.reps
            )
        }

        let backup = BackupFile(
            memorizationEntries: memDTOs,
            revisionEntries: revDTOs,
            verseFsrsState: cardDTOs,
            exportedAt: DateHelpers.toISO(Date()),
            schemaVersion: AppConstants.schemaVersion
        )

        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return try encoder.encode(backup)
    }

    // MARK: - Import

    /// Parse a JSON backup file and return domain objects.
    static func parseBackup(_ data: Data) throws -> ImportedData {
        let decoder = JSONDecoder()
        let backup = try decoder.decode(BackupFile.self, from: data)

        let memorization = backup.memorizationEntries.map { dto in
            let entry = MemorizationEntry(
                startSurah: dto.startSurah.intValue,
                startVerse: dto.startVerse,
                endSurah: dto.endSurah.intValue,
                endVerse: dto.endVerse,
                createdAt: DateHelpers.parseISO(dto.createdAt) ?? Date(),
                updatedAt: DateHelpers.parseISO(dto.updatedAt) ?? Date()
            )
            // Preserve original UUID if valid
            if let uuid = UUID(uuidString: dto.id) {
                entry.id = uuid
            }
            return entry
        }

        let revisions = backup.revisionEntries.map { dto in
            let rev = RevisionEntry(
                startSurah: dto.startSurah.intValue,
                startVerse: dto.startVerse,
                endSurah: dto.endSurah.intValue,
                endVerse: dto.endVerse,
                quality: dto.quality,
                createdAt: DateHelpers.parseISO(dto.createdAt) ?? Date(),
                updatedAt: DateHelpers.parseISO(dto.updatedAt) ?? Date()
            )
            if let uuid = UUID(uuidString: dto.id) {
                rev.id = uuid
            }
            return rev
        }

        // Rebuild snapshot from card DTOs if available
        var snapshot: [String: CardState] = [:]
        if let cards = backup.verseFsrsState {
            for (key, dto) in cards {
                snapshot[key] = CardState(
                    stability: dto.stability,
                    difficulty: dto.difficulty,
                    lastReview: DateHelpers.parseISO(dto.lastReview) ?? Date(),
                    reps: dto.reps
                )
            }
        }

        return ImportedData(
            memorization: memorization,
            revisions: revisions,
            snapshot: snapshot
        )
    }
}

struct ImportedData {
    let memorization: [MemorizationEntry]
    let revisions: [RevisionEntry]
    let snapshot: [String: CardState]
}
