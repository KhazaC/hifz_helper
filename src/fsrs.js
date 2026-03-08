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
 * Parse a verse string like "5" or "5.2" into a comparable number.
 * "5.2" → 5.2 so fractional positions sort correctly.
 */
function verseNum(v) {
  return Number(v)
}

/**
 * Compare two (surah, verse) positions.
 * Returns negative if a < b, 0 if equal, positive if a > b.
 */
function comparePositions(surahA, verseA, surahB, verseB) {
  const sA = Number(surahA)
  const sB = Number(surahB)
  if (sA !== sB) return sA - sB
  return verseNum(verseA) - verseNum(verseB)
}

/**
 * Get all verses in a surah:verse range by scanning verseData pages.
 * Returns an array of { surahNum, verseNum }.
 */
function getVersesInRange(startSurah, startVerse, endSurah, endVerse, verseData) {
  if (!verseData || !verseData.pages) return []
  const s0 = Number(startSurah)
  const v0 = Math.floor(Number(startVerse))
  const s1 = Number(endSurah)
  const v1 = Math.floor(Number(endVerse))
  const result = []
  for (const page of Object.values(verseData.pages)) {
    if (!page.verses) continue
    for (const v of page.verses) {
      if (
        comparePositions(s0, v0, v.surahNum, v.verseNum) <= 0 &&
        comparePositions(v.surahNum, v.verseNum, s1, v1) <= 0
      ) {
        result.push(v)
      }
    }
  }
  return result
}

/**
 * Get individual verses for a memorized entry from verseData.
 * Full-page entries use the page's verse list; partial entries scan by range.
 * Returns an array of { surahNum, verseNum }.
 */
function getEntryVerses(entry, verseData) {
  if (!verseData || !verseData.pages) return []
  if (entry.pageNum) {
    const page = verseData.pages[String(entry.pageNum)]
    if (!page || !page.verses) return []
    return page.verses
  }
  return getVersesInRange(entry.startSurah, entry.startVerse, entry.endSurah, entry.endVerse, verseData)
}

// === Per-verse FSRS snapshot management ===

/**
 * Apply a single revision to the verse FSRS snapshot (mutates snapshot).
 * Updates the FSRS card state for each verse in the revision's range.
 *
 * @param {object} snapshot - Map of "surahNum:verseNum" → { stability, difficulty, lastReview, reps }
 * @param {object} revision - Revision with startSurah, startVerse, endSurah, endVerse, quality, createdAt
 * @param {object} verseData - verse_data.json
 */
export function applyRevisionToSnapshot(snapshot, revision, verseData) {
  if (!verseData || !verseData.pages) return
  const grade = qualityToGrade(revision.quality)
  const verses = getVersesInRange(
    revision.startSurah, revision.startVerse,
    revision.endSurah, revision.endVerse, verseData
  )
  for (const v of verses) {
    const key = `${v.surahNum}:${v.verseNum}`
    const card = snapshot[key] || null
    snapshot[key] = processReview(card, grade, revision.createdAt)
  }
}

/**
 * Rebuild the entire verse FSRS snapshot from scratch by replaying all
 * revisions in chronological order. Use after edit/delete of past revisions
 * or data import.
 *
 * @param {Array} revisions - All revision entries
 * @param {object} verseData - verse_data.json
 * @returns {object} Fresh snapshot: "surahNum:verseNum" → card state
 */
export function rebuildSnapshot(revisions, verseData) {
  if (!verseData || !verseData.pages) return {}
  const snapshot = {}
  const sorted = [...revisions].sort(
    (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
  )
  for (const rev of sorted) {
    applyRevisionToSnapshot(snapshot, rev, verseData)
  }
  return snapshot
}

// === Suggestion computation (reads from snapshot) ===

/**
 * Compute FSRS suggestions from the pre-built per-verse snapshot.
 * Reads card states directly — no revision replay needed.
 *
 * Each verse on a page is tracked independently. A page is "due" when any
 * of its verses has dueIn ≤ 0. Displayed retention and review counts are
 * averages across all verses on the page.
 *
 * @param {Array} memorized - Page-level memorization entries (from mergeByPage)
 * @param {object} verseSnapshot - Pre-built snapshot: "surahNum:verseNum" → card state
 * @param {object|null} verseData - verse_data.json (pages → verses)
 * @returns {Array} Suggestions sorted by most urgent first
 */
export function computeSuggestions(memorized, verseSnapshot, verseData) {
  const now = new Date()
  const MAX_INTERVAL_DAYS = 14
  const DAY_MS = 1000 * 60 * 60 * 24
  if (!verseSnapshot) verseSnapshot = {}

  const suggestions = []

  for (const entry of memorized) {
    const key = sectionKey(entry)
    const verses = getEntryVerses(entry, verseData)

    // ---- Fallback: no verse data → look up start verse in snapshot ----
    if (verses.length === 0) {
      const vKey = `${entry.startSurah}:${Math.floor(Number(entry.startVerse))}`
      const card = verseSnapshot[vKey]
      if (!card) {
        suggestions.push({
          ...entry, key, stability: 0, difficulty: 5, retrievability: 0,
          daysSinceReview: null, dueIn: 0, overdueDays: Infinity,
          totalReviews: 0, lastQuality: null, reviewedVerses: 0, totalVerses: 1,
        })
      } else {
        const d = (now - new Date(card.lastReview)) / DAY_MS
        const R = retrievability(d, card.stability)
        const interval = Math.min(nextInterval(card.stability), MAX_INTERVAL_DAYS)
        suggestions.push({
          ...entry, key,
          stability: card.stability, difficulty: card.difficulty, retrievability: R,
          daysSinceReview: Math.round(d * 10) / 10,
          dueIn: Math.round((interval - d) * 10) / 10,
          overdueDays: Math.round(-(interval - d) * 10) / 10,
          totalReviews: card.reps, lastQuality: null,
          reviewedVerses: 1, totalVerses: 1,
        })
      }
      continue
    }

    // ---- Per-verse: look up card states from snapshot (O(1) per verse) ----
    const verseStates = verses.map(v => {
      const vKey = `${v.surahNum}:${v.verseNum}`
      const card = verseSnapshot[vKey]
      if (!card) {
        return { reviewed: false, retrievability: 0, dueIn: 0, totalReviews: 0, lastReviewDate: null, stability: 0 }
      }
      const d = (now - new Date(card.lastReview)) / DAY_MS
      const R = retrievability(d, card.stability)
      const interval = Math.min(nextInterval(card.stability), MAX_INTERVAL_DAYS)
      return {
        reviewed: true, retrievability: R,
        dueIn: interval - d,
        totalReviews: card.reps,
        lastReviewDate: card.lastReview,
        stability: card.stability,
      }
    })

    // ---- Aggregate to page level ----
    const totalVerses   = verseStates.length
    const reviewedVerses = verseStates.filter(vs => vs.reviewed).length
    const avgRetention   = verseStates.reduce((s, vs) => s + vs.retrievability, 0) / totalVerses
    const avgReviews     = verseStates.reduce((s, vs) => s + vs.totalReviews, 0) / totalVerses
    const avgStability   = verseStates.reduce((s, vs) => s + vs.stability, 0) / totalVerses
    const minDueIn       = Math.min(...verseStates.map(vs => vs.dueIn))

    // daysSinceReview = time since the most-stale reviewed verse
    const reviewedOnly = verseStates.filter(vs => vs.reviewed)
    const daysSinceReview = reviewedOnly.length > 0
      ? Math.max(...reviewedOnly.map(vs => (now - new Date(vs.lastReviewDate)) / DAY_MS))
      : null

    suggestions.push({
      ...entry,
      key,
      stability: avgStability,
      difficulty: 5,
      retrievability: avgRetention,
      daysSinceReview: daysSinceReview !== null ? Math.round(daysSinceReview * 10) / 10 : null,
      dueIn: Math.round(minDueIn * 10) / 10,
      overdueDays: Math.round(-minDueIn * 10) / 10,
      totalReviews: Math.round(avgReviews * 10) / 10,
      lastQuality: null,
      reviewedVerses,
      totalVerses,
    })
  }

  // Sort: never-reviewed first, then lowest retention, then most overdue
  suggestions.sort((a, b) => {
    if (a.reviewedVerses === 0 && b.reviewedVerses > 0) return -1
    if (b.reviewedVerses === 0 && a.reviewedVerses > 0) return 1
    if (a.retrievability !== b.retrievability) return a.retrievability - b.retrievability
    return b.overdueDays - a.overdueDays
  })

  return suggestions
}
