import Foundation

/// FSRS v4 (Free Spaced Repetition Scheduler) — pure Swift implementation.
///
/// Ported from `src/fsrs.js`. All functions are stateless and side-effect free.
/// Reference: https://github.com/open-spaced-repetition/fsrs4anki
enum FSRSEngine {

    // MARK: - Weights

    /// Default FSRS v4 parameters (w0…w16).
    static let W: [Double] = [
        0.4, 0.6, 2.4, 5.8,  // w0–w3: initial stability for Again/Hard/Good/Easy
        4.93,                  // w4: initial difficulty mean
        0.94,                  // w5: initial difficulty modifier
        0.86,                  // w6: difficulty reversion towards mean
        0.01,                  // w7: difficulty mean reversion weight
        1.49,                  // w8: stability increase base
        0.14,                  // w9: stability penalty for difficulty
        0.94,                  // w10: stability bonus for low retrievability
        2.18,                  // w11: fail stability base
        0.05,                  // w12: fail stability difficulty factor
        0.34,                  // w13: fail stability previous-stability factor
        1.26,                  // w14: fail stability retrievability factor
        0.29,                  // w15: hard multiplier
        2.61,                  // w16: easy multiplier
    ]

    // MARK: - Core Functions

    /// Initial stability for a given grade (uses w0…w3).
    static func initStability(grade: FSRSGrade) -> Double {
        W[grade.rawValue - 1]
    }

    /// Initial difficulty for a given grade, clamped to 1…10.
    static func initDifficulty(grade: FSRSGrade) -> Double {
        clamp(W[4] - Double(grade.rawValue - 3) * W[5], min: 1, max: 10)
    }

    /// Retrievability after `t` days with stability `S`.
    /// Returns 0…1 representing probability of recall.
    static func retrievability(t: Double, S: Double) -> Double {
        guard S > 0 else { return 0 }
        return pow(1 + t / (9 * S), -1)
    }

    /// Next interval in days for a given stability and desired retention.
    static func nextInterval(S: Double) -> Int {
        guard S > 0 else { return 1 }
        return max(1, Int(round(9 * S * (1 / AppConstants.desiredRetention - 1))))
    }

    /// Update difficulty after a review, with mean reversion.
    static func updateDifficulty(D: Double, grade: FSRSGrade) -> Double {
        let D0_3 = W[4] // mean difficulty (for grade 3)
        let newD = W[7] * D0_3 + (1 - W[7]) * (D - W[6] * (Double(grade.rawValue) - 3))
        return clamp(newD, min: 1, max: 10)
    }

    /// Update stability after a successful review (grade ≥ 2).
    static func updateStabilitySuccess(D: Double, S: Double, R: Double, grade: FSRSGrade) -> Double {
        var hardEasyMod = 1.0
        if grade == .hard { hardEasyMod = W[15] }
        if grade == .easy { hardEasyMod = W[16] }

        return S * (
            exp(W[8]) *
            (11 - D) *
            pow(S, -W[9]) *
            (exp(W[10] * (1 - R)) - 1) *
            hardEasyMod +
            1
        )
    }

    /// Update stability after a failed review (grade = Again).
    static func updateStabilityFail(D: Double, S: Double, R: Double) -> Double {
        W[11] *
        pow(D, -W[12]) *
        (pow(S + 1, W[13]) - 1) *
        exp(W[14] * (1 - R))
    }

    // MARK: - Process Review

    /// Process a single review and return the updated card state.
    ///
    /// - Parameters:
    ///   - card: Current card state, or `nil` for a first review.
    ///   - grade: FSRS grade (1–4).
    ///   - reviewDate: Date of the review.
    /// - Returns: Updated `CardState`.
    static func processReview(card: CardState?, grade: FSRSGrade, reviewDate: Date) -> CardState {
        guard let card, card.reps > 0 else {
            // First review
            return CardState(
                stability: initStability(grade: grade),
                difficulty: initDifficulty(grade: grade),
                lastReview: reviewDate,
                reps: 1
            )
        }

        let elapsedDays = max(0, reviewDate.timeIntervalSince(card.lastReview) / (60 * 60 * 24))
        let R = retrievability(t: elapsedDays, S: card.stability)

        let newDifficulty = updateDifficulty(D: card.difficulty, grade: grade)
        let newStability: Double
        if grade == .again {
            newStability = updateStabilityFail(D: card.difficulty, S: card.stability, R: R)
        } else {
            newStability = updateStabilitySuccess(D: card.difficulty, S: card.stability, R: R, grade: grade)
        }

        return CardState(
            stability: max(0.1, newStability),
            difficulty: newDifficulty,
            lastReview: reviewDate,
            reps: card.reps + 1
        )
    }

    // MARK: - Helpers

    private static func clamp(_ val: Double, min: Double, max: Double) -> Double {
        Swift.min(Swift.max(val, min), max)
    }
}
