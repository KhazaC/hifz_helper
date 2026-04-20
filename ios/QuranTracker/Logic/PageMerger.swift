import Foundation

/// Port of `src/pageMerge.js`.
/// Handles partial-verse resolution, page lookup, and page-based merging.
enum PageMerger {

    // MARK: - Public API

    /// Resolve partial-verse overlaps between entries.
    /// Port of `resolvePartialVerses()`.
    static func resolvePartialVerses(_ entries: [MemorizationEntry]) -> [ResolvedEntry] {
        guard entries.count > 1 else {
            return entries.map { ResolvedEntry(from: $0) }
        }

        var items = entries.map { ResolvedEntry(from: $0) }
        items.sort { a, b in
            if a.startSurah != b.startSurah { return a.startSurah < b.startSurah }
            let av = Double(a.startVerse) ?? 0
            let bv = Double(b.startVerse) ?? 0
            if av != bv { return av < bv }
            return a.createdAt < b.createdAt
        }

        // Build index: "surah:verseInt" → [indices]
        var startIndex: [String: [Int]] = [:]
        for (j, item) in items.enumerated() {
            let key = "\(item.startSurah):\(verseInt(item.startVerse))"
            startIndex[key, default: []].append(j)
        }

        var toRemove = Set<Int>()
        for i in 0..<items.count {
            guard isFractional(items[i].endVerse) else { continue }

            let aEndInt = verseInt(items[i].endVerse)
            let aEndSurah = items[i].endSurah
            let key = "\(aEndSurah):\(aEndInt)"
            guard let candidates = startIndex[key] else { continue }

            for j in candidates {
                guard j > i else { continue }

                let prevVerse = aEndInt - 1
                if prevVerse < verseInt(items[i].startVerse) {
                    toRemove.insert(i)
                } else {
                    items[i].endVerse = String(prevVerse)
                }

                items[j].startVerse = String(aEndInt)
                break
            }
        }

        return items.enumerated().compactMap { toRemove.contains($0.offset) ? nil : $0.element }
    }

    /// Get all page numbers an entry spans.
    /// Port of `getPagesForEntry()`.
    static func pagesForEntry(_ entry: some HasVerseRange, pageMap: [String: Int]) -> [Int] {
        var pages = Set<Int>()
        let startV = verseInt(entry.startVerse)
        let endV = verseInt(entry.endVerse)

        if entry.startSurah == entry.endSurah {
            for v in startV...endV {
                if let page = pageMap["\(entry.startSurah):\(v)"] {
                    pages.insert(page)
                }
            }
        } else {
            if let startPage = pageMap["\(entry.startSurah):\(startV)"],
               let endPage = pageMap["\(entry.endSurah):\(endV)"] {
                for p in startPage...endPage {
                    pages.insert(p)
                }
            }
        }

        return pages.sorted()
    }

    /// Get the first and last verse on a page.
    /// Port of `getPageBounds()`.
    static func pageBounds(_ pageNum: Int, quranData: QuranDataManager) -> (startSurah: Int, startVerse: String, endSurah: Int, endVerse: String)? {
        guard let page = quranData.pages[pageNum], !page.verses.isEmpty else { return nil }
        let first = page.verses[0]
        let last = page.verses[page.verses.count - 1]
        return (first.surahNum, String(first.verseNum), last.surahNum, String(last.verseNum))
    }

    /// Merge old entries by page when they fully cover a page.
    /// Port of `mergeByPage()`.
    static func mergeByPage(
        _ oldEntries: [ResolvedEntry],
        quranData: QuranDataManager,
        pageMap: [String: Int]
    ) -> [MergedPageEntry] {
        guard !oldEntries.isEmpty else { return [] }

        // Map page → entries touching that page
        var pageGroups: [Int: [ResolvedEntry]] = [:]
        for entry in oldEntries {
            let pages = pagesForEntry(entry, pageMap: pageMap)
            for p in pages {
                pageGroups[p, default: []].append(entry)
            }
        }

        var consumedIds = Set<UUID>()
        var merged: [MergedPageEntry] = []
        let sortedPages = pageGroups.keys.sorted()

        for pageNum in sortedPages {
            guard let group = pageGroups[pageNum],
                  let bounds = pageBounds(pageNum, quranData: quranData) else { continue }

            guard pageFullyCovered(pageNum, entries: group, quranData: quranData) else { continue }

            let earliestCreated = group.map(\.createdAt).min() ?? Date()
            let latestUpdated = group.map(\.updatedAt).max() ?? Date()

            merged.append(MergedPageEntry(
                id: "page-\(pageNum)",
                pageNum: pageNum,
                startSurah: bounds.startSurah,
                startVerse: bounds.startVerse,
                endSurah: bounds.endSurah,
                endVerse: bounds.endVerse,
                createdAt: earliestCreated,
                updatedAt: latestUpdated,
                sourceIds: group.map(\.id),
                sourceCount: group.count,
                isMerged: true
            ))

            for e in group { consumedIds.insert(e.id) }
        }

        // Add non-consumed entries as-is
        for entry in oldEntries where !consumedIds.contains(entry.id) {
            merged.append(MergedPageEntry(
                id: entry.id.uuidString,
                pageNum: nil,
                startSurah: entry.startSurah,
                startVerse: entry.startVerse,
                endSurah: entry.endSurah,
                endVerse: entry.endVerse,
                createdAt: entry.createdAt,
                updatedAt: entry.updatedAt,
                sourceIds: [entry.id],
                sourceCount: 1,
                isMerged: false
            ))
        }

        return merged
    }

    // MARK: - Private Helpers

    private static func verseInt(_ verseStr: String) -> Int {
        Int(floor(Double(verseStr) ?? 0))
    }

    private static func isFractional(_ verseStr: String) -> Bool {
        let n = Double(verseStr) ?? 0
        return n != floor(n)
    }

    private static func entryCoversVerse(_ entry: some HasVerseRange, surahNum: Int, verseNum: Int) -> Bool {
        let s0 = entry.startSurah
        let v0 = verseInt(entry.startVerse)
        let s1 = entry.endSurah
        let v1 = verseInt(entry.endVerse)
        if s0 == s1 {
            return surahNum == s0 && verseNum >= v0 && verseNum <= v1
        }
        if surahNum < s0 || surahNum > s1 { return false }
        if surahNum == s0 { return verseNum >= v0 }
        if surahNum == s1 { return verseNum <= v1 }
        return true
    }

    private static func pageFullyCovered(_ pageNum: Int, entries: [some HasVerseRange], quranData: QuranDataManager) -> Bool {
        guard let page = quranData.pages[pageNum], !page.verses.isEmpty else { return false }
        return page.verses.allSatisfy { v in
            entries.contains { e in entryCoversVerse(e, surahNum: v.surahNum, verseNum: v.verseNum) }
        }
    }
}

// MARK: - Supporting Types

protocol HasVerseRange {
    var startSurah: Int { get }
    var startVerse: String { get }
    var endSurah: Int { get }
    var endVerse: String { get }
}

/// A copy of MemorizationEntry with mutable verse strings for partial-verse resolution.
struct ResolvedEntry: Identifiable, HasVerseRange {
    let id: UUID
    let startSurah: Int
    var startVerse: String
    let endSurah: Int
    var endVerse: String
    let createdAt: Date
    let updatedAt: Date

    init(from entry: MemorizationEntry) {
        self.id = entry.id
        self.startSurah = entry.startSurah
        self.startVerse = entry.startVerse
        self.endSurah = entry.endSurah
        self.endVerse = entry.endVerse
        self.createdAt = entry.createdAt
        self.updatedAt = entry.updatedAt
    }
}

extension MergedPageEntry: HasVerseRange {}
