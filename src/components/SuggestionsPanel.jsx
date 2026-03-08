import { useState, memo } from 'react'
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

/** Unique key for a suggestion/entry to track which inline menu is open */
function entryKey(entry) {
  return entry.key || entry.id
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
      startVerse: entry.startVerse,
      endSurah: Number(entry.endSurah),
      endVerse: entry.endVerse,
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

/**
 * Today's Revision Suggestions panel.
 * Shows new memorization (grouped by surah), FSRS due items, and upcoming items.
 */
const SuggestionsPanel = memo(function SuggestionsPanel({
  entries,
  newEntries,
  mergedOldEntries,
  dueFsrs,
  upcomingFsrs,
  formatEntry,
  newEntriesByPage,
  pageMap,
  onLogRevision,
}) {
  /** Look up Quran page number for an entry */
  const getPageNum = (entry) => {
    if (entry.pageNum) return entry.pageNum
    if (!pageMap) return null
    const sv = Math.floor(Number(entry.startVerse))
    return pageMap[`${entry.startSurah}:${sv}`] || null
  }
  const [sectionOpen, setSectionOpen] = useState({ new: true, old: true, coming: true })
  const [expandedPages, setExpandedPages] = useState({})
  const [openMenuKey, setOpenMenuKey] = useState(null)

  const toggle = (key) => setSectionOpen(prev => ({ ...prev, [key]: !prev[key] }))
  const togglePage = (pageNum) => {
    setExpandedPages(prev => ({ ...prev, [pageNum]: !prev[pageNum] }))
  }

  const handleLogClick = (entry) => {
    setOpenMenuKey(prev => prev === entryKey(entry) ? null : entryKey(entry))
  }

  const handleInlineSubmit = (revision) => {
    onLogRevision(revision)
    setOpenMenuKey(null)
  }

  return (
    <div className="suggestions-panel">
      <h2>Today's Revision Suggestions</h2>
      {entries.length === 0 && <p className="empty">Add memorized sections to get suggestions.</p>}

      {newEntries.length > 0 && (
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
            New Memorization (daily for {NEW_PERIOD_DAYS} days) — {newEntries.length} entries
          </h3>
          {sectionOpen.new && newEntriesByPage.map(group => {
            const isExpanded = expandedPages[group.pageNum]
            const minDays = Math.min(...group.entries.map(e => e.daysRemaining))
            const maxDays = Math.max(...group.entries.map(e => e.daysRemaining))
            const pageMenuKey = `page-${group.pageNum}`
            return (
              <div key={group.pageNum} className="page-group">
                <div className="page-group-header">
                  <div
                    className="page-group-title"
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded}
                    onClick={() => togglePage(group.pageNum)}
                    onKeyDown={handleKeyActivate(() => togglePage(group.pageNum))}
                  >
                    <span className="expand-icon">{isExpanded ? '▾' : '▸'}</span>
                    <span className="page-badge">p.{group.pageNum}</span>
                    {group.bounds && <strong className="page-group-range">{formatEntry(group.bounds)}</strong>}
                    <span className="page-group-meta">
                      {group.entries.length} section{group.entries.length !== 1 ? 's' : ''}
                      {' · '}{minDays === maxDays ? `${minDays}d left` : `${minDays}–${maxDays}d left`}
                    </span>
                  </div>
                  <button className="revise-btn" onClick={(e) => { e.stopPropagation(); setOpenMenuKey(prev => prev === pageMenuKey ? null : pageMenuKey) }}>
                    {openMenuKey === pageMenuKey ? '✕' : 'Log Revision'}
                  </button>
                </div>
                {openMenuKey === pageMenuKey && group.bounds && (
                  <InlineRevisionMenu entry={group.bounds} onSubmit={handleInlineSubmit} onCancel={() => setOpenMenuKey(null)} />
                )}
                {isExpanded && (
                  <div className="page-group-entries">
                    {group.entries.map(entry => {
                      const ek = entryKey(entry)
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
                        <button className="revise-btn" onClick={(e) => { e.stopPropagation(); handleLogClick(entry) }}>
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

      {mergedOldEntries.length > 0 && (
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
            Old Memorization (FSRS) — {dueFsrs.length} due
          </h3>
          {sectionOpen.old && (
            <>
              {dueFsrs.length === 0 && (
                <p className="all-caught-up">All caught up! No old sections due right now.</p>
              )}
              {dueFsrs.map(s => {
                const pg = getPageNum(s)
                return (
                <div key={s.key} className={`suggestion-card ${s.reviewedVerses === 0 ? 'never-reviewed' : 'overdue'}`}>
                  <div className="suggestion-info">
                    <strong>{pg && <span className="page-badge">p.{pg}</span>}{formatEntry(s)}</strong>
                    <div className="suggestion-meta">
                      {s.reviewedVerses === 0 ? (
                        <span className="tag new-tag">Never revised</span>
                      ) : (
                        <>
                          {s.overdueDays > 0 && (
                            <span className="tag overdue-tag">
                              {Math.round(s.overdueDays)}d overdue
                            </span>
                          )}
                          {s.reviewedVerses < s.totalVerses && (
                            <span className="tag new-tag">
                              {s.totalVerses - s.reviewedVerses} unreviewed
                            </span>
                          )}
                          <span>Retention: {Math.round(s.retrievability * 100)}%</span>
                          <span>{s.reviewedVerses}/{s.totalVerses} verses · ~{s.totalReviews} avg reviews</span>
                          {/* {s.lastQuality && (
                            <span className={`quality-badge q${s.lastQuality}`}>
                              Last: {s.lastQuality} – {qualityLabels[s.lastQuality]}
                            </span>
                          )} */}
                        </>
                      )}
                    </div>
                  </div>
                  <button className="revise-btn" onClick={() => handleLogClick(s)}>
                    {openMenuKey === entryKey(s) ? '✕' : 'Log Revision'}
                  </button>
                  {openMenuKey === entryKey(s) && (
                    <InlineRevisionMenu entry={s} onSubmit={handleInlineSubmit} onCancel={() => setOpenMenuKey(null)} />
                  )}
                </div>
                )
              })}
              {upcomingFsrs.length > 0 && (
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
                    Coming Up — {upcomingFsrs.length} entries
                  </h3>
                  {sectionOpen.coming && upcomingFsrs.map(s => {
                    const pg = getPageNum(s)
                    return (
                    <div key={s.key} className="suggestion-card upcoming">
                      <div className="suggestion-info">
                        <strong>{pg && <span className="page-badge">p.{pg}</span>}{formatEntry(s)}</strong>
                        <div className="suggestion-meta">
                          <span className="tag upcoming-tag">Due in {Math.round(s.dueIn)}d</span>
                          <span>Retention: {Math.round(s.retrievability * 100)}%</span>
                          <span>{s.reviewedVerses}/{s.totalVerses} verses · ~{s.totalReviews} avg reviews</span>
                        </div>
                      </div>
                      <button className="revise-btn" onClick={() => handleLogClick(s)}>
                        {openMenuKey === entryKey(s) ? '✕' : 'Log Revision'}
                      </button>
                      {openMenuKey === entryKey(s) && (
                        <InlineRevisionMenu entry={s} onSubmit={handleInlineSubmit} onCancel={() => setOpenMenuKey(null)} />
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

      {entries.length > 0 && newEntries.length === 0 && dueFsrs.length === 0 && (
        <p className="all-caught-up">All caught up! Nothing due for revision right now.</p>
      )}
    </div>
  )
})

export default SuggestionsPanel
