import { useState } from 'react'
import { NEW_PERIOD_DAYS, qualityLabels } from '../constants'

/**
 * Today's Revision Suggestions panel.
 * Shows new memorization (grouped by surah), FSRS due items, and upcoming items.
 */
export default function SuggestionsPanel({
  entries,
  newEntries,
  mergedOldEntries,
  dueFsrs,
  upcomingFsrs,
  formatEntry,
  newEntriesBySurah,
  sectionOpen,
  toggleSection,
}) {
  const [expandedNewSurahs, setExpandedNewSurahs] = useState({})

  const toggleNewSurah = (surahNum) => {
    setExpandedNewSurahs(prev => ({ ...prev, [surahNum]: !prev[surahNum] }))
  }

  return (
    <div className="suggestions-panel">
      <h2>Today's Revision Suggestions</h2>
      {entries.length === 0 && <p className="empty">Add memorized sections to get suggestions.</p>}

      {newEntries.length > 0 && (
        <>
          <h3 className="section-header" onClick={() => toggleSection('new')}>
            <span className="expand-icon">{sectionOpen.new ? '▾' : '▸'}</span>
            New Memorization (daily for {NEW_PERIOD_DAYS} days) — {newEntries.length} entries
          </h3>
          {sectionOpen.new && newEntriesBySurah.map(group => {
            const isExpanded = expandedNewSurahs[group.surahNum]
            const minDays = Math.min(...group.entries.map(e => e.daysRemaining))
            const maxDays = Math.max(...group.entries.map(e => e.daysRemaining))
            const verseRange = group.entries.length === 1
              ? `${group.entries[0].startVerse}–${group.entries[0].endVerse}`
              : `${group.entries[0].startVerse}–${group.entries[group.entries.length - 1].endVerse}`
            return (
              <div key={group.surahNum} className="surah-group">
                <div className="surah-group-header" onClick={() => toggleNewSurah(group.surahNum)}>
                  <span className="expand-icon">{isExpanded ? '▾' : '▸'}</span>
                  <strong>{group.name}</strong>
                  <span className="surah-group-meta">
                    {group.entries.length} section{group.entries.length !== 1 ? 's' : ''}
                    {' · '}v{verseRange}
                    {' · '}{minDays === maxDays ? `${minDays}d left` : `${minDays}–${maxDays}d left`}
                  </span>
                </div>
                {isExpanded && (
                  <div className="surah-group-entries">
                    {group.entries.map(entry => (
                      <div key={entry.id} className="suggestion-card new-memorization nested">
                        <div className="suggestion-info">
                          <strong>v{entry.startVerse}–{entry.endVerse}</strong>
                          <div className="suggestion-meta">
                            <span className="tag new-period-tag">
                              Day {Math.ceil(entry.ageDays) || 1} of {NEW_PERIOD_DAYS}
                            </span>
                            <span>{entry.daysRemaining}d remaining</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </>
      )}

      {mergedOldEntries.length > 0 && (
        <>
          <h3 className="section-header" onClick={() => toggleSection('old')}>
            <span className="expand-icon">{sectionOpen.old ? '▾' : '▸'}</span>
            Old Memorization (FSRS) — {dueFsrs.length} due
          </h3>
          {sectionOpen.old && (
            <>
              {dueFsrs.length === 0 && (
                <p className="all-caught-up">All caught up! No old sections due right now.</p>
              )}
              {dueFsrs.map(s => (
                <div key={s.key} className={`suggestion-card ${s.totalReviews === 0 ? 'never-reviewed' : 'overdue'}`}>
                  <div className="suggestion-info">
                    <strong>{formatEntry(s)}</strong>
                    <div className="suggestion-meta">
                      {s.totalReviews === 0 ? (
                        <span className="tag new-tag">Never revised</span>
                      ) : (
                        <>
                          <span className="tag overdue-tag">
                            {Math.round(s.overdueDays)}d overdue
                          </span>
                          <span>Retention: {Math.round(s.retrievability * 100)}%</span>
                          <span>{s.totalReviews} review{s.totalReviews !== 1 ? 's' : ''}</span>
                          {s.lastQuality && (
                            <span className={`quality-badge q${s.lastQuality}`}>
                              Last: {s.lastQuality} – {qualityLabels[s.lastQuality]}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {upcomingFsrs.length > 0 && (
                <>
                  <h3 className="section-header" onClick={() => toggleSection('coming')}>
                    <span className="expand-icon">{sectionOpen.coming ? '▾' : '▸'}</span>
                    Coming Up — {upcomingFsrs.length} entries
                  </h3>
                  {sectionOpen.coming && upcomingFsrs.map(s => (
                    <div key={s.key} className="suggestion-card upcoming">
                      <div className="suggestion-info">
                        <strong>{formatEntry(s)}</strong>
                        <div className="suggestion-meta">
                          <span className="tag upcoming-tag">Due in {Math.round(s.dueIn)}d</span>
                          <span>Retention: {Math.round(s.retrievability * 100)}%</span>
                          <span>{s.totalReviews} review{s.totalReviews !== 1 ? 's' : ''}</span>
                        </div>
                      </div>
                    </div>
                  ))}
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
}
