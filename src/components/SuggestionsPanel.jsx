import { useState, useMemo, memo } from 'react'
import { NEW_PERIOD_DAYS, qualityLabels } from '../constants'

/** Helper: keyboard handler for Enter/Space on clickable non-button elements */
function handleKeyActivate(handler) {
  return (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handler()
    }
  }
}

/**
 * Check if a new memorization entry has been revised today.
 * Uses range overlap: if ANY revision from today overlaps the entry's range, consider it done.
 */
function hasRevisionToday(entry, revisions) {
  const today = new Date().toISOString().slice(0, 10)
  const eStart = { s: Number(entry.startSurah), v: Math.floor(Number(entry.startVerse)) }
  const eEnd = { s: Number(entry.endSurah), v: Math.floor(Number(entry.endVerse)) }
  return revisions.some(r => {
    if (r.createdAt.slice(0, 10) !== today) return false
    const rStart = { s: Number(r.startSurah), v: Math.floor(Number(r.startVerse)) }
    const rEnd = { s: Number(r.endSurah), v: Math.floor(Number(r.endVerse)) }
    // Overlap: not (rEnd < eStart or rStart > eEnd)
    const rEndBefore = rEnd.s < eStart.s || (rEnd.s === eStart.s && rEnd.v < eStart.v)
    const rStartAfter = rStart.s > eEnd.s || (rStart.s === eEnd.s && rStart.v > eEnd.v)
    return !(rEndBefore || rStartAfter)
  })
}

/**
 * Inline quick-log menu — quality + optional date, rendered inside a suggestion card.
 */
function InlineRevisionMenu({ entry, onSubmit, onCancel }) {
  const todayStr = new Date().toISOString().slice(0, 10)
  const [quality, setQuality] = useState('3')
  const [date, setDate] = useState(todayStr)
  const [showDate, setShowDate] = useState(false)

  const handleSubmit = () => {
    onSubmit({
      id: crypto.randomUUID(),
      startSurah: Number(entry.startSurah),
      startVerse: String(entry.startVerse),
      endSurah: Number(entry.endSurah),
      endVerse: String(entry.endVerse),
      quality: Number(quality),
      createdAt: new Date(date + 'T00:00:00').toISOString(),
      updatedAt: new Date().toISOString(),
    })
  }

  return (
    <div className="inline-revision-menu" onClick={(e) => e.stopPropagation()}>
      <div className="inline-quality-row">
        {[1, 2, 3, 4, 5].map(q => (
          <button
            key={q}
            className={`quality-chip ${Number(quality) === q ? 'selected' : ''}`}
            onClick={() => setQuality(String(q))}
            title={qualityLabels[q]}
          >
            {q}
          </button>
        ))}
      </div>
      {showDate ? (
        <div className="inline-date-row">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            max={todayStr}
          />
        </div>
      ) : (
        <button className="inline-date-toggle" onClick={() => setShowDate(true)}>Change date</button>
      )}
      <div className="inline-actions">
        <button className="inline-submit" onClick={handleSubmit}>Submit</button>
        <button className="inline-cancel" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

/** Format a verse group for display: "V.1-5" or "V.1" */
function formatVerseRange(group) {
  if (group.startVerse === group.endVerse) return `V.${group.startVerse}`
  return `V.${group.startVerse}–${group.endVerse}`
}

/**
 * Today's Revision Suggestions panel.
 * Shows new memorization (grouped by surah), old memorization (grouped by surah → page → verses).
 */
const SuggestionsPanel = memo(function SuggestionsPanel({
  entries,
  newEntries,
  surahSuggestions,
  revisions,
  formatEntry,
  getSurahName,
  onLogRevision,
}) {
  const [sectionOpen, setSectionOpen] = useState({ new: true, old: true, coming: true })
  const [expandedSurahs, setExpandedSurahs] = useState({})
  const [openMenuKey, setOpenMenuKey] = useState(null)

  const toggle = (key) => setSectionOpen(prev => ({ ...prev, [key]: !prev[key] }))
  const toggleSurah = (key) => {
    setExpandedSurahs(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const handleLogClick = (menuKey) => {
    setOpenMenuKey(prev => prev === menuKey ? null : menuKey)
  }

  const handleInlineSubmit = (revision) => {
    onLogRevision(revision)
    setOpenMenuKey(null)
  }

  // Filter new entries: hide those revised today, then group by surah
  const newEntriesBySurah = useMemo(() => {
    // First, filter out already-revised entries
    const filtered = newEntries.filter(e => !revisions || !hasRevisionToday(e, revisions))
    if (filtered.length === 0) return []

    // Group by surah (entries that span surahs go under the start surah)
    const surahMap = {}
    for (const entry of filtered) {
      const surahNum = Number(entry.startSurah)
      if (!surahMap[surahNum]) surahMap[surahNum] = []
      surahMap[surahNum].push(entry)
    }

    return Object.entries(surahMap)
      .map(([surahNumStr, entries]) => {
        const surahNum = Number(surahNumStr)
        // Sort chunks by start verse
        entries.sort((a, b) => Number(a.startVerse) - Number(b.startVerse))
        const minDays = Math.min(...entries.map(e => e.daysRemaining))
        const maxDays = Math.max(...entries.map(e => e.daysRemaining))
        // Compute whole-surah bounds (min start → max end across all chunks)
        const minStart = entries.reduce((m, e) => Math.min(m, Number(e.startVerse)), Infinity)
        const maxEnd = entries.reduce((m, e) => Math.max(m, Number(e.endVerse)), -Infinity)
        return {
          surahNum,
          entries,
          minDays,
          maxDays,
          // For InlineRevisionMenu — covers all memorized chunks in this surah
          startSurah: surahNum,
          endSurah: Number(entries[entries.length - 1].endSurah),
          startVerse: String(minStart),
          endVerse: String(maxEnd),
        }
      })
      .sort((a, b) => a.surahNum - b.surahNum)
  }, [newEntries, revisions])

  const visibleNewEntryCount = useMemo(
    () => newEntriesBySurah.reduce((sum, g) => sum + g.entries.length, 0),
    [newEntriesBySurah]
  )

  // Split surah suggestions into due and upcoming
  const dueSurahs = useMemo(
    () => surahSuggestions.filter(s => s.isDue),
    [surahSuggestions]
  )

  // Collect upcoming verse groups across all surahs, sorted by dueIn, limited to 5
  const upcomingGroups = useMemo(() => {
    const groups = []
    for (const surah of surahSuggestions) {
      for (const g of surah.upcomingGroups) {
        groups.push({ ...g, surahName: getSurahName(surah.surahNum) })
      }
    }
    groups.sort((a, b) => a.minDueIn - b.minDueIn)
    return groups.slice(0, 5)
  }, [surahSuggestions, getSurahName])

  const totalDueGroups = useMemo(
    () => dueSurahs.reduce((sum, s) => sum + s.totalDueGroups, 0),
    [dueSurahs]
  )

  return (
    <div className="suggestions-panel">
      <h2>Today&apos;s Revision Suggestions</h2>
      {entries.length === 0 && <p className="empty">Add memorized sections to get suggestions.</p>}

      {/* ── New Memorization ── */}
      {visibleNewEntryCount > 0 && (
        <>
          <h3
            className="section-header"
            role="button"
            tabIndex={0}
            aria-expanded={sectionOpen.new}
            onClick={() => toggle('new')}
            onKeyDown={handleKeyActivate(() => toggle('new'))}
          >
            <span className="expand-icon">{sectionOpen.new ? '▾' : '▸'}</span>
            New Memorization (daily for {NEW_PERIOD_DAYS} days) — {visibleNewEntryCount} entries
          </h3>
          {sectionOpen.new && newEntriesBySurah.map(surahGroup => {
            const isExpanded = expandedSurahs[`new-${surahGroup.surahNum}`]
            const surahMenuKey = `new-surah-${surahGroup.surahNum}`
            return (
              <div key={surahGroup.surahNum} className="surah-group new-surah-group">
                <div className="surah-group-header">
                  <div
                    className="surah-group-title"
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded}
                    onClick={() => toggleSurah(`new-${surahGroup.surahNum}`)}
                    onKeyDown={handleKeyActivate(() => toggleSurah(`new-${surahGroup.surahNum}`))}
                  >
                    <span className="expand-icon">{isExpanded ? '▾' : '▸'}</span>
                    <strong>{getSurahName(surahGroup.surahNum)}</strong>
                    <span className="surah-group-meta">
                      {surahGroup.entries.length} section{surahGroup.entries.length !== 1 ? 's' : ''}
                      {' · '}{surahGroup.minDays === surahGroup.maxDays ? `${surahGroup.minDays}d left` : `${surahGroup.minDays}–${surahGroup.maxDays}d left`}
                    </span>
                  </div>
                  <button className="revise-btn" onClick={(e) => { e.stopPropagation(); handleLogClick(surahMenuKey) }}>
                    {openMenuKey === surahMenuKey ? '✕' : 'Log Revision'}
                  </button>
                </div>
                {openMenuKey === surahMenuKey && (
                  <div className="surah-group-menu">
                    <InlineRevisionMenu entry={surahGroup} onSubmit={handleInlineSubmit} onCancel={() => setOpenMenuKey(null)} />
                  </div>
                )}
                {isExpanded && (
                  <div className="surah-group-entries">
                    {surahGroup.entries.map(entry => {
                      const ek = entry.id
                      return (
                        <div key={entry.id} className="suggestion-card new-memorization nested">
                          <div className="suggestion-info">
                            <strong>{formatEntry(entry)}</strong>
                            <div className="suggestion-meta">
                              <span className="tag new-period-tag">
                                Day {Math.ceil(entry.ageDays) || 1} of {NEW_PERIOD_DAYS}
                              </span>
                              <span>{entry.daysRemaining}d remaining</span>
                            </div>
                          </div>
                          <button className="revise-btn" onClick={(e) => { e.stopPropagation(); handleLogClick(ek) }}>
                            {openMenuKey === ek ? '✕' : 'Log Revision'}
                          </button>
                          {openMenuKey === ek && (
                            <InlineRevisionMenu entry={entry} onSubmit={handleInlineSubmit} onCancel={() => setOpenMenuKey(null)} />
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </>
      )}

      {/* ── Old Memorization (Surah-based FSRS) ── */}
      {surahSuggestions.length > 0 && (
        <>
          <h3
            className="section-header"
            role="button"
            tabIndex={0}
            aria-expanded={sectionOpen.old}
            onClick={() => toggle('old')}
            onKeyDown={handleKeyActivate(() => toggle('old'))}
          >
            <span className="expand-icon">{sectionOpen.old ? '▾' : '▸'}</span>
            Old Memorization (FSRS) — {totalDueGroups} due across {dueSurahs.length} surah{dueSurahs.length !== 1 ? 's' : ''}
          </h3>
          {sectionOpen.old && (
            <>
              {dueSurahs.length === 0 && (
                <p className="all-caught-up">All caught up! No old sections due right now.</p>
              )}
              {dueSurahs.map(surah => {
                const isExpanded = expandedSurahs[surah.surahNum]
                const surahMenuKey = `surah-${surah.surahNum}`
                return (
                  <div key={surah.surahNum} className="surah-group">
                    <div className="surah-group-header">
                      <div
                        className="surah-group-title"
                        role="button"
                        tabIndex={0}
                        aria-expanded={isExpanded}
                        onClick={() => toggleSurah(surah.surahNum)}
                        onKeyDown={handleKeyActivate(() => toggleSurah(surah.surahNum))}
                      >
                        <span className="expand-icon">{isExpanded ? '▾' : '▸'}</span>
                        <strong>{getSurahName(surah.surahNum)}</strong>
                        <span className="surah-group-meta">
                          {surah.totalDueGroups} due
                          {' · '}Retention: {Math.round(surah.avgRetention * 100)}%
                        </span>
                      </div>
                      <button className="revise-btn" onClick={(e) => { e.stopPropagation(); handleLogClick(surahMenuKey) }}>
                        {openMenuKey === surahMenuKey ? '✕' : 'Log Revision'}
                      </button>
                    </div>
                    {openMenuKey === surahMenuKey && (
                      <div className="surah-group-menu">
                        <InlineRevisionMenu entry={surah} onSubmit={handleInlineSubmit} onCancel={() => setOpenMenuKey(null)} />
                      </div>
                    )}
                    {isExpanded && (
                      <div className="surah-group-entries">
                        {surah.dueGroups.map(group => {
                          const gKey = `due-${surah.surahNum}-${group.pageNum}-${group.startVerse}`
                          return (
                            <div key={gKey} className={`suggestion-card ${group.reviewedVerses === 0 ? 'never-reviewed' : 'overdue'}`}>
                              <div className="suggestion-info">
                                <strong>
                                  <span className="page-badge">p.{group.pageNum}</span>
                                  {formatVerseRange(group)}
                                </strong>
                                <div className="suggestion-meta">
                                  {group.reviewedVerses === 0 ? (
                                    <span className="tag new-tag">Never revised</span>
                                  ) : (
                                    <>
                                      {group.overdueDays > 0 && (
                                        <span className="tag overdue-tag">
                                          {Math.round(group.overdueDays)}d overdue
                                        </span>
                                      )}
                                      {group.reviewedVerses < group.totalVerses && (
                                        <span className="tag new-tag">
                                          {group.totalVerses - group.reviewedVerses} unreviewed
                                        </span>
                                      )}
                                      <span>Retention: {Math.round(group.avgRetention * 100)}%</span>
                                      <span>{group.reviewedVerses}/{group.totalVerses} verses · ~{group.avgReviews} avg reviews</span>
                                    </>
                                  )}
                                </div>
                              </div>
                              <button className="revise-btn" onClick={() => handleLogClick(gKey)}>
                                {openMenuKey === gKey ? '✕' : 'Log Revision'}
                              </button>
                              {openMenuKey === gKey && (
                                <InlineRevisionMenu entry={group} onSubmit={handleInlineSubmit} onCancel={() => setOpenMenuKey(null)} />
                              )}
                            </div>
                          )
                        })}
                        {surah.upcomingGroups.length > 0 && (
                          <div className="surah-upcoming-divider">
                            <span>Upcoming in this surah</span>
                          </div>
                        )}
                        {surah.upcomingGroups.map(group => {
                          const gKey = `up-${surah.surahNum}-${group.pageNum}-${group.startVerse}`
                          return (
                            <div key={gKey} className="suggestion-card upcoming">
                              <div className="suggestion-info">
                                <strong>
                                  <span className="page-badge">p.{group.pageNum}</span>
                                  {formatVerseRange(group)}
                                </strong>
                                <div className="suggestion-meta">
                                  <span className="tag upcoming-tag">Due in {Math.round(group.minDueIn)}d</span>
                                  <span>Retention: {Math.round(group.avgRetention * 100)}%</span>
                                  <span>{group.reviewedVerses}/{group.totalVerses} verses · ~{group.avgReviews} avg reviews</span>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Coming Up: upcoming groups from surahs with nothing due */}
              {upcomingGroups.length > 0 && (
                <>
                  <h3
                    className="section-header"
                    role="button"
                    tabIndex={0}
                    aria-expanded={sectionOpen.coming}
                    onClick={() => toggle('coming')}
                    onKeyDown={handleKeyActivate(() => toggle('coming'))}
                  >
                    <span className="expand-icon">{sectionOpen.coming ? '▾' : '▸'}</span>
                    Coming Up — {upcomingGroups.length} entries
                  </h3>
                  {sectionOpen.coming && upcomingGroups.map(group => {
                    const gKey = `coming-${group.surahNum}-${group.pageNum}-${group.startVerse}`
                    return (
                      <div key={gKey} className="suggestion-card upcoming">
                        <div className="suggestion-info">
                          <strong>
                            {group.surahName}
                            {' '}<span className="page-badge">p.{group.pageNum}</span>
                            {' '}{formatVerseRange(group)}
                          </strong>
                          <div className="suggestion-meta">
                            <span className="tag upcoming-tag">Due in {Math.round(group.minDueIn)}d</span>
                            <span>Retention: {Math.round(group.avgRetention * 100)}%</span>
                            <span>{group.reviewedVerses}/{group.totalVerses} verses · ~{group.avgReviews} avg reviews</span>
                          </div>
                        </div>
                        <button className="revise-btn" onClick={() => handleLogClick(gKey)}>
                          {openMenuKey === gKey ? '✕' : 'Log Revision'}
                        </button>
                        {openMenuKey === gKey && (
                          <InlineRevisionMenu entry={group} onSubmit={handleInlineSubmit} onCancel={() => setOpenMenuKey(null)} />
                        )}
                      </div>
                    )
                  })}
                </>
              )}
            </>
          )}
        </>
      )}

      {entries.length > 0 && visibleNewEntryCount === 0 && totalDueGroups === 0 && (
        <p className="all-caught-up">All caught up! Nothing due for revision right now.</p>
      )}
    </div>
  )
})

export default SuggestionsPanel
