import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { computeSuggestions, applyRevisionToSnapshot, rebuildSnapshot } from './fsrs'
import { mergeByPage, resolvePartialVerses, getPagesForEntry, getPageBounds } from './pageMerge'
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

/** Crash-safe JSON parse for objects with fallback */
function safeParseObject(raw, fallback = {}) {
  if (!raw) return fallback
  try {
    const parsed = JSON.parse(raw)
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : fallback
  } catch {
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
  const [verseSnapshot, setVerseSnapshot] = useState(() =>
    safeParseObject(localStorage.getItem(STORAGE_KEYS.VERSE_STATES))
  )

  // Debounced localStorage persistence (300ms)
  const writeEntries = useCallback((val) => {
    localStorage.setItem(STORAGE_KEYS.ENTRIES, JSON.stringify(val))
  }, [])
  const writeRevisions = useCallback((val) => {
    localStorage.setItem(STORAGE_KEYS.REVISIONS, JSON.stringify(val))
  }, [])
  useDebouncedWrite(entries, writeEntries)
  useDebouncedWrite(revisions, writeRevisions)
  const writeVerseSnapshot = useCallback((val) => {
    localStorage.setItem(STORAGE_KEYS.VERSE_STATES, JSON.stringify(val))
  }, [])
  useDebouncedWrite(verseSnapshot, writeVerseSnapshot)

  // Build snapshot on first load if migrating from schema v1 (no snapshot yet)
  const snapshotInitRef = useRef(false)
  useEffect(() => {
    if (!verseData || snapshotInitRef.current) return
    snapshotInitRef.current = true
    if (Object.keys(verseSnapshot).length === 0 && revisions.length > 0) {
      setVerseSnapshot(rebuildSnapshot(revisions, verseData))
    }
  }, [verseData]) // eslint-disable-line react-hooks/exhaustive-deps

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
    // Resolve fractional-verse overlaps before splitting into new/old
    const resolved = resolvePartialVerses(entries)
    const now = new Date()
    const newE = []
    const oldE = []
    for (const entry of resolved) {
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
    () => computeSuggestions(mergedOldEntries, verseSnapshot, verseData),
    [mergedOldEntries, verseSnapshot, verseData]
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

  const newEntriesByPage = useMemo(() => {
    if (!pageMap || !verseData) return []
    const groups = {} // pageNum → { pageNum, entries: [], bounds }
    for (const entry of newEntries) {
      const pages = getPagesForEntry(entry, pageMap)
      // Attribute entry to its start page
      const pg = pages[0]
      if (!pg) continue
      if (!groups[pg]) {
        const bounds = getPageBounds(pg, verseData)
        groups[pg] = {
          pageNum: pg,
          bounds,
          entries: [],
        }
      }
      groups[pg].entries.push(entry)
    }
    return Object.values(groups).sort((a, b) => a.pageNum - b.pageNum)
  }, [newEntries, pageMap, verseData, getSurahName])

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
      // Edit: full snapshot rebuild needed
      const updated = revisions.map(r => r.id === revision.id ? revision : r)
      setRevisions(updated)
      if (verseData) setVerseSnapshot(rebuildSnapshot(updated, verseData))
      setEditingRevision(null)
    } else {
      // Add: incremental snapshot update
      setRevisions(prev => [...prev, revision])
      if (verseData) {
        setVerseSnapshot(prev => {
          const next = { ...prev }
          applyRevisionToSnapshot(next, revision, verseData)
          return next
        })
      }
    }
  }, [editingRevision, revisions, verseData])

  const handleRevisionEdit = useCallback((rev) => {
    setEditingRevision(rev)
  }, [])

  const handleRevisionDelete = useCallback((id) => {
    const updated = revisions.filter(r => r.id !== id)
    setRevisions(updated)
    if (verseData) setVerseSnapshot(rebuildSnapshot(updated, verseData))
  }, [revisions, verseData])

  const handleRevisionCancel = useCallback(() => {
    setEditingRevision(null)
  }, [])

  /** Quick-log a revision directly from the suggestions panel */
  const handleQuickRevision = useCallback((revision) => {
    setRevisions(prev => [...prev, revision])
    if (verseData) {
      setVerseSnapshot(prev => {
        const next = { ...prev }
        applyRevisionToSnapshot(next, revision, verseData)
        return next
      })
    }
  }, [verseData])

  // --- Test data ---

  const loadTestData = () => {
    fetch('/data/test_data.json')
      .then(res => {
        if (!res.ok) throw new Error(`Failed to load test data (${res.status})`)
        return res.json()
      })
      .then(data => {
        setEntries(data['quran-memorization-entries'])
        const newRevisions = data['quran-revision-entries']
        setRevisions(newRevisions)
        if (verseData) setVerseSnapshot(rebuildSnapshot(newRevisions, verseData))
      })
      .catch(err => console.error('Failed to load test data:', err))
  }

  const clearAllData = () => {
    if (window.confirm('Clear all memorization and revision data?')) {
      setEntries([])
      setRevisions([])
      setVerseSnapshot({})
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
            if (verseData) setVerseSnapshot(rebuildSnapshot(importedRevisions, verseData))
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
        newEntriesByPage={newEntriesByPage}
        pageMap={pageMap}
        onLogRevision={handleQuickRevision}
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
