import SwiftUI
import SwiftData

/// Statistics and progress overview.
/// Port of `StatsPanel.jsx`.
struct StatsTab: View {
    @Query private var entries: [MemorizationEntry]
    @Query private var revisions: [RevisionEntry]
    @Environment(QuranDataManager.self) private var quranData

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    progressOverview
                    statisticsGrid
                    calendarHeatmap
                }
                .padding()
            }
            .navigationTitle("Statistics")
        }
    }

    // MARK: - Progress

    private var uniqueVerses: Set<String> {
        var set = Set<String>()
        for e in entries {
            let verses = quranData.versesInRange(
                startSurah: e.startSurah, startVerse: e.startVerse,
                endSurah: e.endSurah, endVerse: e.endVerse
            )
            for v in verses {
                set.insert("\(v.surahNum):\(v.verseNum)")
            }
        }
        return set
    }

    @ViewBuilder
    private var progressOverview: some View {
        let memorized = uniqueVerses.count
        let total = 6236
        let pct = total > 0 ? Double(memorized) / Double(total) * 100 : 0

        VStack(alignment: .leading, spacing: 8) {
            Text("Progress")
                .font(.headline)

            ProgressView(value: Double(memorized), total: Double(total))
                .tint(.green)

            HStack {
                Text("\(memorized) / \(total) verses")
                Spacer()
                Text("\(pct, specifier: "%.1f")%")
                    .foregroundStyle(.secondary)
            }
            .font(.subheadline)

            surahBreakdown
        }
        .padding()
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    @ViewBuilder
    private var surahBreakdown: some View {
        let uv = uniqueVerses
        let surahProgress = quranData.surahs.compactMap { surah -> (SurahInfo, Int)? in
            let count = (1...surah.numVerses).filter { uv.contains("\(surah.num):\($0)") }.count
            return count > 0 ? (surah, count) : nil
        }.sorted { $0.1 > $1.1 }

        if !surahProgress.isEmpty {
            DisclosureGroup("Surah Breakdown (\(surahProgress.count))") {
                ForEach(surahProgress, id: \.0.num) { surah, count in
                    HStack {
                        Text("\(surah.num). \(surah.name)")
                            .font(.caption)
                        Spacer()
                        Text("\(count)/\(surah.numVerses)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        ProgressView(value: Double(count), total: Double(surah.numVerses))
                            .frame(width: 50)
                            .tint(.green)
                    }
                }
            }
        }
    }

    // MARK: - Statistics Grid

    @ViewBuilder
    private var statisticsGrid: some View {
        let stats = computeStats()

        VStack(alignment: .leading, spacing: 8) {
            Text("Statistics")
                .font(.headline)

            LazyVGrid(columns: [.init(.flexible()), .init(.flexible())], spacing: 12) {
                statCard("Total Revisions", "\(stats.total)")
                statCard("Today", "\(stats.today)")
                statCard("This Week", "\(stats.week)")
                statCard("This Month", "\(stats.month)")
                statCard("Avg Quality", String(format: "%.1f", stats.avgQuality))
                statCard("Current Streak", "\(stats.currentStreak)d")
                statCard("Best Streak", "\(stats.bestStreak)d")
            }
        }
    }

    @ViewBuilder
    private func statCard(_ title: String, _ value: String) -> some View {
        VStack(spacing: 4) {
            Text(value)
                .font(.title2.bold())
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(Color.gray.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    // MARK: - Calendar Heatmap

    private let weeks = 13
    private let cellSize: CGFloat = 14
    private let cellSpacing: CGFloat = 3

    @ViewBuilder
    private var calendarHeatmap: some View {
        let byDay = revisionsByDay()

        VStack(alignment: .leading, spacing: 8) {
            Text("Activity")
                .font(.headline)

            HStack(alignment: .top, spacing: cellSpacing) {
                // Day labels
                VStack(spacing: cellSpacing) {
                    ForEach(0..<7, id: \.self) { day in
                        Text(dayLabel(day))
                            .font(.system(size: 9))
                            .frame(width: cellSize, height: cellSize)
                    }
                }

                // Week columns
                ForEach(0..<weeks, id: \.self) { week in
                    VStack(spacing: cellSpacing) {
                        ForEach(0..<7, id: \.self) { day in
                            let d = dateFor(week: week, day: day)
                            let count = byDay[DateHelpers.dateString(d)] ?? 0
                            Rectangle()
                                .fill(heatmapColor(count: count, isFuture: d > Date()))
                                .frame(width: cellSize, height: cellSize)
                                .clipShape(RoundedRectangle(cornerRadius: 2))
                        }
                    }
                }
            }
        }
        .padding()
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Computation Helpers

    private struct Stats {
        let total: Int
        let today: Int
        let week: Int
        let month: Int
        let avgQuality: Double
        let currentStreak: Int
        let bestStreak: Int
    }

    private func computeStats() -> Stats {
        let now = Date()
        let todayStr = DateHelpers.dateString(now)
        let cal = Calendar.current

        let weekAgo = cal.date(byAdding: .day, value: -7, to: now)!
        let monthAgo = cal.date(byAdding: .month, value: -1, to: now)!

        let total = revisions.count
        let today = revisions.filter { DateHelpers.dateString($0.createdAt) == todayStr }.count
        let week = revisions.filter { $0.createdAt >= weekAgo }.count
        let month = revisions.filter { $0.createdAt >= monthAgo }.count
        let avgQ = total > 0 ? Double(revisions.reduce(0) { $0 + $1.quality }) / Double(total) : 0

        let (current, best) = computeStreaks()

        return Stats(total: total, today: today, week: week, month: month,
                     avgQuality: avgQ, currentStreak: current, bestStreak: best)
    }

    private func computeStreaks() -> (current: Int, best: Int) {
        var dates = Set<String>()
        for r in revisions {
            dates.insert(DateHelpers.dateString(r.createdAt))
        }

        let sorted = dates.sorted().reversed().map { $0 }
        guard !sorted.isEmpty else { return (0, 0) }

        let cal = Calendar.current
        let todayStr = DateHelpers.dateString()

        // Current streak
        var current = 0
        var checkDate = todayStr
        if !dates.contains(checkDate) {
            // Maybe yesterday
            let yesterday = cal.date(byAdding: .day, value: -1, to: Date())!
            checkDate = DateHelpers.dateString(yesterday)
        }

        var d = DateHelpers.parseISO(checkDate + "T00:00:00Z") ?? Date()
        while dates.contains(DateHelpers.dateString(d)) {
            current += 1
            d = cal.date(byAdding: .day, value: -1, to: d)!
        }

        // Best streak
        let allSorted = dates.sorted()
        var best = 0
        var run = 1
        for i in 1..<allSorted.count {
            let prev = DateHelpers.parseISO(allSorted[i-1] + "T00:00:00Z")!
            let curr = DateHelpers.parseISO(allSorted[i] + "T00:00:00Z")!
            if DateHelpers.daysBetween(prev, curr) == 1 {
                run += 1
            } else {
                best = max(best, run)
                run = 1
            }
        }
        best = max(best, run)

        return (current, best)
    }

    private func revisionsByDay() -> [String: Int] {
        var result: [String: Int] = [:]
        for r in revisions {
            let key = DateHelpers.dateString(r.createdAt)
            result[key, default: 0] += 1
        }
        return result
    }

    private func dateFor(week: Int, day: Int) -> Date {
        let cal = Calendar.current
        let today = cal.startOfDay(for: Date())
        let todayWeekday = cal.component(.weekday, from: today) // 1=Sun
        let todayDayIndex = (todayWeekday + 5) % 7 // 0=Mon

        let endOfGrid = cal.date(byAdding: .day, value: 6 - todayDayIndex, to: today)!
        let startOfGrid = cal.date(byAdding: .day, value: -(weeks * 7 - 1), to: endOfGrid)!
        return cal.date(byAdding: .day, value: week * 7 + day, to: startOfGrid)!
    }

    private func dayLabel(_ day: Int) -> String {
        switch day {
        case 0: "M"
        case 2: "W"
        case 4: "F"
        default: " "
        }
    }

    private func heatmapColor(count: Int, isFuture: Bool) -> Color {
        if isFuture { return Color.gray.opacity(0.2) }
        switch count {
        case 0: return Color.gray.opacity(0.1)
        case 1...2: return .green.opacity(0.3)
        case 3...5: return .green.opacity(0.6)
        default: return .green
        }
    }
}
