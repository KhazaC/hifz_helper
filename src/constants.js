export const NEW_PERIOD_REVISIONS = 21

export const SCHEMA_VERSION = 2

export const STORAGE_KEYS = {
  ENTRIES: 'quran-memorization-entries',
  REVISIONS: 'quran-revision-entries',
  VERSE_STATES: 'quran-verse-fsrs-state',
  SCHEMA: 'quran-tracker-schema-version',
}

export const qualityLabels = {
  1: 'Poor',
  2: 'Weak',
  3: 'Okay',
  4: 'Good',
  5: 'Solid',
}

/** Get today's date as "YYYY-MM-DD" in the user's local timezone. */
export function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Extract the local date portion "YYYY-MM-DD" from an ISO datetime string. */
export function isoToLocalDate(isoStr) {
  const d = new Date(isoStr)
  return localDateStr(d)
}
