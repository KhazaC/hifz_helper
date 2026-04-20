# iOS Port — Notifications & Widgets

## 1. Local Notifications

### 1.1 Notification Strategy

The app sends local notifications to remind users about due revisions. Two notification types:

| Type | Trigger | Content |
|---|---|---|
| **Daily Summary** | Every day at a user-configurable time (default: 8:00 AM) | "You have N revisions due today" |
| **Streak Risk** | 9:00 PM if no revision logged today and streak > 0 | "Don't break your N-day streak! Log a revision before midnight" |

### 1.2 Permission Request

Request notification permission on first app launch or when user enables notifications in settings:

```swift
class NotificationService {
    static let shared = NotificationService()

    func requestPermission() async -> Bool {
        let center = UNUserNotificationCenter.current()
        do {
            return try await center.requestAuthorization(options: [.alert, .badge, .sound])
        } catch {
            return false
        }
    }
}
```

### 1.3 Daily Summary Notification

Scheduled as a repeating calendar trigger. Content is computed when the notification fires.

```swift
extension NotificationService {
    func scheduleDailySummary(hour: Int = 8, minute: Int = 0) {
        let center = UNUserNotificationCenter.current()

        // Remove existing daily summary
        center.removePendingNotificationRequests(withIdentifiers: ["daily-summary"])

        // Create content (placeholder — will be updated by refresh)
        let content = UNMutableNotificationContent()
        content.title = "Quran Revision Reminder"
        content.body = "Check your revision schedule for today"
        content.sound = .default
        content.categoryIdentifier = "DAILY_SUMMARY"

        // Trigger: repeating at the specified time every day
        var dateComponents = DateComponents()
        dateComponents.hour = hour
        dateComponents.minute = minute
        let trigger = UNCalendarNotificationTrigger(dateMatching: dateComponents, repeats: true)

        let request = UNNotificationRequest(
            identifier: "daily-summary",
            content: content,
            trigger: trigger
        )
        center.add(request)
    }
}
```

**Problem**: `UNCalendarNotificationTrigger` sets content at schedule time, not fire time. The due count may change. 

**Solution**: Use a background refresh to update the notification content periodically:

```swift
extension NotificationService {
    /// Called from app refresh or when data changes
    func updateDailyNotificationContent(dueCount: Int) {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: ["daily-summary"])

        guard dueCount > 0 else { return }

        let content = UNMutableNotificationContent()
        content.title = "Quran Revision"
        content.body = dueCount == 1
            ? "You have 1 revision due today"
            : "You have \(dueCount) revisions due today"
        content.sound = .default
        content.badge = NSNumber(value: dueCount)

        // Schedule for tomorrow morning
        var dateComponents = Calendar.current.dateComponents([.year, .month, .day], from: .now)
        dateComponents.day! += 1
        dateComponents.hour = 8
        dateComponents.minute = 0
        let trigger = UNCalendarNotificationTrigger(dateMatching: dateComponents, repeats: false)

        center.add(UNNotificationRequest(
            identifier: "daily-summary",
            content: content,
            trigger: trigger
        ))
    }
}
```

### 1.4 Streak Risk Notification

Scheduled each day at app launch or when a revision is logged. Only fires if no revision logged today.

```swift
extension NotificationService {
    func scheduleStreakReminder(currentStreak: Int) {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: ["streak-risk"])

        guard currentStreak > 0 else { return }

        let content = UNMutableNotificationContent()
        content.title = "Streak at Risk!"
        content.body = "Don't break your \(currentStreak)-day streak! Log a revision before midnight."
        content.sound = .default

        // Trigger at 9 PM today
        var dateComponents = Calendar.current.dateComponents([.year, .month, .day], from: .now)
        dateComponents.hour = 21
        dateComponents.minute = 0
        let trigger = UNCalendarNotificationTrigger(dateMatching: dateComponents, repeats: false)

        center.add(UNNotificationRequest(
            identifier: "streak-risk",
            content: content,
            trigger: trigger
        ))
    }

    /// Cancel streak reminder when a revision is logged today
    func cancelStreakReminder() {
        UNUserNotificationCenter.current()
            .removePendingNotificationRequests(withIdentifiers: ["streak-risk"])
    }
}
```

### 1.5 App Badge

Update the app badge count to show due revisions:

```swift
extension NotificationService {
    func updateBadge(dueCount: Int) {
        UNUserNotificationCenter.current().setBadgeCount(dueCount)
    }
}
```

### 1.6 Notification Refresh Points

Notifications should be recalculated at these points:
1. **App launch** — schedule/update daily summary and streak reminder
2. **Revision logged** — cancel streak reminder if first revision today; update badge
3. **App entering background** — update badge count
4. **Midnight rollover** — if app is open past midnight, recompute (use `scenePhase` change)

### 1.7 Notification Settings

Store user preferences in `@AppStorage`:

```swift
@AppStorage("notificationsEnabled") var notificationsEnabled = true
@AppStorage("dailyReminderHour") var dailyReminderHour = 8
@AppStorage("dailyReminderMinute") var dailyReminderMinute = 0
@AppStorage("streakRemindersEnabled") var streakRemindersEnabled = true
```

## 2. Home Screen Widgets (Future Phase)

### 2.1 Widget Types

| Widget | Size | Content |
|---|---|---|
| **Due Count** | Small (`.systemSmall`) | Large number showing revisions due today + streak count |
| **Progress Ring** | Small | Circular progress showing % of Quran memorized |
| **Today Summary** | Medium (`.systemMedium`) | Due count + top 3 surahs with due items + streak |
| **Activity Calendar** | Large (`.systemLarge`) | Heatmap + stats grid (condensed) |

### 2.2 Architecture

Widgets require a separate target and use `WidgetKit`:

```
ios/
├── QuranTracker/          // Main app target
├── QuranTrackerWidget/    // Widget extension target
│   ├── QuranTrackerWidget.swift
│   ├── DueCountWidget.swift
│   ├── ProgressWidget.swift
│   └── TodaySummaryWidget.swift
└── Shared/                // Shared between app and widget
    ├── Models/
    ├── FSRS/
    └── Logic/
```

### 2.3 Data Sharing

Widgets can't access the main app's SwiftData container directly. Options:

**Option A (Recommended): App Group + Shared Container**
```swift
let config = ModelConfiguration(
    "QuranTracker",
    schema: schema,
    url: containerURL,   // URL in shared app group container
    cloudKitDatabase: .automatic
)
```
- Both app and widget use the same SQLite file via App Group
- Widget reads entries/revisions directly

**Option B: UserDefaults in App Group**
- Main app writes computed summary data (due count, streak, etc.) to shared UserDefaults
- Widget reads only summary data, no direct model access
- Simpler but less flexible

### 2.4 Widget Timeline

```swift
struct DueCountProvider: TimelineProvider {
    func getTimeline(in context: Context, completion: @escaping (Timeline<DueCountEntry>) -> ()) {
        // Read current due count
        let dueCount = computeDueCount(...)
        let entry = DueCountEntry(date: .now, dueCount: dueCount, streak: currentStreak)

        // Refresh at midnight (when due items change)
        let midnight = Calendar.current.startOfDay(for: Calendar.current.date(byAdding: .day, value: 1, to: .now)!)
        let timeline = Timeline(entries: [entry], policy: .after(midnight))
        completion(timeline)
    }
}
```

### 2.5 Widget Implementation Phase

Widgets are deferred to a later phase because:
- Core app functionality must be stable first
- Widgets require App Group setup (affects main app container config)
- Shared code extraction needed (FSRS, models, logic into a shared framework/module)
- Testing widgets requires device or simulator (no unit tests)

**Prerequisites before widget work:**
1. Main app feature-complete and tested
2. Business logic extracted into a shared Swift package/module
3. App Group container configured
4. SwiftData container URL moved to App Group
