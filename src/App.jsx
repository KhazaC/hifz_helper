import { useState, useEffect, useMemo, useCallback } from 'react'
import { computeSuggestions } from './fsrs'
import { mergeByPage } from './pageMerge'
import './App.css'

function App() {
  const [surahs, setSurahs] = useState([])
  const [verseData, setVerseData] = useState(null)
  const [entries, setEntries] = useState(() => {
    const saved = localStorage.getItem('quran-memorization-entries')
    return saved ? JSON.parse(saved) : []
  })
  const [startSurah, setStartSurah] = useState('')
  const [startVerse, setStartVerse] = useState('')
  const [endSurah, setEndSurah] = useState('')
  const [endVerse, setEndVerse] = useState('')
  const [editingId, setEditingId] = useState(null)

  // Revision state
  const [revisions, setRevisions] = useState(() => {
    const saved = localStorage.getItem('quran-revision-entries')
    return saved ? JSON.parse(saved) : []
  })
  const [revStartSurah, setRevStartSurah] = useState('')
  const [revStartVerse, setRevStartVerse] = useState('')
  const [revEndSurah, setRevEndSurah] = useState('')
  const [revEndVerse, setRevEndVerse] = useState('')
  const [revQuality, setRevQuality] = useState('3')
  const [editingRevId, setEditingRevId] = useState(null)
  const [expandedNewSurahs, setExpandedNewSurahs] = useState({})
  const [sectionOpen, setSectionOpen] = useState({ new: true, old: true, coming: true, memorized: true, newMem: true, oldMem: true, revLog: true })
  const [newMemShowCount, setNewMemShowCount] = useState(5)
  const [oldMemShowCount, setOldMemShowCount] = useState(5)
  const [revShowCount, setRevShowCount] = useState(5)

  const toggleSection = (key) => {
    setSectionOpen(prev => ({ ...prev, [key]: !prev[key] }))
  }

  // Load surah data and verse data
  useEffect(() => {
    fetch('/data/surah_index.json')
      .then(res => res.json())
      .then(data => {
        const surahList = Object.entries(data).map(([name, info]) => ({
          num: info.numSurah,
          name,
          numVerses: info.numVerses,
        }))
        surahList.sort((a, b) => a.num - b.num)
        setSurahs(surahList)
      })
    fetch('/data/verse_data.json')
      .then(res => res.json())
      .then(data => setVerseData(data))
  }, [])

  // Save entries to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('quran-memorization-entries', JSON.stringify(entries))
  }, [entries])

  useEffect(() => {
    localStorage.setItem('quran-revision-entries', JSON.stringify(revisions))
  }, [revisions])

  const getMaxVerses = (surahNum) => {
    const surah = surahs.find(s => s.num === Number(surahNum))
    return surah ? surah.numVerses : 999
  }

  const getSurahName = useCallback((surahNum) => {
    const surah = surahs.find(s => s.num === Number(surahNum))
    return surah ? surah.name : `Surah ${surahNum}`
  }, [surahs])

  const formatEntry = (entry) => {
    const startName = getSurahName(entry.startSurah)
    const endName = getSurahName(entry.endSurah)
    if (entry.startSurah === entry.endSurah) {
      return `${startName} — ${entry.startVerse} to ${entry.endVerse}`
    }
    return `${startName} ${entry.startVerse} → ${endName} ${entry.endVerse}`
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!startSurah || !startVerse || !endSurah || !endVerse) return

    const newEntry = {
      id: editingId || Date.now(),
      startSurah: Number(startSurah),
      startVerse,
      endSurah: Number(endSurah),
      endVerse,
      createdAt: editingId
        ? entries.find(e => e.id === editingId)?.createdAt || new Date().toISOString()
        : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    if (editingId) {
      setEntries(prev => prev.map(e => e.id === editingId ? newEntry : e))
      setEditingId(null)
    } else {
      setEntries(prev => [...prev, newEntry])
    }

    setStartSurah('')
    setStartVerse('')
    setEndSurah('')
    setEndVerse('')
  }

  const handleEdit = (entry) => {
    setEditingId(entry.id)
    setStartSurah(String(entry.startSurah))
    setStartVerse(entry.startVerse)
    setEndSurah(String(entry.endSurah))
    setEndVerse(entry.endVerse)
  }

  const handleDelete = (id) => {
    setEntries(prev => prev.filter(e => e.id !== id))
  }

  const handleCancel = () => {
    setEditingId(null)
    setStartSurah('')
    setStartVerse('')
    setEndSurah('')
    setEndVerse('')
  }

  const handleStartSurahChange = (val) => {
    setStartSurah(val)
    if (!endSurah) setEndSurah(val)
  }

  // Revision handlers
  const handleRevSubmit = (e) => {
    e.preventDefault()
    if (!revStartSurah || !revStartVerse || !revEndSurah || !revEndVerse) return

    const newRev = {
      id: editingRevId || Date.now(),
      startSurah: Number(revStartSurah),
      startVerse: revStartVerse,
      endSurah: Number(revEndSurah),
      endVerse: revEndVerse,
      quality: Number(revQuality),
      createdAt: editingRevId
        ? revisions.find(r => r.id === editingRevId)?.createdAt || new Date().toISOString()
        : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    if (editingRevId) {
      setRevisions(prev => prev.map(r => r.id === editingRevId ? newRev : r))
      setEditingRevId(null)
    } else {
      setRevisions(prev => [...prev, newRev])
    }

    setRevStartSurah('')
    setRevStartVerse('')
    setRevEndSurah('')
    setRevEndVerse('')
    setRevQuality('3')
  }

  const handleRevEdit = (rev) => {
    setEditingRevId(rev.id)
    setRevStartSurah(String(rev.startSurah))
    setRevStartVerse(rev.startVerse)
    setRevEndSurah(String(rev.endSurah))
    setRevEndVerse(rev.endVerse)
    setRevQuality(String(rev.quality))
  }

  const handleRevDelete = (id) => {
    setRevisions(prev => prev.filter(r => r.id !== id))
  }

  const handleRevCancel = () => {
    setEditingRevId(null)
    setRevStartSurah('')
    setRevStartVerse('')
    setRevEndSurah('')
    setRevEndVerse('')
    setRevQuality('3')
  }

  const handleRevStartSurahChange = (val) => {
    setRevStartSurah(val)
    if (!revEndSurah) setRevEndSurah(val)
  }

  const qualityLabels = { 1: 'Poor', 2: 'Weak', 3: 'Okay', 4: 'Good', 5: 'Solid' }

  const NEW_PERIOD_DAYS = 21

  // Split entries into new (< 21 days) and old (>= 21 days)
  const { newEntries, oldEntries, mergedOldEntries } = useMemo(() => {
    const now = new Date()
    const newE = []
    const oldE = []
    for (const entry of entries) {
      const ageDays = (now - new Date(entry.createdAt)) / (1000 * 60 * 60 * 24)
      if (ageDays < NEW_PERIOD_DAYS) {
        newE.push({ ...entry, ageDays, daysRemaining: Math.ceil(NEW_PERIOD_DAYS - ageDays) })
      } else {
        oldE.push(entry)
      }
    }
    const merged = verseData ? mergeByPage(oldE, verseData) : oldE
    return { newEntries: newE, oldEntries: oldE, mergedOldEntries: merged }
  }, [entries, verseData])

  // FSRS suggestions — only for old memorization (merged by page)
  const fsrsSuggestions = useMemo(
    () => computeSuggestions(mergedOldEntries, revisions),
    [mergedOldEntries, revisions]
  )
  const dueFsrs = fsrsSuggestions.filter(s => s.dueIn <= 0)
  const upcomingFsrs = fsrsSuggestions.filter(s => s.dueIn > 0).slice(0, 5)

  const loadTestData = () => {
    fetch('/data/test_data.json')
      .then(res => res.json())
      .then(data => {
        setEntries(data['quran-memorization-entries'])
        setRevisions(data['quran-revision-entries'])
      })
  }

  const clearAllData = () => {
    if (window.confirm('Clear all memorization and revision data?')) {
      setEntries([])
      setRevisions([])
    }
  }

  // Group new entries by surah for collapsed view
  const newEntriesBySurah = useMemo(() => {
    const groups = {}
    for (const entry of newEntries) {
      const surahNum = entry.startSurah
      if (!groups[surahNum]) {
        groups[surahNum] = { surahNum, name: getSurahName(surahNum), entries: [] }
      }
      groups[surahNum].entries.push(entry)
    }
    // Sort by surah number
    return Object.values(groups).sort((a, b) => a.surahNum - b.surahNum)
  }, [newEntries, getSurahName])

  const toggleNewSurah = (surahNum) => {
    setExpandedNewSurahs(prev => ({ ...prev, [surahNum]: !prev[surahNum] }))
  }

  return (
    <div className="app">
      <h1>Quran Memorization Tracker</h1>

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
            {sectionOpen.old && upcomingFsrs.length > 0 && (
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

      <hr className="section-divider" />

      <form onSubmit={handleRevSubmit} className="entry-form revision-form">
        <h2>{editingRevId ? 'Edit Revision' : 'Log Revision'}</h2>

        <div className="form-row">
          <div className="form-group">
            <label>Start Surah</label>
            <select value={revStartSurah} onChange={e => handleRevStartSurahChange(e.target.value)} required>
              <option value="">Select surah...</option>
              {surahs.map(s => (
                <option key={s.num} value={s.num}>
                  {s.num}. {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Start Verse</label>
            <input
              type="text"
              value={revStartVerse}
              onChange={e => setRevStartVerse(e.target.value)}
              placeholder="e.g. 5 or 5.2"
              required
            />
            {revStartSurah && (
              <span className="hint">Max: {getMaxVerses(revStartSurah)} verses</span>
            )}
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>End Surah</label>
            <select value={revEndSurah} onChange={e => setRevEndSurah(e.target.value)} required>
              <option value="">Select surah...</option>
              {surahs.map(s => (
                <option key={s.num} value={s.num}>
                  {s.num}. {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>End Verse</label>
            <input
              type="text"
              value={revEndVerse}
              onChange={e => setRevEndVerse(e.target.value)}
              placeholder="e.g. 10 or 10.5"
              required
            />
            {revEndSurah && (
              <span className="hint">Max: {getMaxVerses(revEndSurah)} verses</span>
            )}
          </div>
        </div>

        <div className="form-row">
          <div className="form-group quality-group">
            <label>Quality (1–5)</label>
            <div className="quality-options">
              {[1, 2, 3, 4, 5].map(q => (
                <label key={q} className={`quality-chip ${Number(revQuality) === q ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="quality"
                    value={q}
                    checked={Number(revQuality) === q}
                    onChange={e => setRevQuality(e.target.value)}
                  />
                  {q} – {qualityLabels[q]}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="form-actions">
          <button type="submit">{editingRevId ? 'Update' : 'Add Revision'}</button>
          {editingRevId && <button type="button" onClick={handleRevCancel} className="cancel-btn">Cancel</button>}
        </div>
      </form>

      <div className="entries">
        <h2 className="section-header" onClick={() => toggleSection('revLog')}>
          <span className="toggle-icon">{sectionOpen.revLog ? '▾' : '▸'}</span>
          Revision Log ({revisions.length})
        </h2>
        {sectionOpen.revLog && (
          <>
            {revisions.length === 0 && <p className="empty">No revisions yet.</p>}
            {revisions.slice(0, revShowCount).map(rev => (
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
                  <button onClick={() => handleRevEdit(rev)} className="edit-btn">Edit</button>
                  <button onClick={() => handleRevDelete(rev.id)} className="delete-btn">Delete</button>
                </div>
              </div>
            ))}
            {revisions.length > revShowCount && (
              <button className="show-more-btn" onClick={() => setRevShowCount(c => c + 10)}>
                Show more ({revisions.length - revShowCount} remaining)
              </button>
            )}
            {revShowCount > 5 && (
              <button className="show-more-btn" onClick={() => setRevShowCount(5)}>
                Show less
              </button>
            )}
          </>
        )}
      </div>
      <hr className="section-divider" />

      <form onSubmit={handleSubmit} className="entry-form">
        <h2>{editingId ? 'Edit Entry' : 'Log Memorization'}</h2>

        <div className="form-row">
          <div className="form-group">
            <label>Start Surah</label>
            <select value={startSurah} onChange={e => handleStartSurahChange(e.target.value)} required>
              <option value="">Select surah...</option>
              {surahs.map(s => (
                <option key={s.num} value={s.num}>
                  {s.num}. {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Start Verse</label>
            <input
              type="text"
              value={startVerse}
              onChange={e => setStartVerse(e.target.value)}
              placeholder="e.g. 5 or 5.2"
              required
            />
            {startSurah && (
              <span className="hint">Max: {getMaxVerses(startSurah)} verses</span>
            )}
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>End Surah</label>
            <select value={endSurah} onChange={e => setEndSurah(e.target.value)} required>
              <option value="">Select surah...</option>
              {surahs.map(s => (
                <option key={s.num} value={s.num}>
                  {s.num}. {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>End Verse</label>
            <input
              type="text"
              value={endVerse}
              onChange={e => setEndVerse(e.target.value)}
              placeholder="e.g. 10 or 10.5"
              required
            />
            {endSurah && (
              <span className="hint">Max: {getMaxVerses(endSurah)} verses</span>
            )}
          </div>
        </div>

        <div className="form-actions">
          <button type="submit">{editingId ? 'Update' : 'Add Entry'}</button>
          {editingId && <button type="button" onClick={handleCancel} className="cancel-btn">Cancel</button>}
        </div>
      </form>

      <div className="entries">
        <h2 className="section-header" onClick={() => toggleSection('memorized')}>
          <span className="toggle-icon">{sectionOpen.memorized ? '▾' : '▸'}</span>
          Memorized Sections ({entries.length})
        </h2>
        {sectionOpen.memorized && (
          <>
            {entries.length === 0 && <p className="empty">No entries yet. Start logging!</p>}

            {newEntries.length > 0 && (
              <>
                <h3 className="bucket-label section-header" onClick={() => toggleSection('newMem')}>
                  <span className="toggle-icon">{sectionOpen.newMem ? '▾' : '▸'}</span>
                  New ({newEntries.length})
                </h3>
                {sectionOpen.newMem && (
                  <>
                    {newEntries.slice(0, newMemShowCount).map(entry => (
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
                          <button onClick={() => handleEdit(entry)} className="edit-btn">Edit</button>
                          <button onClick={() => handleDelete(entry.id)} className="delete-btn">Delete</button>
                        </div>
                      </div>
                    ))}
                    {newEntries.length > newMemShowCount && (
                      <button className="show-more-btn" onClick={() => setNewMemShowCount(c => c + 10)}>
                        Show more ({newEntries.length - newMemShowCount} remaining)
                      </button>
                    )}
                    {newMemShowCount > 5 && (
                      <button className="show-more-btn" onClick={() => setNewMemShowCount(5)}>
                        Show less
                      </button>
                    )}
                  </>
                )}
              </>
            )}

            {oldEntries.length > 0 && (
              <>
                <h3 className="bucket-label section-header" onClick={() => toggleSection('oldMem')}>
                  <span className="toggle-icon">{sectionOpen.oldMem ? '▾' : '▸'}</span>
                  Old — by page ({mergedOldEntries.length} pages from {oldEntries.length} entries)
                </h3>
                {sectionOpen.oldMem && (
                  <>
                    {mergedOldEntries.slice(0, oldMemShowCount).map(entry => (
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
                    {mergedOldEntries.length > oldMemShowCount && (
                      <button className="show-more-btn" onClick={() => setOldMemShowCount(c => c + 10)}>
                        Show more ({mergedOldEntries.length - oldMemShowCount} remaining)
                      </button>
                    )}
                    {oldMemShowCount > 5 && (
                      <button className="show-more-btn" onClick={() => setOldMemShowCount(5)}>
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


      <hr className="section-divider" />
      <div className="test-data-controls">
        <button onClick={loadTestData} className="test-btn">Load Test Data</button>
        <button onClick={clearAllData} className="test-btn clear-btn">Clear All Data</button>
      </div>
    </div>
  )
}

export default App
