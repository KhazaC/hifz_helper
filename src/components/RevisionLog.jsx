import { useState, useMemo, memo } from 'react'
import { qualityLabels, isoToLocalDate } from '../constants'

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
 * Displays the revision log with collapsibility, pagination, and filters.
 */
const RevisionLog = memo(function RevisionLog({
  revisions,
  formatEntry,
  onEdit,
  onDelete,
  surahs,
}) {
  const [isOpen, setIsOpen] = useState(true)
  const [showCount, setShowCount] = useState(5)
  const [filterSurah, setFilterSurah] = useState('')
  const [filterQuality, setFilterQuality] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  const toggle = () => setIsOpen(prev => !prev)

  const confirmDelete = (id) => {
    if (window.confirm('Delete this revision entry?')) {
      onDelete(id)
    }
  }

  const hasActiveFilters = filterSurah || filterQuality || filterDateFrom || filterDateTo

  const filteredRevisions = useMemo(() => {
    let result = revisions
    if (filterSurah) {
      const s = Number(filterSurah)
      result = result.filter(r => {
        const rs = Number(r.startSurah)
        const re = Number(r.endSurah)
        return s >= rs && s <= re
      })
    }
    if (filterQuality) {
      const q = Number(filterQuality)
      result = result.filter(r => r.quality === q)
    }
    if (filterDateFrom) {
      result = result.filter(r => isoToLocalDate(r.createdAt) >= filterDateFrom)
    }
    if (filterDateTo) {
      result = result.filter(r => isoToLocalDate(r.createdAt) <= filterDateTo)
    }
    return result
  }, [revisions, filterSurah, filterQuality, filterDateFrom, filterDateTo])

  const clearFilters = () => {
    setFilterSurah('')
    setFilterQuality('')
    setFilterDateFrom('')
    setFilterDateTo('')
  }

  return (
    <div className="entries">
      <h2
        className="section-header"
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        onClick={toggle}
        onKeyDown={handleKeyActivate(toggle)}
      >
        <span className="toggle-icon">{isOpen ? '▾' : '▸'}</span>
        Revision Log ({revisions.length})
      </h2>
      {isOpen && (
        <>
          <div className="log-filter-toggle">
            <button className="filter-toggle-btn" onClick={() => setShowFilters(prev => !prev)}>
              {showFilters ? 'Hide Filters' : 'Filters'}
              {hasActiveFilters && <span className="filter-active-dot" />}
            </button>
            {hasActiveFilters && (
              <button className="filter-clear-btn" onClick={clearFilters}>Clear</button>
            )}
            {hasActiveFilters && (
              <span className="filter-count">{filteredRevisions.length} of {revisions.length}</span>
            )}
          </div>
          {showFilters && (
            <div className="log-filters">
              <div className="filter-row">
                <div className="filter-group">
                  <label>Surah</label>
                  <select value={filterSurah} onChange={e => setFilterSurah(e.target.value)}>
                    <option value="">All</option>
                    {surahs && surahs.map(s => (
                      <option key={s.num} value={s.num}>{s.num}. {s.name}</option>
                    ))}
                  </select>
                </div>
                <div className="filter-group">
                  <label>Quality</label>
                  <select value={filterQuality} onChange={e => setFilterQuality(e.target.value)}>
                    <option value="">All</option>
                    {[1, 2, 3, 4, 5].map(q => (
                      <option key={q} value={q}>{q} – {qualityLabels[q]}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="filter-row">
                <div className="filter-group">
                  <label>From</label>
                  <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
                </div>
                <div className="filter-group">
                  <label>To</label>
                  <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
                </div>
              </div>
            </div>
          )}
          {filteredRevisions.length === 0 && <p className="empty">
            {hasActiveFilters ? 'No revisions match the filters.' : 'No revisions yet.'}
          </p>}
          {filteredRevisions.slice(0, showCount).map(rev => (
            <div key={rev.id} className="entry-card">
              <div className="entry-info">
                <strong>{formatEntry(rev)}</strong>
                <span className="entry-meta">
                  Quality: <span className={`quality-badge q${rev.quality}`}>{rev.quality} – {qualityLabels[rev.quality]}</span>
                  {' · '}
                  {new Date(rev.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div className="entry-actions">
                <button onClick={() => onEdit(rev)} className="edit-btn">Edit</button>
                <button onClick={() => confirmDelete(rev.id)} className="delete-btn">Delete</button>
              </div>
            </div>
          ))}
          {filteredRevisions.length > showCount && (
            <button className="show-more-btn" onClick={() => setShowCount(c => c + 10)}>
              Show more ({filteredRevisions.length - showCount} remaining)
            </button>
          )}
          {showCount > 5 && (
            <button className="show-more-btn" onClick={() => setShowCount(5)}>
              Show less
            </button>
          )}
        </>
      )}
    </div>
  )
})

export default RevisionLog
