import { useState } from 'react'
import { qualityLabels } from '../constants'

/**
 * Displays the revision log with collapsibility and pagination.
 */
export default function RevisionLog({
  revisions,
  formatEntry,
  onEdit,
  onDelete,
  sectionOpen,
  toggleSection,
}) {
  const [showCount, setShowCount] = useState(5)

  return (
    <div className="entries">
      <h2 className="section-header" onClick={() => toggleSection('revLog')}>
        <span className="toggle-icon">{sectionOpen.revLog ? '▾' : '▸'}</span>
        Revision Log ({revisions.length})
      </h2>
      {sectionOpen.revLog && (
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
                <button onClick={() => onDelete(rev.id)} className="delete-btn">Delete</button>
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
}
