import XCTest
@testable import QuranTracker

final class FSRSEngineTests: XCTestCase {

    // MARK: - Grade Mapping

    func testGradeFromQuality() {
        XCTAssertEqual(FSRSGrade.from(quality: 1), .again)
        XCTAssertEqual(FSRSGrade.from(quality: 2), .hard)
        XCTAssertEqual(FSRSGrade.from(quality: 3), .good)
        XCTAssertEqual(FSRSGrade.from(quality: 4), .good)
        XCTAssertEqual(FSRSGrade.from(quality: 5), .easy)
        XCTAssertEqual(FSRSGrade.from(quality: 0), .again)
    }

    // MARK: - Initial Stability

    func testInitStabilityAllGrades() {
        // W[0]=0.4, W[1]=0.6, W[2]=2.4, W[3]=5.8
        let sAgain = FSRSEngine.initStability(grade: .again) // max(0.1, W[0])
        let sHard  = FSRSEngine.initStability(grade: .hard)  // max(0.1, W[1])
        let sGood  = FSRSEngine.initStability(grade: .good)  // max(0.1, W[2])
        let sEasy  = FSRSEngine.initStability(grade: .easy)  // max(0.1, W[3])

        XCTAssertEqual(sAgain, 0.4, accuracy: 0.001)
        XCTAssertEqual(sHard, 0.6, accuracy: 0.001)
        XCTAssertEqual(sGood, 2.4, accuracy: 0.001)
        XCTAssertEqual(sEasy, 5.8, accuracy: 0.001)

        // Must be monotonically increasing
        XCTAssertLessThan(sAgain, sHard)
        XCTAssertLessThan(sHard, sGood)
        XCTAssertLessThan(sGood, sEasy)
    }

    // MARK: - Initial Difficulty

    func testInitDifficulty() {
        // D0 = W[4] - (grade-3) * W[5], clamped to [1, 10]
        // W[4]=4.93, W[5]=0.94
        let dAgain = FSRSEngine.initDifficulty(grade: .again) // 4.93 - (1-3)*0.94 = 4.93 + 1.88 = 6.81
        let dGood  = FSRSEngine.initDifficulty(grade: .good)  // 4.93 - (3-3)*0.94 = 4.93
        let dEasy  = FSRSEngine.initDifficulty(grade: .easy)  // 4.93 - (4-3)*0.94 = 3.99

        XCTAssertEqual(dAgain, 6.81, accuracy: 0.01)
        XCTAssertEqual(dGood, 4.93, accuracy: 0.01)
        XCTAssertEqual(dEasy, 3.99, accuracy: 0.01)

        // Harder grades should have higher difficulty
        XCTAssertGreaterThan(dAgain, dGood)
        XCTAssertGreaterThan(dGood, dEasy)
    }

    // MARK: - Retrievability

    func testRetrievabilityAtZeroDays() {
        // R(0, S) should be 1.0 (just reviewed)
        let r = FSRSEngine.retrievability(t: 0, S: 5.0)
        XCTAssertEqual(r, 1.0, accuracy: 0.001)
    }

    func testRetrievabilityDecays() {
        let r1 = FSRSEngine.retrievability(t: 1, S: 5.0)
        let r5 = FSRSEngine.retrievability(t: 5, S: 5.0)
        let r10 = FSRSEngine.retrievability(t: 10, S: 5.0)

        XCTAssertLessThan(r10, r5)
        XCTAssertLessThan(r5, r1)
        XCTAssertLessThan(r1, 1.0)
        XCTAssertGreaterThan(r10, 0.0)
    }

    func testRetrievabilityHigherStabilitySlowerDecay() {
        let rLowS  = FSRSEngine.retrievability(t: 5, S: 2.0)
        let rHighS = FSRSEngine.retrievability(t: 5, S: 10.0)
        XCTAssertGreaterThan(rHighS, rLowS)
    }

    // MARK: - Next Interval

    func testNextInterval() {
        // I(S) = S * 9 * (1/R - 1)  where R = DESIRED_RETENTION = 0.9
        // For S=5: I = 5 * 9 * (1/0.9 - 1) = 5 * 9 * 0.111 ≈ 5.0
        let interval = FSRSEngine.nextInterval(S: 5.0)
        XCTAssertEqual(Double(interval), 5.0, accuracy: 0.5)
        XCTAssertGreaterThan(interval, 0)
    }

    func testNextIntervalMinimumOne() {
        let interval = FSRSEngine.nextInterval(S: 0.01)
        XCTAssertGreaterThanOrEqual(interval, 1)
    }

    // MARK: - Process Review (First Review)

    func testFirstReview() {
        let card = FSRSEngine.processReview(card: nil, grade: .good, reviewDate: Date())

        XCTAssertEqual(card.stability, FSRSEngine.initStability(grade: .good), accuracy: 0.001)
        XCTAssertEqual(card.difficulty, FSRSEngine.initDifficulty(grade: .good), accuracy: 0.001)
        XCTAssertEqual(card.reps, 1)
    }

    func testFirstReviewAllGrades() {
        let grades: [FSRSGrade] = [.again, .hard, .good, .easy]
        for grade in grades {
            let card = FSRSEngine.processReview(card: nil, grade: grade, reviewDate: Date())
            XCTAssertEqual(card.reps, 1)
            XCTAssertEqual(card.stability, FSRSEngine.initStability(grade: grade), accuracy: 0.001)
        }
    }

    // MARK: - Process Review (Subsequent Reviews)

    func testSubsequentReviewIncreasesReps() {
        let date1 = DateHelpers.parseISO("2024-01-01T12:00:00.000Z")!
        let date2 = DateHelpers.parseISO("2024-01-03T12:00:00.000Z")!

        let card1 = FSRSEngine.processReview(card: nil, grade: .good, reviewDate: date1)
        XCTAssertEqual(card1.reps, 1)

        let card2 = FSRSEngine.processReview(card: card1, grade: .good, reviewDate: date2)
        XCTAssertEqual(card2.reps, 2)
    }

    func testAgainReviewReducesStability() {
        let date1 = DateHelpers.parseISO("2024-01-01T12:00:00.000Z")!
        let date2 = DateHelpers.parseISO("2024-01-05T12:00:00.000Z")!

        let card1 = FSRSEngine.processReview(card: nil, grade: .good, reviewDate: date1)
        let cardAfterAgain = FSRSEngine.processReview(card: card1, grade: .again, reviewDate: date2)

        // After "again", stability should be lower (fail path)
        XCTAssertLessThan(cardAfterAgain.stability, card1.stability)
    }

    func testGoodReviewMaintainsOrIncreasesStability() {
        let date1 = DateHelpers.parseISO("2024-01-01T12:00:00.000Z")!
        let date2 = DateHelpers.parseISO("2024-01-05T12:00:00.000Z")!

        let card1 = FSRSEngine.processReview(card: nil, grade: .good, reviewDate: date1)
        let card2 = FSRSEngine.processReview(card: card1, grade: .good, reviewDate: date2)

        // After a good review with some elapsed time, stability should grow
        XCTAssertGreaterThanOrEqual(card2.stability, card1.stability)
    }

    // MARK: - Date Helpers Integration

    func testDateStringFormat() {
        let date = DateHelpers.parseISO("2024-06-15T10:30:00.000Z")!
        let str = DateHelpers.dateString(date)
        // Should be in YYYY-MM-DD format in local timezone
        XCTAssertTrue(str.contains("2024"))
        XCTAssertEqual(str.count, 10) // "YYYY-MM-DD"
    }

    func testDaysBetween() {
        let d1 = DateHelpers.parseISO("2024-01-01T12:00:00.000Z")!
        let d2 = DateHelpers.parseISO("2024-01-06T12:00:00.000Z")!
        let days = DateHelpers.daysBetween(d1, d2)
        XCTAssertEqual(days, 5)
    }
}
