import { useState, useMemo, useCallback } from 'react'
import { computeSuggestions } from './fsrs'
import { mergeByPage } from './pageMerge'
import { useQuranData } from './hooks/useQuranData'
import { useDebouncedWrite } from './hooks/useDebounce'
import { NEW_PERIOD_DAYS, SCHEMA_VERSION, STORAGE_KEYS } from './constants'
import SuggestionsPanel from './components/SuggestionsPanel'
import RevisionForm from './components/RevisionForm'
import RevisionLog from './components/RevisionLog'
import MemorizationForm from './components/MemorizationForm'
import MemorizedSections from './components/MemorizedSections'
import './App.css'

/** Crash-safe JSON parse with fallback */
function safeParse(raw, fallback = []) {
  if (!raw) return fallback
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : fallback
  } catch {
    console.warn('Corrupt localStorage data, resetting to default')
    return fallback
  }
}

/** Check schema version and clear stale data if needed */
function migrateIfNeeded() {
  const stored = Number(localStorage.getItem(STORAGE_KEYS.SCHEMA) || 0)
  if (stored < SCHEMA_VERSION) {
    // Currently v1 — no migrations needed yet, just stamp
    localStorage.setItem(STORAGE_KEYS.SCHEMA, String(SCHEMA_VERSION))
  }
}

function App() {
  const { surahs, verseData, pageMap, isLoading, error, getSurahName, getMaxVerses } = useQuranData()

  const [entries, setEntries] = useState(() => {
    migrateIfNeeded()
    return safeParse(localStorage.getItem(STORAGE_KEYS.ENTRIES))
  })
  const [revisions, setRevisions] = useState(() => {
    return safeParse(localStorage.getItem(STORAGE_KEYS.REVISIONS))
  })

  const [editingEntry, setEditingEntry] = useState(null)
  const [editingRevision, setEditingRevision] = useState(null)

  // Debounced localStorage persistence (300ms)
  const writeEntries = useCallback((val) => {
    localStorage.setItem(STORAGE_KEYS.ENTRIES, JSON.stringify(val))
  }, [])
  const writeRevisions = useCallback((val) => {
    localStorage.setItem(STORAGE_KEYS.REVISIONS, JSON.stringify(val))
  }, [])
  useDebouncedWrite(entries, writeEntries)
  useDebouncedWrite(revisions, writeRevisions)

  // --- Derived data (all memoized) ---

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
    newE.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    const merged = (verseData && pageMap) ? mergeByPage(oldE, verseData, pageMap) : oldE
    merged.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    return { newEntries: newE, oldEntries: oldE, mergedOldEntries: merged }
  }, [entries, verseData, pageMap])

  const fsrsSuggestions = useMemo(
    () => computeSuggestions(mergedOldEntries, revisions),
    [mergedOldEntries, revisions]
  )

  const dueFsrs = useMemo(
    () => fsrsSuggestions.filter(s => s.dueIn <= 0),
    [fsrsSuggestions]
  )

  const upcomingFsrs = useMemo(
    () => fsrsSuggestions.filter(s => s.dueIn > 0).slice(0, 5),
    [fsrsSuggestions]
  )

  const sortedRevisions = useMemo(
    () => [...revisions].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    [revisions]
  )

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
      .then(res => {
        if (!res.ok) throw new Error(`Failed to load test data (${res.status})`)
        return res.json()
      })
      .then(data => {
        setEntries(data['quran-memorization-entries'])
        setRevisions(data['quran-revision-entries'])
      })
      .catch(err => console.error('Failed to load test data:', err))
  }

  const clearAllData = () => {
    if (window.confirm('Clear all memorization and revision data?')) {
      setEntries([])
      setRevisions([])
    }
  }

  // --- Export / Import ---

  const exportData = () => {
    const data = {
      'quran-memorization-entries': entries,
      'quran-revision-entries': revisions,
      exportedAt: new Date().toISOString(),
      schemaVersion: SCHEMA_VERSION,
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `quran-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const importData = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = (e) => {
      const file = e.target.files[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result)
          const importedEntries = data['quran-memorization-entries']
          const importedRevisions = data['quran-revision-entries']
          if (!Array.isArray(importedEntries) || !Array.isArray(importedRevisions)) {
            throw new Error('Invalid data format')
          }
          if (window.confirm(`Import ${importedEntries.length} entries and ${importedRevisions.length} revisions? This will replace current data.`)) {
            setEntries(importedEntries)
            setRevisions(importedRevisions)
          }
        } catch (err) {
          alert('Failed to import: ' + err.message)
        }
      }
      reader.readAsText(file)
    }
    input.click()
  }

  // --- Loading / Error states ---

  if (isLoading) {
    return <div className="app"><p>Loading Quran data…</p></div>
  }

  if (error) {
    return <div className="app"><p style={{ color: '#dc2626' }}>Error loading data: {error}</p></div>
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
        revisions={sortedRevisions}
        formatEntry={formatEntry}
        onEdit={handleRevisionEdit}
        onDelete={handleRevisionDelete}
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
      />

      <hr className="section-divider" />
      <div className="test-data-controls">
        <button onClick={exportData} className="test-btn">Export Data</button>
        <button onClick={importData} className="test-btn">Import Data</button>
        <button onClick={loadTestData} className="test-btn">Load Test Data</button>
        <button onClick={clearAllData} className="test-btn clear-btn">Clear All Data</button>
      </div>
    </div>
  )
}

export default App
