import SwiftUI
import SwiftData

/// Today's revision suggestions — 3 collapsible sections.
/// Port of `SuggestionsPanel.jsx`.
struct SuggestionsTab: View {
    let newEntries: [ClassifiedEntry]
    let surahSuggestions: [SurahSuggestion]
    let onLogRevision: (RevisionEntry) -> Void

    @Query private var revisions: [RevisionEntry]
    @Environment(QuranDataManager.self) private var quranData

    @State private var newSectionOpen = true
    @State private var oldSectionOpen = true
    @State private var comingSectionOpen = true
    @State private var openMenuKey: String?
    @State private var expandedSurahs = Set<Int>()

    // Filtered: new entries not revised today
    private var filteredNew: [ClassifiedEntry] {
        newEntries.filter { !ClassificationEngine.isRevisedToday(entry: $0.entry, revisions: revisions) }
    }

    private var dueSurahs: [SurahSuggestion] {
        surahSuggestions.filter(\.isDue)
    }

    private var allUpcoming: [VerseGroup] {
        surahSuggestions.flatMap(\.upcomingGroups).sorted { $0.minDueIn < $1.minDueIn }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 16) {
                    newMemorizationSection
                    oldMemorizationSection
                    comingUpSection
                }
                .padding()
            }
            .navigationTitle("Today's Review")
        }
    }

    // MARK: - New Memorization Section

    @ViewBuilder
    private var newMemorizationSection: some View {
        DisclosureGroup(isExpanded: $newSectionOpen) {
            if filteredNew.isEmpty {
                Label("All caught up!", systemImage: "checkmark.circle.fill")
                    .foregroundStyle(.green)
                    .padding(.vertical, 8)
            } else {
                let grouped = Dictionary(grouping: filteredNew, by: \.entry.startSurah)
                    .sorted { $0.key < $1.key }

                ForEach(grouped, id: \.key) { surahNum, entries in
                    VStack(alignment: .leading, spacing: 8) {
                        // Surah header with bulk log button
                        HStack {
                            Text(quranData.surahName(surahNum))
                                .font(.subheadline.bold())
                            Spacer()
                        }

                        ForEach(entries) { classified in
                            newEntryRow(classified)
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
        } label: {
            Label("New Memorization — \(filteredNew.count)", systemImage: "sparkles")
                .font(.headline)
        }
        .tint(.primary)
    }

    @ViewBuilder
    private func newEntryRow(_ classified: ClassifiedEntry) -> some View {
        let entry = classified.entry
        let key = "new-\(entry.id.uuidString)"

        VStack(alignment: .leading, spacing: 4) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(FormatHelpers.formatEntry(entry, quranData: quranData))
                        .font(.subheadline)
                    Text("Revision \(classified.revisionCount) of \(AppConstants.newPeriodRevisions)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Text("\(classified.revisionsRemaining) left")
                    .font(.caption2)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(.blue.opacity(0.15))
                    .clipShape(Capsule())
                Button(openMenuKey == key ? "Close" : "Log") {
                    openMenuKey = openMenuKey == key ? nil : key
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
            }

            if openMenuKey == key {
                InlineRevisionMenu(
                    startSurah: entry.startSurah,
                    startVerse: entry.startVerse,
                    endSurah: entry.endSurah,
                    endVerse: entry.endVerse,
                    onSubmit: { rev in
                        onLogRevision(rev)
                        openMenuKey = nil
                    },
                    onCancel: { openMenuKey = nil }
                )
            }
        }
    }

    // MARK: - Old Memorization (FSRS) Section

    @ViewBuilder
    private var oldMemorizationSection: some View {
        let totalDue = surahSuggestions.reduce(0) { $0 + $1.totalDueGroups }

        DisclosureGroup(isExpanded: $oldSectionOpen) {
            if dueSurahs.isEmpty {
                ContentUnavailableView(
                    "All caught up!",
                    systemImage: "checkmark.circle.fill",
                    description: Text("No revisions due right now")
                )
            } else {
                ForEach(dueSurahs) { surah in
                    surahSuggestionRow(surah)
                }
            }
        } label: {
            Label("Old Memorization — \(totalDue) due", systemImage: "brain")
                .font(.headline)
        }
        .tint(.primary)
    }

    @ViewBuilder
    private func surahSuggestionRow(_ surah: SurahSuggestion) -> some View {
        let isExpanded = expandedSurahs.contains(surah.surahNum)

        VStack(alignment: .leading, spacing: 4) {
            // Surah header
            Button {
                if isExpanded {
                    expandedSurahs.remove(surah.surahNum)
                } else {
                    expandedSurahs.insert(surah.surahNum)
                }
            } label: {
                HStack {
                    Image(systemName: isExpanded ? "chevron.down" : "chevron.right")
                        .font(.caption)
                    Text(quranData.surahName(surah.surahNum))
                        .font(.subheadline.bold())
                    Spacer()
                    Text("\(surah.totalDueGroups) due")
                        .font(.caption)
                        .foregroundStyle(.red)
                    Text("\(Int(surah.avgRetention * 100))%")
                        .font(.caption)
                        .foregroundStyle(retentionColor(surah.avgRetention))
                }
            }
            .buttonStyle(.plain)

            if isExpanded {
                // Due groups
                ForEach(surah.dueGroups) { group in
                    verseGroupRow(group, isDue: true)
                }

                // Upcoming groups (within this surah)
                if !surah.upcomingGroups.isEmpty {
                    Divider()
                    Text("Upcoming")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    ForEach(surah.upcomingGroups.prefix(3)) { group in
                        verseGroupRow(group, isDue: false)
                    }
                }
            }
        }
        .padding(.vertical, 4)
    }

    @ViewBuilder
    private func verseGroupRow(_ group: VerseGroup, isDue: Bool) -> some View {
        let key = "group-\(group.id)"

        VStack(alignment: .leading, spacing: 4) {
            HStack {
                // Page badge
                Text("P.\(group.pageNum)")
                    .font(.caption2).bold()
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(.indigo.opacity(0.15))
                    .clipShape(Capsule())

                VStack(alignment: .leading, spacing: 1) {
                    Text("Verses \(group.startVerse)–\(group.endVerse)")
                        .font(.subheadline)
                    HStack(spacing: 8) {
                        Text("\(Int(group.avgRetention * 100))%")
                            .foregroundStyle(retentionColor(group.avgRetention))
                        Text("\(group.avgReviews, specifier: "%.1f") rev")
                        if group.overdueDays > 0 {
                            Text("\(Int(group.overdueDays))d overdue")
                                .foregroundStyle(.red)
                        } else {
                            Text("in \(group.minDueIn, specifier: "%.1f")d")
                                .foregroundStyle(.secondary)
                        }
                    }
                    .font(.caption)
                }
                Spacer()

                if isDue {
                    Button(openMenuKey == key ? "Close" : "Log") {
                        openMenuKey = openMenuKey == key ? nil : key
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                }
            }

            if openMenuKey == key {
                InlineRevisionMenu(
                    startSurah: group.surahNum,
                    startVerse: String(group.startVerse),
                    endSurah: group.surahNum,
                    endVerse: String(group.endVerse),
                    onSubmit: { rev in
                        onLogRevision(rev)
                        openMenuKey = nil
                    },
                    onCancel: { openMenuKey = nil }
                )
            }
        }
    }

    // MARK: - Coming Up Section

    @ViewBuilder
    private var comingUpSection: some View {
        DisclosureGroup(isExpanded: $comingSectionOpen) {
            let upcoming = Array(allUpcoming.prefix(5))
            if upcoming.isEmpty {
                Text("No upcoming reviews")
                    .foregroundStyle(.secondary)
                    .padding(.vertical, 8)
            } else {
                ForEach(upcoming) { group in
                    HStack {
                        Text(quranData.surahName(group.surahNum))
                            .font(.subheadline)
                        Text("P.\(group.pageNum)")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                        Text("V.\(group.startVerse)–\(group.endVerse)")
                            .font(.caption)
                        Spacer()
                        Text("in \(group.minDueIn, specifier: "%.1f")d")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 2)
                }
            }
        } label: {
            Label("Coming Up", systemImage: "clock")
                .font(.headline)
        }
        .tint(.primary)
    }
}
