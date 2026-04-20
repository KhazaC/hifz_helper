import SwiftUI
import SwiftData

@main
struct QuranTrackerApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .modelContainer(for: [MemorizationEntry.self, RevisionEntry.self, VerseState.self])
    }
}
