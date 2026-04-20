# iOS Port — SwiftUI Views

## 1. Root Structure

### QuranTrackerApp.swift

```swift
@main
struct QuranTrackerApp: App {
    let container: ModelContainer

    init() {
        let config = ModelConfiguration(
            cloudKitDatabase: .automatic
        )
        container = try! ModelContainer(
            for: MemorizationEntry.self, RevisionEntry.self,
            configurations: config
        )
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(QuranDataManager.shared)
                .environment(SnapshotManager(quranData: .shared))
        }
        .modelContainer(container)
    }
}
```

### ContentView.swift — Root TabView

```swift
struct ContentView: View {
    @State private var selectedTab = 0
    @Query private var revisions: [RevisionEntry]
    @Environment(SnapshotManager.self) private var snapshotManager

    // Computed due count for badge
    var dueCount: Int { /* computeDueCount(...) */ }

    var body: some View {
        TabView(selection: $selectedTab) {
            SuggestionsTab()
                .tabItem { Label("Suggestions", systemImage: "lightbulb.fill") }
                .badge(dueCount > 0 ? dueCount : 0)
                .tag(0)

            RevisionsTab()
                .tabItem { Label("Revisions", systemImage: "arrow.clockwise") }
                .tag(1)

            MemorizationsTab()
                .tabItem { Label("Memorize", systemImage: "book.fill") }
                .tag(2)

            StatsTab()
                .tabItem { Label("Stats", systemImage: "chart.bar.fill") }
                .tag(3)
        }
    }
}
```

**iOS-native advantage**: `TabView` with `.badge()` gives native badge support — no custom CSS needed.

## 2. Suggestions Tab

### SuggestionsTab.swift

The most complex view. Three collapsible sections in a `ScrollView` + `LazyVStack`.

```swift
struct SuggestionsTab: View {
    @Query(sort: \MemorizationEntry.createdAt, order: .reverse)
    private var entries: [MemorizationEntry]

    @Query private var revisions: [RevisionEntry]
    @Environment(SnapshotManager.self) private var snapshotManager
    @Environment(QuranDataManager.self) private var quranData

    // Derived data (computed properties or @State populated in .task)
    @State private var newEntries: [ClassifiedEntry] = []
    @State private var surahSuggestions: [SurahSuggestion] = []

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 16) {
                    NewMemorizationSection(
                        entries: newEntries.filter { !isRevisedToday($0, revisions) },
                        onLogRevision: handleQuickRevision
                    )
                    OldMemorizationSection(
                        suggestions: surahSuggestions,
                        onLogRevision: handleQuickRevision
                    )
                    ComingUpSection(suggestions: surahSuggestions)
                }
                .padding()
            }
            .navigationTitle("Today's Review")
            .task { recompute() }
            .onChange(of: entries) { recompute() }
            .onChange(of: revisions) { recompute() }
        }
    }
}
```

### NewMemorizationSection.swift

```
DisclosureGroup("New Memorization — \(entries.count) entries") {
    ForEach(groupedBySurah) { surahGroup in
        Section(header: surahName) {
            ForEach(surahGroup.entries) { entry in
                HStack {
                    VStack(alignment: .leading) {
                        Text(formatRange(entry))
                        Text("Revision \(entry.revisionCount) of 21")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button("Log Revision") { showInlineMenu = true }
                }
                if showInlineMenu {
                    InlineRevisionMenu(entry: entry, onSubmit: onLogRevision)
                }
            }
        }
    }
}
```

### OldMemorizationSection.swift

```
DisclosureGroup("Old Memorization (FSRS) — \(dueCount) due") {
    if dueSurahs.isEmpty {
        ContentUnavailableView("All caught up!",
            systemImage: "checkmark.circle.fill",
            description: Text("No revisions due right now"))
    } else {
        ForEach(surahSuggestions.filter(\.isDue)) { surah in
            DisclosureGroup {
                ForEach(surah.dueGroups) { group in
                    VerseGroupRow(group: group, surahName: ...)
                }
            } label: {
                SurahSuggestionHeader(surah: surah)
            }
        }
    }
}
```

### VerseGroupRow — Individual verse group display

```
HStack {
    // Page badge
    Text("P.\(group.pageNum)")
        .font(.caption2).bold()
        .padding(.horizontal, 6).padding(.vertical, 2)
        .background(.indigo.opacity(0.15))
        .clipShape(Capsule())

    VStack(alignment: .leading) {
        Text("Verses \(group.startVerse)–\(group.endVerse)")
        HStack(spacing: 8) {
            // Retention
            Text("\(Int(group.avgRetention * 100))%")
                .foregroundStyle(retentionColor(group.avgRetention))
            // Reviews
            Text("\(group.avgReviews, specifier: "%.1f") rev")
            // Overdue
            if group.overdueDays > 0 {
                Text("\(Int(group.overdueDays))d overdue")
                    .foregroundStyle(.red)
            }
        }
        .font(.caption)
    }
    Spacer()
    Button("Log") { showInlineMenu.toggle() }
}
```

Color coding:
- Never reviewed (reviewedVerses == 0): `.yellow`
- Overdue (isDue): `.red`  
- Upcoming (!isDue): `.green`

### InlineRevisionMenu.swift

Replaces the web's inline quality picker + optional date toggle:

```swift
struct InlineRevisionMenu: View {
    let entry: any HasRange   // protocol for startSurah/startVerse/endSurah/endVerse
    let onSubmit: (RevisionEntry) -> Void
    let onCancel: () -> Void

    @State private var quality = 3
    @State private var showDatePicker = false
    @State private var date = Date.now

    var body: some View {
        VStack(spacing: 8) {
            QualityPicker(quality: $quality)

            if showDatePicker {
                DatePicker("Date", selection: $date, displayedComponents: .date)
            }

            HStack {
                Button("Cancel") { onCancel() }
                Toggle("Custom date", isOn: $showDatePicker)
                    .toggleStyle(.switch).labelsHidden()
                Button("Submit") {
                    let rev = RevisionEntry(
                        startSurah: entry.startSurah,
                        startVerse: entry.startVerse,
                        endSurah: entry.endSurah,
                        endVerse: entry.endVerse,
                        quality: quality,
                        createdAt: showDatePicker ? date : .now
                    )
                    onSubmit(rev)
                }
                .buttonStyle(.borderedProminent)
            }
        }
        .padding()
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}
```

### ComingUpSection.swift

```
DisclosureGroup("Coming Up") {
    let upcoming = allUpcomingGroups.prefix(5)
    ForEach(upcoming) { group in
        HStack {
            Text(surahName(group.surahNum))
            Text("P.\(group.pageNum)").font(.caption2)
            Text("V.\(group.startVerse)–\(group.endVerse)")
            Spacer()
            Text("in \(group.minDueIn, specifier: "%.1f")d")
                .foregroundStyle(.secondary)
        }
    }
}
```

## 3. Revisions Tab

### RevisionsTab.swift

```swift
struct RevisionsTab: View {
    @State private var editingRevision: RevisionEntry?
    @State private var showForm = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    RevisionForm(
                        editing: editingRevision,
                        onSubmit: handleSubmit,
                        onCancel: { editingRevision = nil }
                    )
                    RevisionLog(
                        onEdit: { editingRevision = $0 },
                        onDelete: handleDelete
                    )
                }
                .padding()
            }
            .navigationTitle("Revisions")
        }
    }
}
```

### RevisionForm.swift

```
Form-like VStack:
    SurahVersePicker(
        startSurah, startVerse, endSurah, endVerse,
        availableSurahs: memorizedSurahs   // only surahs with memorized content
    )
    QualityPicker(quality: $quality)       // 5 chip buttons
    DatePicker("Date", selection: $date, displayedComponents: .date)
    HStack { cancelButton, submitButton }
```

### RevisionLog.swift

```swift
struct RevisionLog: View {
    @Query(sort: \RevisionEntry.updatedAt, order: .reverse)
    private var revisions: [RevisionEntry]

    @State private var showFilters = false
    @State private var filterSurah: Int? = nil
    @State private var filterQuality: Int? = nil
    @State private var filterDateFrom: Date? = nil
    @State private var filterDateTo: Date? = nil
    @State private var visibleCount = 5

    var filteredRevisions: [RevisionEntry] {
        revisions.filter { rev in
            if let s = filterSurah, rev.startSurah != s && rev.endSurah != s { return false }
            if let q = filterQuality, rev.quality != q { return false }
            if let from = filterDateFrom, rev.createdAt < from { return false }
            if let to = filterDateTo, rev.createdAt > Calendar.current.date(byAdding: .day, value: 1, to: to)! { return false }
            return true
        }
    }

    var body: some View {
        // Filter toggle button with active indicator dot
        // Collapsible filter panel (RevisionFilters)
        // LazyVStack of revision rows (paginated with "Show more")
        // Swipe actions for Edit/Delete
    }
}
```

### RevisionFilters.swift

```
VStack:
    Picker("Surah", selection: $filterSurah) { surahList }
    Picker("Quality", selection: $filterQuality) { 1...5 labels }
    DatePicker("From", selection: $filterDateFrom)
    DatePicker("To", selection: $filterDateTo)
    Button("Clear Filters") { resetAll() }
```

## 4. Memorizations Tab

### MemorizationsTab.swift

```
NavigationStack {
    ScrollView {
        MemorizationForm(editing: editingEntry, onSubmit: ..., onCancel: ...)
        MemorizedSections(onEdit: ..., onDelete: ...)
    }
    .navigationTitle("Memorizations")
}
```

### MemorizationForm.swift

```
SurahVersePicker(
    availableSurahs: surahs.filter { !fullyMemorized.contains($0.num) }
)
DatePicker("Date", selection: $date, displayedComponents: .date)
HStack { cancelButton, submitButton }
```

### MemorizedSections.swift

Two `DisclosureGroup`s: "New Memorization" and "Old Memorization"

```
ForEach(entries) { entry in
    HStack {
        VStack(alignment: .leading) {
            Text(formatRange(entry))
            Text(entry.createdAt, style: .date).font(.caption)
        }
        Spacer()
        if entry.isNew {
            Text("\(entry.revisionsRemaining) rev left")
                .font(.caption2).padding(4)
                .background(.blue.opacity(0.15))
                .clipShape(Capsule())
        }
        if entry.isMerged {
            Text("merged from \(entry.sourceCount)")
                .font(.caption2).foregroundStyle(.secondary)
        }
    }
    .swipeActions {
        Button("Delete", role: .destructive) { onDelete(entry) }
        Button("Edit") { onEdit(entry) }
    }
}
```

## 5. Stats Tab

### StatsTab.swift

```swift
struct StatsTab: View {
    @Query private var entries: [MemorizationEntry]
    @Query private var revisions: [RevisionEntry]
    @Environment(QuranDataManager.self) private var quranData
    @Environment(SnapshotManager.self) private var snapshotManager

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    ProgressOverview(entries: entries)
                    StatisticsGrid(revisions: revisions)
                    CalendarHeatmap(revisions: revisions)
                }
                .padding()
            }
            .navigationTitle("Statistics")
        }
    }
}
```

### ProgressOverview.swift

```
VStack(alignment: .leading) {
    // Total progress
    let versesMemorized = computeUniqueVerses(entries)
    Text("\(versesMemorized) / 6,236 verses")
    ProgressView(value: Double(versesMemorized), total: 6236)
    Text("\(percentage, specifier: "%.1f")%")

    // Expandable surah breakdown
    DisclosureGroup("Surah Breakdown") {
        ForEach(surahsWithProgress) { surah in
            HStack {
                Text(surah.name)
                Spacer()
                Text("\(surah.memorized)/\(surah.total)")
                ProgressView(value: Double(surah.memorized), total: Double(surah.total))
                    .frame(width: 60)
            }
        }
    }
}
```

### StatisticsGrid.swift

```
LazyVGrid(columns: [.init(.flexible()), .init(.flexible())], spacing: 12) {
    StatCard(title: "Total Revisions", value: "\(revisions.count)")
    StatCard(title: "Today", value: "\(todayCount)")
    StatCard(title: "This Week", value: "\(weekCount)")
    StatCard(title: "This Month", value: "\(monthCount)")
    StatCard(title: "Avg Quality", value: String(format: "%.1f", avgQuality))
    StatCard(title: "Current Streak", value: "\(currentStreak)d")
    StatCard(title: "Best Streak", value: "\(bestStreak)d")
}
```

Streak computation: port of `computeStreak()` from `StatsPanel.jsx`:
```
1. Collect unique revision dates into a Set<String> (YYYY-MM-DD)
2. Sort descending
3. Starting from today (or yesterday if no revision today):
   count consecutive days backward
4. Best streak: scan all dates, track longest consecutive run
```

### CalendarHeatmap.swift

Port of the SVG-based `CalendarHeatmap` from `StatsPanel.jsx`. Use SwiftUI `Canvas` or a `Grid` of colored rectangles.

```swift
struct CalendarHeatmap: View {
    let revisions: [RevisionEntry]

    // 13 weeks × 7 days = 91 cells
    private let weeks = 13
    private let cellSize: CGFloat = 14
    private let cellSpacing: CGFloat = 3

    var body: some View {
        VStack(alignment: .leading) {
            Text("Activity").font(.headline)

            // Month labels row
            HStack(spacing: ...) { monthLabels }

            // Grid: 7 rows (Mon-Sun) × 13 columns (weeks)
            HStack(alignment: .top, spacing: cellSpacing) {
                // Day labels (M, W, F)
                VStack(spacing: cellSpacing) {
                    ForEach(0..<7) { day in
                        Text(dayLabel(day)).font(.system(size: 9))
                            .frame(width: cellSize, height: cellSize)
                    }
                }

                // Week columns
                ForEach(0..<weeks) { week in
                    VStack(spacing: cellSpacing) {
                        ForEach(0..<7) { day in
                            let date = dateFor(week: week, day: day)
                            let count = revisionsByDay[DateHelpers.dateString(date)] ?? 0
                            Rectangle()
                                .fill(heatmapColor(count: count, isFuture: date > .now))
                                .frame(width: cellSize, height: cellSize)
                                .clipShape(RoundedRectangle(cornerRadius: 2))
                                .help("\(DateHelpers.dateString(date)): \(count) revisions")
                        }
                    }
                }
            }
        }
    }

    func heatmapColor(count: Int, isFuture: Bool) -> Color {
        if isFuture { return Color(.systemGray5) }
        switch count {
        case 0: return Color(.systemGray6)
        case 1...2: return .green.opacity(0.3)
        case 3...5: return .green.opacity(0.6)
        default: return .green
        }
    }
}
```

## 6. Shared Components

### SurahVersePicker.swift

Port of `SurahVerseFields.jsx`. Shared between memorization and revision forms.

```swift
struct SurahVersePicker: View {
    @Binding var startSurah: Int?
    @Binding var startVerse: String
    @Binding var endSurah: Int?
    @Binding var endVerse: String
    let availableSurahs: [SurahInfo]
    let quranData: QuranDataManager

    var body: some View {
        VStack {
            HStack {
                Picker("Start Surah", selection: $startSurah) {
                    Text("Select...").tag(nil as Int?)
                    ForEach(availableSurahs) { s in
                        Text("\(s.num). \(s.name)").tag(s.num as Int?)
                    }
                }
                TextField("Verse", text: $startVerse)
                    .keyboardType(.decimalPad)
                    .frame(width: 60)
                if let s = startSurah {
                    Text("/ \(quranData.maxVerses(forSurah: s))")
                        .foregroundStyle(.secondary)
                }
            }
            HStack {
                Picker("End Surah", selection: $endSurah) { /* same */ }
                TextField("Verse", text: $endVerse)
                    .keyboardType(.decimalPad)
                    .frame(width: 60)
                if let s = endSurah {
                    Text("/ \(quranData.maxVerses(forSurah: s))")
                        .foregroundStyle(.secondary)
                }
            }
        }
        .onChange(of: startSurah) { _, new in
            startVerse = "1"
            if endSurah == nil { endSurah = new }
        }
        .onChange(of: endSurah) { _, new in
            if let s = new { endVerse = "\(quranData.maxVerses(forSurah: s))" }
        }
    }
}
```

### QualityPicker.swift

```swift
struct QualityPicker: View {
    @Binding var quality: Int

    private let labels = [
        (1, "Poor"), (2, "Weak"), (3, "Okay"), (4, "Good"), (5, "Solid")
    ]

    var body: some View {
        HStack(spacing: 8) {
            ForEach(labels, id: \.0) { (value, label) in
                Button {
                    quality = value
                } label: {
                    Text(label)
                        .font(.caption)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(quality == value ? qualityColor(value) : Color(.systemGray6))
                        .foregroundStyle(quality == value ? .white : .primary)
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
            }
        }
    }
}
```

### CollapsibleSection.swift

Wrapper around `DisclosureGroup` with consistent styling and optional entry count badge.

### DataManagementView.swift

Port of web app's data management controls. Placed in a settings/gear menu or at bottom of a tab.

```
List {
    Button("Export Data") { exportData() }
        .sheet(isPresented: ...) { ShareLink(item: exportURL) }

    Button("Import Data") { showImporter = true }
        .fileImporter(isPresented: $showImporter, allowedContentTypes: [.json]) { ... }

    Button("Load Test Data") { loadTestData() }

    Button("Clear All Data", role: .destructive) { showClearConfirmation = true }
        .confirmationDialog("Clear all data?", ...) { ... }
}
```

**iOS-native advantages over web:**
- `ShareLink` for export (AirDrop, Files, etc.)
- `fileImporter` for import (Files app integration)
- `confirmationDialog` for destructive actions
