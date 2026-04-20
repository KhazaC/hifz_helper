import Foundation

/// Computes FSRS-based revision suggestions from the per-verse snapshot.
/// Port of `computeSuggestions()` and `computeSurahSuggestions()` from fsrs.js.
enum SuggestionEngine {

    private static let daySeconds: TimeInterval = 86400

    // MARK: - Page-level Suggestions

    /// Compute page-level suggestions for the SuggestionsPanel.
    /// Port of `computeSuggestions()`.
    static func computePageSuggestions(
        memorized: [MergedPageEntry],
        snapshot: [String: CardState],
        quranData: QuranDataManager
    ) -> [PageSuggestion] {
        let now = Date()
        var suggestions: [PageSuggestion] = []

        for entry in memorized {
            let key = "\(entry.startSurah):\(entry.startVerse)-\(entry.endSurah):\(entry.endVerse)"
            let verses = entryVerses(entry, quranData: quranData)

            if verses.isEmpty {
                // Fallback: no verse data
                let vKey = "\(entry.startSurah):\(Int(floor(Double(entry.startVerse) ?? 1)))"
                let card = snapshot[vKey]
                if let card {
                    let d = now.timeIntervalSince(card.lastReview) / daySeconds
                    let R = FSRSEngine.retrievability(t: d, S: card.stability)
                    let interval = min(Double(FSRSEngine.nextInterval(S: card.stability)),
                                       Double(AppConstants.maxIntervalDays))
                    suggestions.append(PageSuggestion(
                        entry: entry, key: key, stability: card.stability,
                        retrievability: R,
                        daysSinceReview: round(d * 10) / 10,
                        dueIn: round((interval - d) * 10) / 10,
                        overdueDays: round(-(interval - d) * 10) / 10,
                        totalReviews: Double(card.reps),
                        reviewedVerses: 1, totalVerses: 1
                    ))
                } else {
                    suggestions.append(PageSuggestion(
                        entry: entry, key: key, stability: 0,
                        retrievability: 0, daysSinceReview: nil, dueIn: 0,
                        overdueDays: .infinity, totalReviews: 0,
                        reviewedVerses: 0, totalVerses: 1
                    ))
                }
                continue
            }

            // Per-verse stats
            var totalRet = 0.0, totalReps = 0.0, totalStab = 0.0
            var reviewedCount = 0
            var minDueIn = Double.infinity
            var maxDaysSince: Double? = nil

            for v in verses {
                let vKey = "\(v.surahNum):\(v.verseNum)"
                guard let card = snapshot[vKey] else {
                    minDueIn = min(minDueIn, 0)
                    continue
                }
                let d = now.timeIntervalSince(card.lastReview) / daySeconds
                let R = FSRSEngine.retrievability(t: d, S: card.stability)
                let interval = min(Double(FSRSEngine.nextInterval(S: card.stability)),
                                   Double(AppConstants.maxIntervalDays))
                totalRet += R
                totalReps += Double(card.reps)
                totalStab += card.stability
                reviewedCount += 1
                minDueIn = min(minDueIn, interval - d)
                let daysSince = d
                if maxDaysSince == nil || daysSince > maxDaysSince! {
                    maxDaysSince = daysSince
                }
            }

            let total = verses.count
            suggestions.append(PageSuggestion(
                entry: entry, key: key,
                stability: totalStab / Double(total),
                retrievability: totalRet / Double(total),
                daysSinceReview: maxDaysSince.map { round($0 * 10) / 10 },
                dueIn: round(minDueIn * 10) / 10,
                overdueDays: round(-minDueIn * 10) / 10,
                totalReviews: round(totalReps / Double(total) * 10) / 10,
                reviewedVerses: reviewedCount, totalVerses: total
            ))
        }

        // Sort: never-reviewed first, then lowest retention, then most overdue
        suggestions.sort { a, b in
            if a.reviewedVerses == 0 && b.reviewedVerses > 0 { return true }
            if b.reviewedVerses == 0 && a.reviewedVerses > 0 { return false }
            if a.retrievability != b.retrievability { return a.retrievability < b.retrievability }
            return a.overdueDays > b.overdueDays
        }

        return suggestions
    }

    // MARK: - Surah-level Suggestions

    /// Compute surah-level revision suggestions.
    /// Port of `computeSurahSuggestions()`.
    static func computeSurahSuggestions(
        oldEntries: [ResolvedEntry],
        snapshot: [String: CardState],
        quranData: QuranDataManager,
        pageMap: [String: Int]
    ) -> [SurahSuggestion] {
        guard !oldEntries.isEmpty else { return [] }

        let now = Date()
        let nowDateOnly = Calendar.current.startOfDay(for: now)

        // Step 1: Collect all memorized verses
        var memorizedVerses = Set<String>()
        for entry in oldEntries {
            let verses = quranData.versesInRange(
                startSurah: entry.startSurah, startVerse: entry.startVerse,
                endSurah: entry.endSurah, endVerse: entry.endVerse
            )
            for v in verses {
                memorizedVerses.insert("\(v.surahNum):\(v.verseNum)")
            }
        }

        // Step 2: Compute per-verse FSRS state using date-only math
        struct VerseItem {
            let surahNum: Int
            let verseNum: Int
            let pageNum: Int
            let dueIn: Double
            let retention: Double
            let reps: Int
            let reviewed: Bool
        }

        var verseInfos: [VerseItem] = []
        for key in memorizedVerses {
            let parts = key.split(separator: ":").map { Int($0)! }
            let surahNum = parts[0], verseNum = parts[1]
            guard let pageNum = pageMap[key] else { continue }

            let card = snapshot[key]
            let item: VerseItem
            if let card {
                let lastDateOnly = Calendar.current.startOfDay(for: card.lastReview)
                let d = nowDateOnly.timeIntervalSince(lastDateOnly) / daySeconds
                let retention = FSRSEngine.retrievability(t: d, S: card.stability)
                let interval = min(Double(FSRSEngine.nextInterval(S: card.stability)),
                                   Double(AppConstants.maxIntervalDays))
                item = VerseItem(surahNum: surahNum, verseNum: verseNum, pageNum: pageNum,
                                 dueIn: interval - d, retention: retention, reps: card.reps, reviewed: true)
            } else {
                item = VerseItem(surahNum: surahNum, verseNum: verseNum, pageNum: pageNum,
                                 dueIn: 0, retention: 0, reps: 0, reviewed: false)
            }
            verseInfos.append(item)
        }

        // Step 3: Group by surah → page
        var surahPageGroups: [Int: [Int: [VerseItem]]] = [:]
        for vi in verseInfos {
            surahPageGroups[vi.surahNum, default: [:]][vi.pageNum, default: []].append(vi)
        }

        // Step 4: Build verse groups and surah suggestions
        var surahSuggestions: [SurahSuggestion] = []

        for (surahNum, pages) in surahPageGroups {
            var allGroups: [VerseGroup] = []

            for (pageNum, var verses) in pages {
                verses.sort { $0.verseNum < $1.verseNum }

                // Group consecutive verses
                var currentStart = -1
                var currentEnd = -1
                var currentVerses: [VerseItem] = []

                func finalizeCurrentGroup() {
                    guard !currentVerses.isEmpty else { return }
                    let totalV = currentVerses.count
                    let reviewedV = currentVerses.filter(\.reviewed).count
                    let avgRet = currentVerses.reduce(0.0) { $0 + $1.retention } / Double(totalV)
                    let avgRev = currentVerses.reduce(0.0) { $0 + Double($1.reps) } / Double(totalV)
                    let minDue = currentVerses.map(\.dueIn).min() ?? 0

                    allGroups.append(VerseGroup(
                        surahNum: surahNum, pageNum: pageNum,
                        startVerse: currentStart, endVerse: currentEnd,
                        totalVerses: totalV, reviewedVerses: reviewedV,
                        avgRetention: avgRet,
                        avgReviews: round(avgRev * 10) / 10,
                        minDueIn: round(minDue * 10) / 10,
                        isDue: minDue <= 0,
                        overdueDays: max(0, round(-minDue * 10) / 10)
                    ))
                }

                for v in verses {
                    if currentEnd >= 0 && v.verseNum == currentEnd + 1 {
                        currentEnd = v.verseNum
                        currentVerses.append(v)
                    } else {
                        finalizeCurrentGroup()
                        currentStart = v.verseNum
                        currentEnd = v.verseNum
                        currentVerses = [v]
                    }
                }
                finalizeCurrentGroup()
            }

            let dueGroups = allGroups.filter(\.isDue)
            let upcomingGroups = allGroups.filter { !$0.isDue }.sorted { $0.minDueIn < $1.minDueIn }

            var minVerse = Int.max
            var maxVerse = Int.min
            for g in allGroups {
                minVerse = min(minVerse, g.startVerse)
                maxVerse = max(maxVerse, g.endVerse)
            }

            surahSuggestions.append(SurahSuggestion(
                surahNum: surahNum,
                startVerse: String(minVerse),
                endVerse: String(maxVerse),
                allGroups: allGroups,
                dueGroups: dueGroups,
                upcomingGroups: upcomingGroups,
                totalDueGroups: dueGroups.count,
                totalGroups: allGroups.count,
                isDue: !dueGroups.isEmpty,
                minDueIn: allGroups.isEmpty ? .infinity : round(allGroups.map(\.minDueIn).min()! * 10) / 10,
                avgRetention: allGroups.isEmpty ? 0 : allGroups.reduce(0.0) { $0 + $1.avgRetention } / Double(allGroups.count)
            ))
        }

        // Sort: due surahs first, then by earliest dueIn
        surahSuggestions.sort { a, b in
            if a.isDue != b.isDue { return a.isDue }
            return a.minDueIn < b.minDueIn
        }

        return surahSuggestions
    }

    // MARK: - Helpers

    private static func entryVerses(_ entry: MergedPageEntry, quranData: QuranDataManager) -> [VerseInfo] {
        if let pageNum = entry.pageNum {
            return quranData.pages[pageNum]?.verses ?? []
        }
        return quranData.versesInRange(
            startSurah: entry.startSurah, startVerse: entry.startVerse,
            endSurah: entry.endSurah, endVerse: entry.endVerse
        )
    }
}

// MARK: - Page Suggestion Type

struct PageSuggestion: Identifiable {
    let entry: MergedPageEntry
    let key: String
    let stability: Double
    let retrievability: Double
    let daysSinceReview: Double?
    let dueIn: Double
    let overdueDays: Double
    let totalReviews: Double
    let reviewedVerses: Int
    let totalVerses: Int

    var id: String { key }
}
