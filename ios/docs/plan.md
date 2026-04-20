# iOS Port Plan — Quran Memorization Tracker

## Decisions
- SwiftUI, iOS 17+, SwiftData
- iCloud sync via CloudKit (SwiftData + NSPersistentCloudKitContainer)
- Local notifications for due revisions
- JSON import/export compatible with web app
- Project location: `quran-tracker-simple/ios/`
- Widgets: planned for later phase

## Deliverables
7 markdown plan documents to be created at `ios-plan/` in the repo root:
1. `00-OVERVIEW.md` — Architecture, tech stack, project structure
2. `01-DATA-MODELS.md` — SwiftData @Model classes, Codable DTOs, JSON mapping
3. `02-FSRS-ENGINE.md` — FSRS v4 port to Swift (pure functions, unit-testable)
4. `03-BUSINESS-LOGIC.md` — Classification, page merging, suggestions, overlap checks
5. `04-UI-VIEWS.md` — SwiftUI view hierarchy, all 4 tabs, components
6. `05-PERSISTENCE-SYNC.md` — SwiftData config, iCloud, import/export, migration
7. `06-NOTIFICATIONS-AND-WIDGETS.md` — Local notifications, future widget plan
8. `07-IMPLEMENTATION-PHASES.md` — Phased delivery, dependencies, verification

## Status: READY FOR REVIEW
