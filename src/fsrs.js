/**
 * FSRS v4 (Free Spaced Repetition Scheduler) implementation.
 *
 * Reference: https://github.com/open-spaced-repetition/fsrs4anki
 *
 * Grades: 1 = Again, 2 = Hard, 3 = Good, 4 = Easy
 * We map the user's 5-point quality scale → FSRS 4-point grade:
 *   Quality 1 (Poor)  → Again (1)
 *   Quality 2 (Weak)  → Hard  (2)
 *   Quality 3 (Okay)  → Good  (3)
 *   Quality 4 (Good)  → Good  (3)
 *   Quality 5 (Solid) → Easy  (4)
 */

// Default FSRS v4 parameters (w0..w16)
const W = [
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

const DESIRED_RETENTION = 0.9

/** Map 5-point quality to FSRS grade (1-4) */
export function qualityToGrade(quality) {
  if (quality <= 1) return 1 // Again
  if (quality === 2) return 2 // Hard
  if (quality <= 4) return 3 // Good
  return 4 // Easy
}

/** Clamp value between min and max */
function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max)
}

/** Initial stability for a given grade */
function initStability(grade) {
  return W[grade - 1] // w0..w3
}

/** Initial difficulty for a given grade */
function initDifficulty(grade) {
  return clamp(W[4] - (grade - 3) * W[5], 1, 10)
}

/** Retrievability after t days with stability S */
export function retrievability(t, S) {
  if (S <= 0) return 0
  return Math.pow(1 + t / (9 * S), -1)
}

/** Next interval in days for a given stability and desired retention */
export function nextInterval(S) {
  if (S <= 0) return 1
  return Math.max(1, Math.round(9 * S * (1 / DESIRED_RETENTION - 1)))
}

/** Update difficulty after a review */
function updateDifficulty(D, grade) {
  const D0_3 = W[4] // mean difficulty (for grade 3)
  const newD = W[7] * D0_3 + (1 - W[7]) * (D - W[6] * (grade - 3))
  return clamp(newD, 1, 10)
}

/** Update stability after a successful review (grade >= 2) */
function updateStabilitySuccess(D, S, R, grade) {
  let hardEasyMod = 1
  if (grade === 2) hardEasyMod = W[15]
  if (grade === 4) hardEasyMod = W[16]

  return S * (
    Math.exp(W[8]) *
    (11 - D) *
    Math.pow(S, -W[9]) *
    (Math.exp(W[10] * (1 - R)) - 1) *
    hardEasyMod +
    1
  )
}

/** Update stability after a failed review (grade = 1, Again) */
function updateStabilityFail(D, S, R) {
  return W[11] *
    Math.pow(D, -W[12]) *
    (Math.pow(S + 1, W[13]) - 1) *
    Math.exp(W[14] * (1 - R))
}

/**
 * Process a single review and return updated card state.
 *
 * @param {object|null} card - Current state { stability, difficulty, lastReview, reps }
 *                             null if this is the first review
 * @param {number} grade - FSRS grade (1-4)
 * @param {string} reviewDate - ISO date string of the review
 * @returns {object} Updated card state
 */
export function processReview(card, grade, reviewDate) {
  const reviewMs = new Date(reviewDate).getTime()

  if (!card || card.reps === 0) {
    // First review
    return {
      stability: initStability(grade),
      difficulty: initDifficulty(grade),
      lastReview: reviewDate,
      reps: 1,
    }
  }

  const lastMs = new Date(card.lastReview).getTime()
  const elapsedDays = Math.max(0, (reviewMs - lastMs) / (1000 * 60 * 60 * 24))
  const R = retrievability(elapsedDays, card.stability)

  const newDifficulty = updateDifficulty(card.difficulty, grade)
  const newStability = grade === 1
    ? updateStabilityFail(card.difficulty, card.stability, R)
    : updateStabilitySuccess(card.difficulty, card.stability, R, grade)

  return {
    stability: Math.max(0.1, newStability),
    difficulty: newDifficulty,
    lastReview: reviewDate,
    reps: card.reps + 1,
  }
}

/**
 * Build a unique key for a memorized section so we can group revisions.
 */
export function sectionKey(entry) {
  return `${entry.startSurah}:${entry.startVerse}-${entry.endSurah}:${entry.endVerse}`
}

/**
 * Given all memorization entries and all revision logs,
 * compute FSRS state for each memorized section and return
 * suggestions sorted by urgency.
 *
 * @param {Array} memorized - Memorization entries
 * @param {Array} revisions - Revision log entries (with quality 1-5)
 * @returns {Array} Suggestions sorted by most overdue first
 */
export function computeSuggestions(memorized, revisions) {
  const now = new Date()
  const MAX_INTERVAL_DAYS = 14 // all old memorization must be revised at least every 14 days

  // Group revisions by section key, sorted by date
  const revsBySection = {}
  for (const rev of revisions) {
    const key = sectionKey(rev)
    if (!revsBySection[key]) revsBySection[key] = []
    revsBySection[key].push(rev)
  }
  // Sort each section's revisions chronologically
  for (const key of Object.keys(revsBySection)) {
    revsBySection[key].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
  }

  const suggestions = []

  for (const entry of memorized) {
    const key = sectionKey(entry)
    const sectionRevs = revsBySection[key] || []

    // Replay all reviews through FSRS
    let card = null
    for (const rev of sectionRevs) {
      const grade = qualityToGrade(rev.quality)
      card = processReview(card, grade, rev.createdAt)
    }

    if (!card) {
      // Never revised → treat as brand new, due immediately
      suggestions.push({
        ...entry,
        key,
        stability: 0,
        difficulty: 5,
        retrievability: 0,
        daysSinceReview: null,
        dueIn: 0, // due now
        overdueDays: Infinity,
        totalReviews: 0,
        lastQuality: null,
      })
      continue
    }

    const daysSinceReview = (now - new Date(card.lastReview)) / (1000 * 60 * 60 * 24)
    const R = retrievability(daysSinceReview, card.stability)
    const fsrsInterval = nextInterval(card.stability)
    // Hard cap: every section must be revised at least every 14 days
    const interval = Math.min(fsrsInterval, MAX_INTERVAL_DAYS)
    const daysUntilDue = interval - daysSinceReview
    const lastRev = sectionRevs[sectionRevs.length - 1]

    suggestions.push({
      ...entry,
      key,
      stability: card.stability,
      difficulty: card.difficulty,
      retrievability: R,
      daysSinceReview: Math.round(daysSinceReview * 10) / 10,
      dueIn: Math.round(daysUntilDue * 10) / 10,
      overdueDays: -daysUntilDue, // positive = overdue
      totalReviews: card.reps,
      lastQuality: lastRev?.quality ?? null,
    })
  }

  // Sort: retention ASC, then overdue DESC, never-reviewed first
  suggestions.sort((a, b) => {
    // Never-reviewed items first
    if (a.totalReviews === 0 && b.totalReviews > 0) return -1
    if (b.totalReviews === 0 && a.totalReviews > 0) return 1
    // Lowest retention first
    if (a.retrievability !== b.retrievability) return a.retrievability - b.retrievability
    // Then most overdue first
    return b.overdueDays - a.overdueDays
  })

  return suggestions
}
