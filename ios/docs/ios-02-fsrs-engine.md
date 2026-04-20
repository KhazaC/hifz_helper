# iOS Port — FSRS v4 Engine

## Overview

Direct port of `src/fsrs.js` to pure Swift. Zero dependencies on SwiftData, SwiftUI, or Foundation beyond basic math. This makes it independently unit-testable.

The web app's FSRS implementation is ~100 lines of core algorithm + ~200 lines of suggestion computation. The Swift port should be similarly compact.

## 1. Constants (FSRSEngine.swift)

Port the 17 FSRS v4 weights and desired retention directly:

```swift
enum FSRSConstants {
    /// FSRS v4 weights (w0..w16)
    static let W: [Double] = [
        0.4, 0.6, 2.4, 5.8,   // w0-w3: initial stability for Again/Hard/Good/Easy
        4.93,                   // w4: initial difficulty mean
        0.94,                   // w5: initial difficulty modifier
        0.86,                   // w6: difficulty reversion towards mean
        0.01,                   // w7: difficulty mean reversion weight
        1.49,                   // w8: stability increase base
        0.14,                   // w9: stability penalty for difficulty
        0.94,                   // w10: stability bonus for low retrievability
        2.18,                   // w11: fail stability base
        0.05,                   // w12: fail stability difficulty factor
        0.34,                   // w13: fail stability previous-stability factor
        1.26,                   // w14: fail stability retrievability factor
        0.29,                   // w15: hard multiplier
        2.61,                   // w16: easy multiplier
    ]

    static let desiredRetention: Double = 0.9
    static let maxIntervalDays: Int = 14
}
```

## 2. Core Formulas (FSRSEngine.swift)

Each function maps 1:1 to its JavaScript counterpart. Port these as static functions on an `FSRSEngine` enum (namespace):

### 2.1 `retrievability(t:S:) → Double`
```
R(t, S) = (1 + t / (9 × S))^(-1)
```
- Web source: `fsrs.js` line ~65
- Guard: if `S <= 0` return `0`
- Input: `t` = elapsed days (Double), `S` = stability (Double)
- Output: 0.0–1.0

### 2.2 `nextInterval(S:) → Int`
```
I(S) = max(1, round(9 × S × (1/R - 1)))
```
- Web source: `fsrs.js` line ~70
- Where `R = desiredRetention = 0.9`
- Guard: if `S <= 0` return `1`
- Output: integer days

### 2.3 `initStability(grade:) → Double`
```
S₀ = W[grade.rawValue - 1]     // w0=Again, w1=Hard, w2=Good, w3=Easy
```

### 2.4 `initDifficulty(grade:) → Double`
```
D₀ = clamp(W[4] - (grade - 3) × W[5], 1, 10)
```

### 2.5 `updateDifficulty(D:grade:) → Double`
```
D' = W[7] × W[4] + (1 - W[7]) × (D - W[6] × (grade - 3))
D' = clamp(D', 1, 10)
```

### 2.6 `updateStabilitySuccess(D:S:R:grade:) → Double`
```
modifier = W[15] if grade==2, W[16] if grade==4, 1.0 if grade==3
S' = S × (exp(W[8]) × (11 - D) × S^(-W[9]) × (exp(W[10] × (1 - R)) - 1) × modifier + 1)
```

### 2.7 `updateStabilityFail(D:S:R:) → Double`
```
S' = W[11] × D^(-W[12]) × ((S + 1)^W[13] - 1) × exp(W[14] × (1 - R))
```

### 2.8 `processReview(card:grade:reviewDate:) → CardState`

The main entry point. Direct port of `fsrs.js processReview()`:

```
Input:  card (CardState? — nil for first review), grade (FSRSGrade), reviewDate (Date)
Output: CardState

if card == nil || card.reps == 0:
    return CardState(
        stability: initStability(grade),
        difficulty: initDifficulty(grade),
        lastReview: reviewDate,
        reps: 1
    )

elapsedDays = max(0, (reviewDate - card.lastReview) / dayInSeconds)
R = retrievability(t: elapsedDays, S: card.stability)
newDifficulty = updateDifficulty(D: card.difficulty, grade: grade)
newStability = (grade == .again)
    ? updateStabilityFail(D:S:R:)
    : updateStabilitySuccess(D:S:R:grade:)

return CardState(
    stability: max(0.1, newStability),
    difficulty: newDifficulty,
    lastReview: reviewDate,
    reps: card.reps + 1
)
```

## 3. Snapshot Management (SnapshotManager.swift)

An `@Observable` class that owns the in-memory verse snapshot and provides incremental + full rebuild operations.

```swift
@Observable
final class SnapshotManager {
    /// The verse FSRS snapshot: "surahNum:verseNum" → CardState
    private(set) var snapshot: [String: CardState] = [:]

    private let quranData: QuranDataManager

    init(quranData: QuranDataManager) {
        self.quranData = quranData
    }
}
```

### 3.1 `applyRevision(_:)` — Incremental Update

Port of `fsrs.js applyRevisionToSnapshot()`:

```
1. Get grade = FSRSGrade.from(quality: revision.quality)
2. Get verses = quranData.versesInRange(revision's range)
3. For each verse:
   a. key = "\(surahNum):\(verseNum)"
   b. card = snapshot[key]   // nil if first time
   c. snapshot[key] = FSRSEngine.processReview(card: card, grade: grade, reviewDate: revision.createdAt)
```

Used when: Adding a new revision (fast, O(verse count in range))

### 3.2 `rebuildFromRevisions(_:)` — Full Rebuild

Port of `fsrs.js rebuildSnapshot()`:

```
1. snapshot = [:]
2. Sort revisions by createdAt ascending
3. For each revision: applyRevision(revision)
```

Used when: App launch, editing a past revision, deleting a revision, importing data

### 3.3 Snapshot Invalidation

When SwiftData syncs new revisions from iCloud:
- Listen for `NSPersistentStoreRemoteChange` notification
- Trigger `rebuildFromRevisions()` with all current revisions
- This ensures the local snapshot reflects the latest state from all devices

## 4. Unit Test Plan (FSRSEngineTests.swift)

Critical tests to verify the port matches the web app:

| Test | Validates |
|---|---|
| `testFirstReviewEachGrade` | `processReview(nil, grade, date)` returns correct initial S and D for grades 1–4 |
| `testRetrievabilityDecay` | `retrievability(0, 1.0)` == 1.0, decays over time, `retrievability(t, 0)` == 0 |
| `testNextInterval` | `nextInterval(1.0)` == 1, `nextInterval(10.0)` == 11, boundary cases |
| `testStabilityIncreaseOnSuccess` | After good review, stability increases |
| `testStabilityDecreasesOnFail` | After "again" review, stability drops |
| `testDifficultyClamp` | Difficulty stays within [1, 10] |
| `testMultipleReviews` | Sequence of reviews matches web app output |
| `testQualityToGrade` | Quality 1→Again, 2→Hard, 3→Good, 4→Good, 5→Easy |
| `testMaxInterval14Days` | `min(nextInterval(S), 14)` never exceeds 14 |

**Verification strategy**: Run identical review sequences through both the JS and Swift implementations and compare CardState outputs. Use the web app's test data for regression testing.

## 5. Key Differences from JavaScript

| Aspect | JavaScript | Swift |
|---|---|---|
| Date math | `(date1 - date2) / (1000*60*60*24)` | `date1.timeIntervalSince(date2) / 86400` |
| Grade type | integer 1–4 | `FSRSGrade` enum |
| Card state | plain object `{}` | `CardState` struct (value type) |
| Null card | `null` | `nil` (optional `CardState?`) |
| Clamp | custom function | `min(max(val, lo), hi)` or Swift `clamp` |
| Snapshot | mutable JS object | `[String: CardState]` dictionary |
| Exports | ES module exports | Swift `public` access |
