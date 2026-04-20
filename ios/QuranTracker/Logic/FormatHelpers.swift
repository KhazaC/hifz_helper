import Foundation

/// Formatting helpers used across views.
enum FormatHelpers {

    /// Format a verse range for display, e.g. "Al-Baqara 2:255 → 2:260"
    static func formatRange(
        startSurah: Int, startVerse: String, endSurah: Int, endVerse: String,
        quranData: QuranDataManager
    ) -> String {
        let name = quranData.surahName(startSurah)
        if startSurah == endSurah {
            if startVerse == endVerse {
                return "\(name) \(startSurah):\(startVerse)"
            }
            return "\(name) \(startSurah):\(startVerse)–\(endVerse)"
        }
        let endName = quranData.surahName(endSurah)
        return "\(name) \(startSurah):\(startVerse) → \(endName) \(endSurah):\(endVerse)"
    }

    static func formatEntry(_ entry: MemorizationEntry, quranData: QuranDataManager) -> String {
        formatRange(startSurah: entry.startSurah, startVerse: entry.startVerse,
                    endSurah: entry.endSurah, endVerse: entry.endVerse, quranData: quranData)
    }

    static func formatRevision(_ rev: RevisionEntry, quranData: QuranDataManager) -> String {
        formatRange(startSurah: rev.startSurah, startVerse: rev.startVerse,
                    endSurah: rev.endSurah, endVerse: rev.endVerse, quranData: quranData)
    }

    static func qualityLabel(_ quality: Int) -> String {
        switch quality {
        case 1: "Poor"
        case 2: "Weak"
        case 3: "Okay"
        case 4: "Good"
        case 5: "Solid"
        default: "?"
        }
    }
}
