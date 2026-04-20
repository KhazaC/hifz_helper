import Foundation

/// Entry classification (new vs old) and helper queries.
/// Port of derived data computations from App.jsx.
enum ClassificationEngine {

    /// Classify entries as new (< 21 min reps) or old (≥ 21).
    /// Port of the useMemo block in App.jsx lines ~120-145.
    static func classify(
        entries: [MemorizationEntry],
        snapshot: [String: CardState],
        quranData: QuranDataManager
    ) -> (new: [ClassifiedEntry], old: [MemorizationEntry]) {
        let resolved = PageMerger.resolvePartialVerses(entries)
        var newEntries: [ClassifiedEntry] = []
        var oldEntries: [MemorizationEntry] = []

        for r in resolved {
            let verses = quranData.versesInRange(
                startSurah: r.startSurah, startVerse: r.startVerse,
                endSurah: r.endSurah, endVerse: r.endVerse
            )
            let minReps = verses.map { v -> Int in
                let key = "\(v.surahNum):\(v.verseNum)"
                return snapshot[key]?.reps ?? 0
            }.min() ?? 0

            // Find the original entry by ID to pass through
            guard let original = entries.first(where: { $0.id == r.id }) else { continue }

            if minReps < AppConstants.newPeriodRevisions {
                newEntries.append(ClassifiedEntry(
                    entry: original,
                    isNew: true,
                    revisionCount: minReps,
                    revisionsRemaining: AppConstants.newPeriodRevisions - minReps
                ))
            } else {
                oldEntries.append(original)
            }
        }

        return (newEntries, oldEntries)
    }

    /// Check if any revision today overlaps the given entry's verse range.
    /// Port of `hasRevisionToday()` from SuggestionsPanel.jsx.
    static func isRevisedToday(
        entry: MemorizationEntry,
        revisions: [RevisionEntry]
    ) -> Bool {
        let today = DateHelpers.today()
        return revisions.contains { rev in
            guard DateHelpers.isSameDay(rev.createdAt, today) else { return false }
            return rangesOverlap(
                s1Start: entry.startSurah, v1Start: entry.startVerse,
                s1End: entry.endSurah, v1End: entry.endVerse,
                s2Start: rev.startSurah, v2Start: rev.startVerse,
                s2End: rev.endSurah, v2End: rev.endVerse
            )
        }
    }

    /// Check if two surah:verse ranges overlap.
    static func rangesOverlap(
        s1Start: Int, v1Start: String, s1End: Int, v1End: String,
        s2Start: Int, v2Start: String, s2End: Int, v2End: String
    ) -> Bool {
        let a0 = s1Start * 1000 + Int(floor(Double(v1Start) ?? 0))
        let a1 = s1End * 1000 + Int(floor(Double(v1End) ?? 0))
        let b0 = s2Start * 1000 + Int(floor(Double(v2Start) ?? 0))
        let b1 = s2End * 1000 + Int(floor(Double(v2End) ?? 0))
        return a0 <= b1 && b0 <= a1
    }

    /// Get surah numbers that have at least one memorized verse.
    static func memorizedSurahNumbers(entries: [MemorizationEntry]) -> Set<Int> {
        var nums = Set<Int>()
        for e in entries {
            for s in e.startSurah...e.endSurah {
                nums.insert(s)
            }
        }
        return nums
    }

    /// Get surah numbers that are fully memorized (all verses covered).
    static func fullyMemorizedSurahNumbers(
        entries: [MemorizationEntry],
        quranData: QuranDataManager
    ) -> Set<Int> {
        // Collect all memorized verse keys
        var memorized = Set<String>()
        for e in entries {
            let verses = quranData.versesInRange(
                startSurah: e.startSurah, startVerse: e.startVerse,
                endSurah: e.endSurah, endVerse: e.endVerse
            )
            for v in verses {
                memorized.insert("\(v.surahNum):\(v.verseNum)")
            }
        }

        var result = Set<Int>()
        for surah in quranData.surahs {
            let total = surah.numVerses
            let count = (1...total).filter { memorized.contains("\(surah.num):\($0)") }.count
            if count == total {
                result.insert(surah.num)
            }
        }
        return result
    }

    /// Compute due count for badge: unrevised-today new entries + total due old groups.
    static func dueCount(
        newEntries: [ClassifiedEntry],
        surahSuggestions: [SurahSuggestion],
        revisions: [RevisionEntry]
    ) -> Int {
        let newDue = newEntries.filter { !isRevisedToday(entry: $0.entry, revisions: revisions) }.count
        let oldDue = surahSuggestions.reduce(0) { $0 + $1.totalDueGroups }
        return newDue + oldDue
    }
}
