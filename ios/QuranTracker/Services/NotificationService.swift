import Foundation
import UserNotifications

/// Manages local notifications for daily revision reminders and streak protection.
@Observable
final class NotificationService {
    static let shared = NotificationService()

    private(set) var isAuthorized = false

    private let center = UNUserNotificationCenter.current()

    private init() {}

    // MARK: - Permission

    func requestPermission() async -> Bool {
        do {
            let granted = try await center.requestAuthorization(options: [.alert, .badge, .sound])
            isAuthorized = granted
            return granted
        } catch {
            isAuthorized = false
            return false
        }
    }

    func checkPermission() async {
        let settings = await center.notificationSettings()
        isAuthorized = settings.authorizationStatus == .authorized
    }

    // MARK: - Daily Summary

    func scheduleDailySummary(dueCount: Int, hour: Int = 8, minute: Int = 0) {
        center.removePendingNotificationRequests(withIdentifiers: ["daily-summary"])

        guard dueCount > 0 else { return }

        let content = UNMutableNotificationContent()
        content.title = "Quran Revision"
        content.body = dueCount == 1
            ? "You have 1 revision due today"
            : "You have \(dueCount) revisions due today"
        content.sound = .default
        content.badge = NSNumber(value: dueCount)

        // Schedule for tomorrow at the configured time
        let cal = Calendar.current
        var components = cal.dateComponents([.year, .month, .day], from: Date())
        components.day! += 1
        components.hour = hour
        components.minute = minute

        let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
        let request = UNNotificationRequest(identifier: "daily-summary", content: content, trigger: trigger)
        center.add(request)
    }

    // MARK: - Streak Reminder

    func scheduleStreakReminder(currentStreak: Int, hasRevisedToday: Bool) {
        center.removePendingNotificationRequests(withIdentifiers: ["streak-risk"])

        guard currentStreak > 0, !hasRevisedToday else { return }

        let content = UNMutableNotificationContent()
        content.title = "Streak at Risk!"
        content.body = "Don't break your \(currentStreak)-day streak! Log a revision before midnight."
        content.sound = .default

        // Trigger at 9 PM today
        var components = Calendar.current.dateComponents([.year, .month, .day], from: Date())
        components.hour = 21
        components.minute = 0

        let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
        let request = UNNotificationRequest(identifier: "streak-risk", content: content, trigger: trigger)
        center.add(request)
    }

    func cancelStreakReminder() {
        center.removePendingNotificationRequests(withIdentifiers: ["streak-risk"])
    }

    // MARK: - Badge

    func updateBadge(_ count: Int) {
        center.setBadgeCount(count)
    }

    // MARK: - Refresh All

    /// Call on app launch, data change, or revision logged.
    func refresh(
        dueCount: Int,
        currentStreak: Int,
        hasRevisedToday: Bool,
        notificationsEnabled: Bool,
        streakRemindersEnabled: Bool,
        reminderHour: Int,
        reminderMinute: Int
    ) {
        guard isAuthorized, notificationsEnabled else {
            cancelAll()
            updateBadge(0)
            return
        }

        scheduleDailySummary(dueCount: dueCount, hour: reminderHour, minute: reminderMinute)
        updateBadge(dueCount)

        if streakRemindersEnabled {
            scheduleStreakReminder(currentStreak: currentStreak, hasRevisedToday: hasRevisedToday)
        } else {
            cancelStreakReminder()
        }
    }

    func cancelAll() {
        center.removeAllPendingNotificationRequests()
    }
}
