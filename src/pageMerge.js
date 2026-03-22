/**
 * Page-based merging for old memorization entries.
 *
 * Uses a pre-built pageMap (surah:verse → pageNum) and verse_data.json
 * to determine which page(s) each entry spans, then merges entries that
 * share the same page into a single combined entry.
 */

/**
 * Parse a verse string like "5" or "5.2" into its integer verse number.
 * "5.2" means partway through verse 5, so the integer verse is 5.
 */
function verseInt(verseStr) {
  return Math.floor(Number(verseStr))
}

/** Check if a verse string is fractional (e.g. "5.2" but not "5" or "5.0"). */
function isFractional(verseStr) {
  const n = Number(verseStr)
  return n !== Math.floor(n)
}

/**
 * Resolve partial-verse overlaps between memorization entries.
 *
 * When Entry A ends at a fractional verse (e.g. "5.2") and a later Entry B
 * begins at the same integer verse (e.g. "5", "5.2", "5.5"), the partial
 * verse is attributed to the later entry (when memorization was completed).
 *
 * - A's endVerse is trimmed to the previous whole verse ("4")
 * - B's startVerse becomes the whole verse ("5")
 * - If trimming A makes it empty (start > end), A is dropped entirely.
 *
 * Also handles the reverse: B starts with a fractional verse that matches
 * A's integer endVerse.
 *
 * This returns NEW entry objects — originals are not mutated.
 */
export function resolvePartialVerses(entries) {
  if (entries.length <= 1) return entries

  // Work on copies sorted by Quran position then by date
  let items = entries.map(e => ({ ...e }))
  items.sort((a, b) => {
    const sd = Number(a.startSurah) - Number(b.startSurah)
    if (sd !== 0) return sd
    const vd = Number(a.startVerse) - Number(b.startVerse)
    if (vd !== 0) return vd
    return new Date(a.createdAt) - new Date(b.createdAt)
  })

  // For each pair of adjacent-in-order entries, resolve fractional overlaps
  for (let i = 0; i < items.length; i++) {
    const a = items[i]
    if (!isFractional(a.endVerse)) continue

    const aEndInt = verseInt(a.endVerse)
    const aEndSurah = Number(a.endSurah)

    // Find the next entry that starts at the same integer verse in the same surah
    for (let j = i + 1; j < items.length; j++) {
      const b = items[j]
      const bStartInt = verseInt(b.startVerse)
      const bStartSurah = Number(b.startSurah)

      if (bStartSurah !== aEndSurah || bStartInt !== aEndInt) continue

      // Found a match — attribute the partial verse to the later entry
      // Trim A's end to the previous whole verse
      const prevVerse = aEndInt - 1
      if (prevVerse < verseInt(a.startVerse) ||
          (Number(a.startSurah) === aEndSurah && prevVerse < verseInt(a.startVerse))) {
        // A becomes empty — mark for removal
        a._remove = true
      } else {
        a.endVerse = String(prevVerse)
      }

      // Extend B's start to the full verse
      b.startVerse = String(aEndInt)
      break
    }
  }

  return items.filter(e => !e._remove)
}

/**
 * Get all pages that an entry spans.
 * Returns a sorted array of page numbers.
 */
export function getPagesForEntry(entry, verseToPage) {
  const pages = new Set()

  const startVerse = verseInt(entry.startVerse)
  const endVerse = verseInt(entry.endVerse)

  if (entry.startSurah === entry.endSurah) {
    // Same surah — iterate verses
    for (let v = startVerse; v <= endVerse; v++) {
      const page = verseToPage[`${entry.startSurah}:${v}`]
      if (page) pages.add(page)
    }
  } else {
    // Spans multiple surahs — get pages for start verse and end verse,
    // and include all pages in between
    const startPage = verseToPage[`${entry.startSurah}:${startVerse}`]
    const endPage = verseToPage[`${entry.endSurah}:${endVerse}`]
    if (startPage && endPage) {
      for (let p = startPage; p <= endPage; p++) {
        pages.add(p)
      }
    }
  }

  return [...pages].sort((a, b) => a - b)
}

/**
 * Given a page number and the verse data, return the first and last verse on that page.
 * Returns { startSurah, startVerse, endSurah, endVerse }
 */
export function getPageBounds(pageNum, verseData) {
  const page = verseData.pages[String(pageNum)]
  if (!page || page.verses.length === 0) return null
  const first = page.verses[0]
  const last = page.verses[page.verses.length - 1]
  return {
    startSurah: first.surahNum,
    startVerse: String(first.verseNum),
    endSurah: last.surahNum,
    endVerse: String(last.verseNum),
  }
}

/**
 * Check whether a specific verse (surahNum, verseNum) is covered by at
 * least one entry in a list.  Uses Math.floor so "5.2" covers verse 5.
 */
function entryCoversVerse(entry, surahNum, verseNum) {
  const s0 = Number(entry.startSurah)
  const v0 = verseInt(entry.startVerse)
  const s1 = Number(entry.endSurah)
  const v1 = verseInt(entry.endVerse)
  if (s0 === s1) {
    return surahNum === s0 && verseNum >= v0 && verseNum <= v1
  }
  // Multi-surah range
  if (surahNum < s0 || surahNum > s1) return false
  if (surahNum === s0) return verseNum >= v0
  if (surahNum === s1) return verseNum <= v1
  return true // surah is strictly between start and end
}

/**
 * Check if a set of entries collectively covers every verse on a page.
 */
function pageFullyCovered(pageNum, entries, verseData) {
  const page = verseData.pages[String(pageNum)]
  if (!page || page.verses.length === 0) return false
  return page.verses.every(v =>
    entries.some(e => entryCoversVerse(e, v.surahNum, v.verseNum))
  )
}

/**
 * Merge old entries that share the same page into combined page-level entries,
 * but only when the entries fully cover every verse on that page.
 * Partial-page entries are returned as-is.
 *
 * @param {Array} oldEntries - Entries that are >= 21 days old
 * @param {object} verseData - The verse_data.json object
 * @param {object} pageMap - Pre-built "surah:verse" → pageNum map (from pageMap.json)
 * @returns {Array} Mix of merged page entries and unmerged partial entries
 */
export function mergeByPage(oldEntries, verseData, pageMap) {
  if (!verseData || !verseData.pages || !pageMap || oldEntries.length === 0) return oldEntries

  // Map page → list of entries touching that page
  const pageGroups = {} // pageNum → { entries: [] }

  for (const entry of oldEntries) {
    const pages = getPagesForEntry(entry, pageMap)
    for (const pageNum of pages) {
      if (!pageGroups[pageNum]) {
        pageGroups[pageNum] = { entries: [] }
      }
      pageGroups[pageNum].entries.push(entry)
    }
  }

  // Track which original entry IDs have been absorbed into a full-page merge
  const consumedIds = new Set()
  const merged = []
  const sortedPages = Object.keys(pageGroups).map(Number).sort((a, b) => a - b)

  for (const pageNum of sortedPages) {
    const group = pageGroups[pageNum]
    const bounds = getPageBounds(pageNum, verseData)
    if (!bounds) continue

    if (!pageFullyCovered(pageNum, group.entries, verseData)) {
      // Page not fully covered — do NOT merge; entries stay as-is
      continue
    }

    // Fully covered — create merged page entry
    const earliestCreated = group.entries.reduce((min, e) => {
      const d = new Date(e.createdAt)
      return d < min ? d : min
    }, new Date(group.entries[0].createdAt))

    const latestUpdated = group.entries.reduce((max, e) => {
      const d = new Date(e.updatedAt || e.createdAt)
      return d > max ? d : max
    }, new Date(group.entries[0].updatedAt || group.entries[0].createdAt))

    merged.push({
      id: `page-${pageNum}`,
      pageNum,
      startSurah: bounds.startSurah,
      startVerse: bounds.startVerse,
      endSurah: bounds.endSurah,
      endVerse: bounds.endVerse,
      createdAt: earliestCreated.toISOString(),
      updatedAt: latestUpdated.toISOString(),
      sourceIds: group.entries.map(e => e.id),
      sourceCount: group.entries.length,
    })

    for (const e of group.entries) consumedIds.add(e.id)
  }

  // Add back any entries that were NOT fully consumed by a page merge
  for (const entry of oldEntries) {
    if (!consumedIds.has(entry.id)) {
      merged.push(entry)
    }
  }

  return merged
}
