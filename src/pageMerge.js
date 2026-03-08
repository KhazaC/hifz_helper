/**
 * Page-based merging for old memorization entries.
 *
 * Uses verse_data.json to determine which page(s) each entry spans,
 * then merges entries that share the same page into a single combined entry.
 */

/**
 * Build a lookup: (surahNum, verseNum) → pageNum
 * from the verse_data pages object.
 */
export function buildVersesToPageMap(verseData) {
  const map = {} // "surah:verse" → pageNum
  for (const [pageNum, pageInfo] of Object.entries(verseData.pages)) {
    for (const v of pageInfo.verses) {
      map[`${v.surahNum}:${v.verseNum}`] = Number(pageNum)
    }
  }
  return map
}

/**
 * Parse a verse string like "5" or "5.2" into its integer verse number.
 * "5.2" means partway through verse 5, so the integer verse is 5.
 */
function verseInt(verseStr) {
  return Math.floor(Number(verseStr))
}

/**
 * Get all pages that an entry spans.
 * Returns a sorted array of page numbers.
 */
function getPagesForEntry(entry, verseToPage) {
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
function getPageBounds(pageNum, verseData) {
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
 * Merge old entries that share the same page into combined page-level entries.
 *
 * For each page that has entries, the merged entry spans the full page bounds
 * (or the actual min/max of the entries on that page if they don't cover
 * the whole page — but since the goal is to revise by page, we use page bounds).
 *
 * The merged entry keeps the earliest createdAt from its source entries,
 * and collects source entry IDs for reference.
 *
 * @param {Array} oldEntries - Entries that are >= 21 days old
 * @param {object} verseData - The verse_data.json object
 * @returns {Array} Merged entries grouped by page
 */
export function mergeByPage(oldEntries, verseData) {
  if (!verseData || !verseData.pages || oldEntries.length === 0) return oldEntries

  const verseToPage = buildVersesToPageMap(verseData)

  // Map page → list of entries on that page
  const pageGroups = {} // pageNum → { entries: [], bounds }

  for (const entry of oldEntries) {
    const pages = getPagesForEntry(entry, verseToPage)
    for (const pageNum of pages) {
      if (!pageGroups[pageNum]) {
        pageGroups[pageNum] = { entries: [] }
      }
      pageGroups[pageNum].entries.push(entry)
    }
  }

  // Build merged entries
  const merged = []
  const sortedPages = Object.keys(pageGroups).map(Number).sort((a, b) => a - b)

  for (const pageNum of sortedPages) {
    const group = pageGroups[pageNum]
    const bounds = getPageBounds(pageNum, verseData)
    if (!bounds) continue

    // Use the earliest createdAt from source entries
    const earliestCreated = group.entries.reduce((min, e) => {
      const d = new Date(e.createdAt)
      return d < min ? d : min
    }, new Date(group.entries[0].createdAt))

    // Use the latest updatedAt
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
  }

  return merged
}
