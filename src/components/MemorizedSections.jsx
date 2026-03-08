import { useState, memo } from 'react'

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
 * Displays memorized sections split into New and Old (merged by page),
 * with collapsible subsections and pagination.
 */
const MemorizedSections = memo(function MemorizedSections({
  entries,
  newEntries,
  oldEntries,
  mergedOldEntries,
  formatEntry,
  onEdit,
  onDelete,
}) {
  const [sectionOpen, setSectionOpen] = useState({ memorized: true, newMem: true, oldMem: true })
  const [newShowCount, setNewShowCount] = useState(5)
  const [oldShowCount, setOldShowCount] = useState(5)

  const toggle = (key) => setSectionOpen(prev => ({ ...prev, [key]: !prev[key] }))

  const confirmDelete = (id) => {
    if (window.confirm('Delete this memorized section?')) {
      onDelete(id)
    }
  }

  return (
    <div className="entries">
      <h2
        className="section-header"
        role="button"
        tabIndex={0}
        aria-expanded={sectionOpen.memorized}
        onClick={() => toggle('memorized')}
        onKeyDown={handleKeyActivate(() => toggle('memorized'))}
      >
        <span className="toggle-icon">{sectionOpen.memorized ? '▾' : '▸'}</span>
        Memorized Sections ({entries.length})
      </h2>
      {sectionOpen.memorized && (
        <>
          {entries.length === 0 && <p className="empty">No entries yet. Start logging!</p>}

          {newEntries.length > 0 && (
            <>
              <h3
                className="bucket-label section-header"
                role="button"
                tabIndex={0}
                aria-expanded={sectionOpen.newMem}
                onClick={() => toggle('newMem')}
                onKeyDown={handleKeyActivate(() => toggle('newMem'))}
              >
                <span className="toggle-icon">{sectionOpen.newMem ? '▾' : '▸'}</span>
                New ({newEntries.length})
              </h3>
              {sectionOpen.newMem && (
                <>
                  {newEntries.slice(0, newShowCount).map(entry => (
                    <div key={entry.id} className="entry-card new-entry-card">
                      <div className="entry-info">
                        <strong>{formatEntry(entry)}</strong>
                        <span className="entry-date">
                          {new Date(entry.createdAt).toLocaleDateString()}
                          {' · '}
                          <span className="new-badge">{entry.daysRemaining}d left</span>
                        </span>
                      </div>
                      <div className="entry-actions">
                        <button onClick={() => onEdit(entry)} className="edit-btn">Edit</button>
                        <button onClick={() => confirmDelete(entry.id)} className="delete-btn">Delete</button>
                      </div>
                    </div>
                  ))}
                  {newEntries.length > newShowCount && (
                    <button className="show-more-btn" onClick={() => setNewShowCount(c => c + 10)}>
                      Show more ({newEntries.length - newShowCount} remaining)
                    </button>
                  )}
                  {newShowCount > 5 && (
                    <button className="show-more-btn" onClick={() => setNewShowCount(5)}>
                      Show less
                    </button>
                  )}
                </>
              )}
            </>
          )}

          {oldEntries.length > 0 && (
            <>
              <h3
                className="bucket-label section-header"
                role="button"
                tabIndex={0}
                aria-expanded={sectionOpen.oldMem}
                onClick={() => toggle('oldMem')}
                onKeyDown={handleKeyActivate(() => toggle('oldMem'))}
              >
                <span className="toggle-icon">{sectionOpen.oldMem ? '▾' : '▸'}</span>
                Old ({mergedOldEntries.length} items from {oldEntries.length} entries)
              </h3>
              {sectionOpen.oldMem && (
                <>
                  {mergedOldEntries.slice(0, oldShowCount).map(entry => (
                    <div key={entry.id} className="entry-card">
                      <div className="entry-info">
                        <strong>
                          {entry.pageNum ? `Page ${entry.pageNum}: ` : ''}
                          {formatEntry(entry)}
                        </strong>
                        <span className="entry-date">
                          {new Date(entry.createdAt).toLocaleDateString()}
                          {entry.sourceCount > 1 && (
                            <span className="merge-badge"> · merged from {entry.sourceCount} entries</span>
                          )}
                        </span>
                      </div>
                    </div>
                  ))}
                  {mergedOldEntries.length > oldShowCount && (
                    <button className="show-more-btn" onClick={() => setOldShowCount(c => c + 10)}>
                      Show more ({mergedOldEntries.length - oldShowCount} remaining)
                    </button>
                  )}
                  {oldShowCount > 5 && (
                    <button className="show-more-btn" onClick={() => setOldShowCount(5)}>
                      Show less
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
})

export default MemorizedSections
