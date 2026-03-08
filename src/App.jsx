import { useState, useEffect, useMemo, useCallback } from 'react'
import { computeSuggestions } from './fsrs'
import { mergeByPage } from './pageMerge'
import { useQuranData } from './hooks/useQuranData'
import { NEW_PERIOD_DAYS } from './constants'
import SuggestionsPanel from './components/SuggestionsPanel'
import RevisionForm from './components/RevisionForm'
import RevisionLog from './components/RevisionLog'
import MemorizationForm from './components/MemorizationForm'
import MemorizedSections from './components/MemorizedSections'
import './App.css'

function App() {
  const { surahs, verseData, getSurahName, getMaxVerses } = useQuranData()

  const [entries, setEntries] = useState(() => {
    const saved = localStorage.getItem('quran-memorization-entries')
    return saved ? JSON.parse(saved) : []
  })
  const [revisions, setRevisions] = useState(() => {
    const saved = localStorage.getItem('quran-revision-entries')
    return saved ? JSON.parse(saved) : []
  })

  const [editingEntry, setEditingEntry] = useState(null)
  const [editingRevision, setEditingRevision] = useState(null)
  const [sectionOpen, setSectionOpen] = useState({
    new: true, old: true, coming: true,
    memorized: true, newMem: true, oldMem: true, revLog: true,
  })

  const toggleSection = useCallback((key) => {
    setSectionOpen(prev => ({ ...prev, [key]: !prev[key] }))
  }, [])

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem('quran-memorization-entries', JSON.stringify(entries))
  }, [entries])

  useEffect(() => {
    localStorage.setItem('quran-revision-entries', JSON.stringify(revisions))
  }, [revisions])

  // --- Derived data ---

  const formatEntry = useCallback((entry) => {
    const startName = getSurahName(entry.startSurah)
    const endName = getSurahName(entry.endSurah)
    if (entry.startSurah === entry.endSurah) {
      return `${startName} — ${entry.startVerse} to ${entry.endVerse}`
    }
    return `${startName} ${entry.startVerse} → ${endName} ${entry.endVerse}`
  }, [getSurahName])

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

  const fsrsSuggestions = useMemo(
    () => computeSuggestions(mergedOldEntries, revisions),
    [mergedOldEntries, revisions]
  )
  const dueFsrs = fsrsSuggestions.filter(s => s.dueIn <= 0)
  const upcomingFsrs = fsrsSuggestions.filter(s => s.dueIn > 0).slice(0, 5)

  const newEntriesBySurah = useMemo(() => {
    const groups = {}
    for (const entry of newEntries) {
      const surahNum = entry.startSurah
      if (!groups[surahNum]) {
        groups[surahNum] = { surahNum, name: getSurahName(surahNum), entries: [] }
      }
      groups[surahNum].entries.push(entry)
    }
    return Object.values(groups).sort((a, b) => a.surahNum - b.surahNum)
  }, [newEntries, getSurahName])

  // --- Memorization handlers ---

  const handleMemorizationSubmit = useCallback((entry) => {
    if (editingEntry) {
      setEntries(prev => prev.map(e => e.id === entry.id ? entry : e))
      setEditingEntry(null)
    } else {
      setEntries(prev => [...prev, entry])
    }
  }, [editingEntry])

  const handleMemorizationEdit = useCallback((entry) => {
    setEditingEntry(entry)
  }, [])

  const handleMemorizationDelete = useCallback((id) => {
    setEntries(prev => prev.filter(e => e.id !== id))
  }, [])

  const handleMemorizationCancel = useCallback(() => {
    setEditingEntry(null)
  }, [])

  // --- Revision handlers ---

  const handleRevisionSubmit = useCallback((revision) => {
    if (editingRevision) {
      setRevisions(prev => prev.map(r => r.id === revision.id ? revision : r))
      setEditingRevision(null)
    } else {
      setRevisions(prev => [...prev, revision])
    }
  }, [editingRevision])

  const handleRevisionEdit = useCallback((rev) => {
    setEditingRevision(rev)
  }, [])

  const handleRevisionDelete = useCallback((id) => {
    setRevisions(prev => prev.filter(r => r.id !== id))
  }, [])

  const handleRevisionCancel = useCallback(() => {
    setEditingRevision(null)
  }, [])

  // --- Test data ---

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

  return (
    <div className="app">
      <h1>Quran Memorization Tracker</h1>

      <SuggestionsPanel
        entries={entries}
        newEntries={newEntries}
        mergedOldEntries={mergedOldEntries}
        dueFsrs={dueFsrs}
        upcomingFsrs={upcomingFsrs}
        formatEntry={formatEntry}
        newEntriesBySurah={newEntriesBySurah}
        sectionOpen={sectionOpen}
        toggleSection={toggleSection}
      />

      <hr className="section-divider" />

      <RevisionForm
        key={editingRevision ? editingRevision.id : 'new-rev'}
        surahs={surahs}
        getMaxVerses={getMaxVerses}
        editRevision={editingRevision}
        onSubmit={handleRevisionSubmit}
        onCancel={handleRevisionCancel}
      />

      <RevisionLog
        revisions={revisions}
        formatEntry={formatEntry}
        onEdit={handleRevisionEdit}
        onDelete={handleRevisionDelete}
        sectionOpen={sectionOpen}
        toggleSection={toggleSection}
      />

      <hr className="section-divider" />

      <MemorizationForm
        key={editingEntry ? editingEntry.id : 'new-mem'}
        surahs={surahs}
        getMaxVerses={getMaxVerses}
        editEntry={editingEntry}
        onSubmit={handleMemorizationSubmit}
        onCancel={handleMemorizationCancel}
      />

      <MemorizedSections
        entries={entries}
        newEntries={newEntries}
        oldEntries={oldEntries}
        mergedOldEntries={mergedOldEntries}
        formatEntry={formatEntry}
        onEdit={handleMemorizationEdit}
        onDelete={handleMemorizationDelete}
        sectionOpen={sectionOpen}
        toggleSection={toggleSection}
      />

      <hr className="section-divider" />
      <div className="test-data-controls">
        <button onClick={loadTestData} className="test-btn">Load Test Data</button>
        <button onClick={clearAllData} className="test-btn clear-btn">Clear All Data</button>
      </div>
    </div>
  )
}

export default App
