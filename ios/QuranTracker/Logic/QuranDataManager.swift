import Foundation

/// Loads and caches all static Quran data from bundled JSON files.
/// Ported from `src/hooks/useQuranData.js` and `src/fsrs.js` (getVerseIndex, getVersesInRange).
@Observable
final class QuranDataManager {
    static let shared = QuranDataManager()

    private(set) var surahs: [SurahInfo] = []
    private(set) var pages: [Int: PageInfo] = [:]
    private(set) var pageMap: [String: Int] = [:]

    // Lazy-built indexes (mirrors web app's getVerseIndex)
    private var verseIndex: [Int: [Int: VerseInfo]] = [:]
    private var maxVerse: [Int: Int] = [:]

    var isLoaded: Bool { !surahs.isEmpty }

    private init() {}

    func load() throws {
        try loadSurahIndex()
        try loadVerseData()
        try loadPageMap()
        buildVerseIndex()
    }

    // MARK: - Lookups

    func surahName(_ num: Int) -> String {
        surahs.first(where: { $0.num == num })?.name ?? "Surah \(num)"
    }

    func maxVerses(forSurah num: Int) -> Int {
        maxVerse[num] ?? surahs.first(where: { $0.num == num })?.numVerses ?? 0
    }

    /// Get all verses in a surah:verse range.
    /// O(output size) using the surah-indexed lookup.
    /// Ported from `getVersesInRange()` in fsrs.js.
    func versesInRange(startSurah: Int, startVerse: Int, endSurah: Int, endVerse: Int) -> [VerseInfo] {
        let s0 = startSurah
        let v0 = Int(floor(Double(startVerse)))
        let s1 = endSurah
        let v1 = Int(floor(Double(endVerse)))

        var result: [VerseInfo] = []
        for s in s0...s1 {
            guard let surahVerses = verseIndex[s] else { continue }
            let vStart = s == s0 ? v0 : 1
            let vEnd = s == s1 ? v1 : (maxVerse[s] ?? 0)
            guard vEnd >= vStart else { continue }
            for v in vStart...vEnd {
                if let verse = surahVerses[v] {
                    result.append(verse)
                }
            }
        }
        return result
    }

    /// Overload accepting String verses (handles fractional like "5.2").
    func versesInRange(startSurah: Int, startVerse: String, endSurah: Int, endVerse: String) -> [VerseInfo] {
        versesInRange(
            startSurah: startSurah,
            startVerse: Int(floor(Double(startVerse) ?? 1)),
            endSurah: endSurah,
            endVerse: Int(floor(Double(endVerse) ?? 1))
        )
    }

    // MARK: - Private Loaders

    private func loadSurahIndex() throws {
        guard let url = Bundle.main.url(forResource: "surah_index", withExtension: "json") else {
            throw DataError.missingResource("surah_index.json")
        }
        let data = try Data(contentsOf: url)
        let raw = try JSONDecoder().decode([String: SurahIndexRaw].self, from: data)

        surahs = raw.map { (name, info) in
            SurahInfo(num: info.numSurah, name: name, numVerses: info.numVerses,
                      startPage: info.startPage, endPage: info.endPage)
        }.sorted { $0.num < $1.num }
    }

    private func loadVerseData() throws {
        guard let url = Bundle.main.url(forResource: "verse_data", withExtension: "json") else {
            throw DataError.missingResource("verse_data.json")
        }
        let data = try Data(contentsOf: url)
        let raw = try JSONDecoder().decode(VerseDataRaw.self, from: data)

        pages = [:]
        for (key, page) in raw.pages {
            guard let pageNum = Int(key) else { continue }
            let verses = page.verses.map { v in
                VerseInfo(surahNum: v.surahNum, verseNum: v.verseNum, wordCount: v.wordCount)
            }
            pages[pageNum] = PageInfo(pageNum: pageNum, verses: verses)
        }
    }

    private func loadPageMap() throws {
        guard let url = Bundle.main.url(forResource: "pageMap", withExtension: "json") else {
            throw DataError.missingResource("pageMap.json")
        }
        let data = try Data(contentsOf: url)
        pageMap = try JSONDecoder().decode([String: Int].self, from: data)
    }

    private func buildVerseIndex() {
        verseIndex = [:]
        maxVerse = [:]
        for page in pages.values {
            for v in page.verses {
                if verseIndex[v.surahNum] == nil {
                    verseIndex[v.surahNum] = [:]
                }
                verseIndex[v.surahNum]![v.verseNum] = v
            }
        }
        for (s, verses) in verseIndex {
            maxVerse[s] = verses.keys.max() ?? 0
        }
    }

    enum DataError: Error, LocalizedError {
        case missingResource(String)

        var errorDescription: String? {
            switch self {
            case .missingResource(let name): "Missing bundled resource: \(name)"
            }
        }
    }
}

// MARK: - Public Types

struct SurahInfo: Identifiable, Sendable {
    let num: Int
    let name: String
    let numVerses: Int
    let startPage: Int
    let endPage: Int

    var id: Int { num }
}

struct VerseInfo: Sendable {
    let surahNum: Int
    let verseNum: Int
    let wordCount: Int
}

struct PageInfo: Sendable {
    let pageNum: Int
    let verses: [VerseInfo]
}

// MARK: - Private JSON Decode Types

private struct SurahIndexRaw: Decodable {
    let numSurah: Int
    let numVerses: Int
    let startPage: Int
    let endPage: Int
}

private struct VerseDataRaw: Decodable {
    let pages: [String: PageRaw]
}

private struct PageRaw: Decodable {
    let verses: [VerseRaw]
}

private struct VerseRaw: Decodable {
    let surahNum: Int
    let verseNum: Int
    let wordCount: Int
}
