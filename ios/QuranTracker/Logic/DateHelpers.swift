import Foundation

/// Local-timezone date utilities.
/// Ported from `src/constants.js` — `localDateStr()` and `isoToLocalDate()`.
enum DateHelpers {

    private static let calendar = Calendar.current

    /// Today's date at midnight in the user's local timezone.
    static func today() -> Date {
        calendar.startOfDay(for: Date())
    }

    /// Start of day for a given date.
    static func startOfDay(_ date: Date) -> Date {
        calendar.startOfDay(for: date)
    }

    /// Format a `Date` as "YYYY-MM-DD" in the user's local timezone.
    /// Equivalent to web app's `localDateStr()`.
    static func dateString(_ date: Date = Date()) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
    }

    /// Check if two dates are the same calendar day.
    static func isSameDay(_ a: Date, _ b: Date) -> Bool {
        calendar.isDate(a, inSameDayAs: b)
    }

    /// Number of calendar days between two dates (date2 - date1).
    static func daysBetween(_ date1: Date, _ date2: Date) -> Int {
        let start = calendar.startOfDay(for: date1)
        let end = calendar.startOfDay(for: date2)
        return calendar.dateComponents([.day], from: start, to: end).day ?? 0
    }

    /// Parse an ISO 8601 string into a Date.
    /// Handles both with and without fractional seconds (e.g. ".000Z").
    static func parseISO(_ string: String) -> Date? {
        let fmt = ISO8601DateFormatter()
        if let d = fmt.date(from: string) { return d }
        fmt.formatOptions.insert(.withFractionalSeconds)
        return fmt.date(from: string)
    }

    /// Format a Date as ISO 8601.
    static func toISO(_ date: Date) -> String {
        ISO8601DateFormatter().string(from: date)
    }
}
