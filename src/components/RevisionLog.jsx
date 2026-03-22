import { useState, memo } from 'react'
import { qualityLabels } from '../constants'

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
 * Displays the revision log with collapsibility and pagination.
 */
const RevisionLog = memo(function RevisionLog({
  revisions,
  formatEntry,
  onEdit,
  onDelete,
}) {
  const [isOpen, setIsOpen] = useState(true)
  const [showCount, setShowCount] = useState(5)

  const toggle = () => setIsOpen(prev => !prev)

  const confirmDelete = (id) => {
    if (window.confirm('Delete this revision entry?')) {
      onDelete(id)
    }
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
          {revisions.length === 0 && <p className="empty">No revisions yet.</p>}
          {revisions.slice(0, showCount).map(rev => (
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
          {revisions.length > showCount && (
            <button className="show-more-btn" onClick={() => setShowCount(c => c + 10)}>
              Show more ({revisions.length - showCount} remaining)
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
