import SwiftUI
import SwiftData

struct ContentView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.scenePhase) private var scenePhase
    @Query(sort: \MemorizationEntry.createdAt) private var memorization: [MemorizationEntry]
    @Query(sort: \RevisionEntry.createdAt) private var revisions: [RevisionEntry]

    @State private var quranData = QuranDataManager.shared
    @State private var snapshotManager = SnapshotManager()
    @State private var notificationService = NotificationService.shared
    @State private var loadError: String?
    @State private var selectedTab = 0

    @AppStorage("notificationsEnabled") private var notificationsEnabled = true
    @AppStorage("dailyReminderHour") private var dailyReminderHour = 8
    @AppStorage("dailyReminderMinute") private var dailyReminderMinute = 0
    @AppStorage("streakRemindersEnabled") private var streakRemindersEnabled = true

    // Derived data
    @State private var newEntries: [ClassifiedEntry] = []
    @State private var oldEntries: [MemorizationEntry] = []
    @State private var mergedOldEntries: [MergedPageEntry] = []
    @State private var surahSuggestions: [SurahSuggestion] = []
    @State private var dueCount = 0

    var body: some View {
        TabView(selection: $selectedTab) {
            SuggestionsTab(
                newEntries: newEntries,
                surahSuggestions: surahSuggestions,
                onLogRevision: handleQuickRevision
            )
            .tabItem { Label("Suggestions", systemImage: "lightbulb.fill") }
            .badge(dueCount)
            .tag(0)

            RevisionsTab(onSnapshotChanged: recompute)
                .tabItem { Label("Revisions", systemImage: "arrow.clockwise") }
                .tag(1)

            MemorizationsTab(
                newEntries: newEntries,
                mergedOldEntries: mergedOldEntries,
                onChanged: recompute
            )
            .tabItem { Label("Memorize", systemImage: "book.fill") }
            .tag(2)

            StatsTab()
                .tabItem { Label("Stats", systemImage: "chart.bar.fill") }
                .tag(3)

            SettingsTab()
                .tabItem { Label("Settings", systemImage: "gear") }
                .tag(4)
        }
        .environment(quranData)
        .environment(snapshotManager)
        .environment(notificationService)
        .task {
            do {
                try quranData.load()
                snapshotManager.setModelContext(modelContext)
                // Load persisted snapshot from SwiftData.
                // Only rebuild from revisions if no stored snapshot exists.
                if !snapshotManager.loadFromStore() {
                    snapshotManager.rebuild(from: revisions)
                }
                recompute()
                await notificationService.checkPermission()
                refreshNotifications()
            } catch {
                loadError = error.localizedDescription
            }
        }
        .onChange(of: memorization.count) { recompute() }
        .onChange(of: revisions.count) { recompute() }
        .onChange(of: scenePhase) { _, phase in
            switch phase {
            case .active:
                recompute()
                refreshNotifications()
            case .background:
                notificationService.updateBadge(dueCount)
            default:
                break
            }
        }
        .alert("Error", isPresented: .constant(loadError != nil)) {
            Button("OK") { loadError = nil }
        } message: {
            Text(loadError ?? "")
        }
    }

    // MARK: - Handlers

    private func handleQuickRevision(_ rev: RevisionEntry) {
        modelContext.insert(rev)
        snapshotManager.applyRevision(rev)
        recompute()
        // Cancel streak reminder since user revised today
        notificationService.cancelStreakReminder()
    }

    private func recompute() {
        guard quranData.isLoaded else { return }

        let classified = ClassificationEngine.classify(
            entries: memorization, snapshot: snapshotManager.snapshot, quranData: quranData
        )
        newEntries = classified.new
        oldEntries = classified.old

        let resolved = PageMerger.resolvePartialVerses(oldEntries)
        mergedOldEntries = PageMerger.mergeByPage(resolved, quranData: quranData, pageMap: quranData.pageMap)

        surahSuggestions = SuggestionEngine.computeSurahSuggestions(
            oldEntries: resolved,
            snapshot: snapshotManager.snapshot,
            quranData: quranData,
            pageMap: quranData.pageMap
        )

        dueCount = ClassificationEngine.dueCount(
            newEntries: newEntries,
            surahSuggestions: surahSuggestions,
            revisions: revisions
        )
    }

    private func refreshNotifications() {
        let hasRevisedToday = revisions.contains {
            DateHelpers.isSameDay($0.createdAt, Date())
        }
        let currentStreak = computeCurrentStreak()

        notificationService.refresh(
            dueCount: dueCount,
            currentStreak: currentStreak,
            hasRevisedToday: hasRevisedToday,
            notificationsEnabled: notificationsEnabled,
            streakRemindersEnabled: streakRemindersEnabled,
            reminderHour: dailyReminderHour,
            reminderMinute: dailyReminderMinute
        )
    }

    private func computeCurrentStreak() -> Int {
        var dates = Set<String>()
        for r in revisions { dates.insert(DateHelpers.dateString(r.createdAt)) }
        guard !dates.isEmpty else { return 0 }

        let cal = Calendar.current
        var checkDate = DateHelpers.dateString()
        if !dates.contains(checkDate) {
            let yesterday = cal.date(byAdding: .day, value: -1, to: Date())!
            checkDate = DateHelpers.dateString(yesterday)
        }

        var streak = 0
        var d = DateHelpers.parseISO(checkDate + "T00:00:00Z") ?? Date()
        while dates.contains(DateHelpers.dateString(d)) {
            streak += 1
            d = cal.date(byAdding: .day, value: -1, to: d)!
        }
        return streak
    }
}
