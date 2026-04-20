# iOS Port — Persistence, iCloud Sync & Import/Export

## 1. SwiftData Configuration

### 1.1 Model Container Setup

```swift
// QuranTrackerApp.swift
let schema = Schema([MemorizationEntry.self, RevisionEntry.self])
let config = ModelConfiguration(
    "QuranTracker",
    schema: schema,
    cloudKitDatabase: .automatic    // Enables iCloud sync
)
let container = try ModelContainer(for: schema, configurations: [config])
```

**Requirements for iCloud:**
- Enable "CloudKit" capability in Xcode
- Enable "iCloud" capability with CloudKit container
- Container name: `iCloud.com.yourname.QuranTracker`
- Enable "Background Modes" → "Remote notifications" (for silent push sync)

### 1.2 Autosave Behavior

SwiftData autosaves on:
- App going to background
- Periodic timer (system-managed)
- Explicitly calling `modelContext.save()`

No manual debounce needed (unlike the web app's 300ms localStorage debounce). SwiftData handles this natively.

### 1.3 Crash Safety

SwiftData/Core Data provides transactional writes by default. If the app crashes mid-write, the database remains consistent (previous committed state). This is stronger than the web app's localStorage approach.

## 2. iCloud Sync

### 2.1 How It Works

When `cloudKitDatabase: .automatic` is set:
1. SwiftData wraps Core Data's `NSPersistentCloudKitContainer`
2. All `@Model` objects are automatically synced to the user's private CloudKit database
3. Changes push via silent notifications (< 30 second delay typical)
4. On launch, pending changes are pulled from CloudKit

### 2.2 Sync-Aware Snapshot Rebuilding

The verse FSRS snapshot is **not synced** — it's derived data rebuilt locally. When iCloud delivers new revisions from another device, the snapshot must be rebuilt.

```swift
// In SnapshotManager
func observeRemoteChanges(container: ModelContainer) {
    NotificationCenter.default.addObserver(
        forName: .NSPersistentStoreRemoteChange,
        object: container.configurations.first,
        queue: .main
    ) { [weak self] _ in
        // Rebuild snapshot from all revisions
        Task { @MainActor in
            self?.rebuildFromAllRevisions()
        }
    }
}
```

### 2.3 Conflict Resolution

CloudKit uses **last-writer-wins** per record. Since each MemorizationEntry and RevisionEntry has a unique UUID, conflicts only occur if the same record is edited on two devices simultaneously. This is acceptable because:
- Entries are rarely edited (usually just added or deleted)
- The snapshot is always rebuilt from the full revision set, so any conflict in individual records self-heals

### 2.4 Offline Support

SwiftData/CloudKit works fully offline:
- All reads/writes go to the local SQLite database
- Changes queue up and sync when connectivity returns
- No special offline handling needed in app code

### 2.5 First-Launch iCloud Migration

If a user has existing data on another device:
1. On first launch, SwiftData pulls all records from CloudKit
2. `NSPersistentStoreRemoteChange` fires
3. `SnapshotManager` rebuilds the snapshot from all synced revisions

No explicit migration code needed — SwiftData handles initial sync automatically.

## 3. Schema Migration

### 3.1 SwiftData Schema Versioning

```swift
enum QuranTrackerSchemaV1: VersionedSchema {
    static var versionIdentifier = Schema.Version(1, 0, 0)
    static var models: [any PersistentModel.Type] = [
        MemorizationEntry.self,
        RevisionEntry.self,
    ]
}

// Future: When schema changes are needed
enum QuranTrackerSchemaV2: VersionedSchema {
    static var versionIdentifier = Schema.Version(2, 0, 0)
    static var models: [any PersistentModel.Type] = [ ... ]
}

enum QuranTrackerMigrationPlan: SchemaMigrationPlan {
    static var schemas: [any VersionedSchema.Type] = [
        QuranTrackerSchemaV1.self,
        // QuranTrackerSchemaV2.self,  // Add when needed
    ]
    static var stages: [MigrationStage] = [
        // .lightweight(fromVersion: ..., toVersion: ...)
    ]
}
```

### 3.2 Web App Schema Compatibility

The web app is at schema version 2. The iOS app starts fresh with SwiftData (no schema version number needed internally). Schema compatibility only matters for import/export, handled by DTOs.

## 4. Import/Export Service

### 4.1 Export

```swift
class ImportExportService {
    let modelContext: ModelContext
    let snapshotManager: SnapshotManager

    /// Export all data as JSON matching web app format
    func exportData() throws -> Data {
        let entries = try modelContext.fetch(FetchDescriptor<MemorizationEntry>())
        let revisions = try modelContext.fetch(FetchDescriptor<RevisionEntry>())

        let backup = BackupFile(
            memorization_entries: entries.map { $0.toDTO() },
            revision_entries: revisions.map { $0.toDTO() },
            verse_fsrs_state: snapshotManager.snapshot.mapValues { $0.toDTO() },
            exportedAt: ISO8601DateFormatter().string(from: .now),
            schemaVersion: 2
        )

        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return try encoder.encode(backup)
    }

    /// Export and present share sheet
    func exportAndShare() throws -> URL {
        let data = try exportData()
        let dateStr = DateHelpers.dateString(.now)
        let filename = "quran-tracker-backup-\(dateStr).json"
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(filename)
        try data.write(to: url)
        return url
    }
}
```

### 4.2 Import

```swift
extension ImportExportService {
    /// Import data from JSON file, replacing all current data
    func importData(from url: URL) throws -> (entryCount: Int, revisionCount: Int) {
        let data = try Data(contentsOf: url)
        let backup = try JSONDecoder().decode(BackupFile.self, from: data)

        // Validate
        guard !backup.memorization_entries.isEmpty || !backup.revision_entries.isEmpty else {
            throw ImportError.emptyData
        }

        let entryCount = backup.memorization_entries.count
        let revisionCount = backup.revision_entries.count

        return (entryCount, revisionCount)
    }

    /// Actually replace data after user confirms
    func confirmImport(from url: URL) throws {
        let data = try Data(contentsOf: url)
        let backup = try JSONDecoder().decode(BackupFile.self, from: data)

        // Delete all existing data
        try modelContext.delete(model: MemorizationEntry.self)
        try modelContext.delete(model: RevisionEntry.self)

        // Insert imported entries
        for dto in backup.memorization_entries {
            modelContext.insert(dto.toModel())
        }
        for dto in backup.revision_entries {
            modelContext.insert(dto.toModel())
        }

        try modelContext.save()

        // Rebuild snapshot
        if let verseState = backup.verse_fsrs_state {
            snapshotManager.loadFromDTOs(verseState)
        } else {
            let revisions = try modelContext.fetch(FetchDescriptor<RevisionEntry>())
            snapshotManager.rebuildFromRevisions(revisions)
        }
    }
}
```

### 4.3 DTO ↔ Model Conversions

```swift
extension MemorizationEntry {
    func toDTO() -> MemorizationEntryDTO {
        MemorizationEntryDTO(
            id: id.uuidString,
            startSurah: .int(startSurah),
            startVerse: startVerse,
            endSurah: .int(endSurah),
            endVerse: endVerse,
            createdAt: ISO8601DateFormatter().string(from: createdAt),
            updatedAt: ISO8601DateFormatter().string(from: updatedAt)
        )
    }
}

extension MemorizationEntryDTO {
    func toModel() -> MemorizationEntry {
        let entry = MemorizationEntry(
            startSurah: startSurah.intValue,
            startVerse: startVerse,
            endSurah: endSurah.intValue,
            endVerse: endVerse,
            createdAt: ISO8601DateFormatter().date(from: createdAt) ?? .now,
            updatedAt: ISO8601DateFormatter().date(from: updatedAt) ?? .now
        )
        if let uuid = UUID(uuidString: id) {
            entry.id = uuid
        }
        return entry
    }
}
```

### 4.4 Web ↔ iOS Date Format Handling

The web app stores dates as ISO 8601 strings created via `new Date(dateStr + 'T00:00:00').toISOString()`. This means:
- Web dates are local midnight converted to UTC
- e.g., "2026-04-19T00:00:00" in UTC-5 → "2026-04-19T05:00:00.000Z"

The iOS app uses native `Date` objects internally. During import/export:
- Import: `ISO8601DateFormatter().date(from: isoString)` correctly parses UTC
- Export: `ISO8601DateFormatter().string(from: date)` outputs UTC

This ensures round-trip compatibility.

## 5. Test Data Loading

```swift
extension ImportExportService {
    /// Load bundled test data (development aid)
    func loadTestData() throws {
        guard let url = Bundle.main.url(forResource: "test_data", withExtension: "json") else {
            throw ImportError.testDataNotFound
        }
        try confirmImport(from: url)
    }
}
```

Bundle `test_data.json` from `public/data/test_data.json` into the app resources (debug builds only, using build configuration).

## 6. Storage Summary

| Data | Web App | iOS App |
|---|---|---|
| Memorization entries | localStorage JSON | SwiftData `@Model` + iCloud |
| Revision entries | localStorage JSON | SwiftData `@Model` + iCloud |
| FSRS verse snapshot | localStorage JSON | In-memory `[String: CardState]` |
| Static Quran data | Fetched JSON files | Bundled in app resources |
| Schema version | localStorage number | SwiftData `VersionedSchema` |
| Write strategy | 300ms debounce | SwiftData autosave |
| Crash safety | JSON parse fallbacks | Core Data transactions |
