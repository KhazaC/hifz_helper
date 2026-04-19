import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { computeSurahSuggestions, getVersesInRange, applyRevisionToSnapshot, rebuildSnapshot } from './fsrs'
import { mergeByPage, resolvePartialVerses } from './pageMerge'
import { useQuranData } from './hooks/useQuranData'
import { useDebouncedWrite } from './hooks/useDebounce'
import { NEW_PERIOD_REVISIONS, SCHEMA_VERSION, STORAGE_KEYS } from './constants'
import SuggestionsPage from './pages/SuggestionsPage'
import RevisionsPage from './pages/RevisionsPage'
import MemorizationsPage from './pages/MemorizationsPage'
import './App.css'

function useHashRoute(defaultRoute = 'suggestions') {
  const [page, setPage] = useState(() => window.location.hash.slice(1) || defaultRoute)
  useEffect(() => {
    const onHash = () => setPage(window.location.hash.slice(1) || defaultRoute)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [defaultRoute])
  return page
}

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
  const page = useHashRoute('suggestions')

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
    const newE = []
    const oldE = []
    for (const entry of resolved) {
      // Use minimum reps across all verses in the entry's range from the FSRS state
      let minReps = Infinity
      if (verseData) {
        const verses = getVersesInRange(entry.startSurah, entry.startVerse, entry.endSurah, entry.endVerse, verseData)
        for (const v of verses) {
          const key = `${v.surahNum}:${v.verseNum}`
          const card = verseSnapshot[key]
          const reps = card ? card.reps : 0
          if (reps < minReps) minReps = reps
        }
      }
      if (minReps === Infinity) minReps = 0
      if (minReps < NEW_PERIOD_REVISIONS) {
        newE.push({ ...entry, revisionCount: minReps, revisionsRemaining: NEW_PERIOD_REVISIONS - minReps })
      } else {
        oldE.push(entry)
      }
    }
    newE.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    const merged = (verseData && pageMap) ? mergeByPage(oldE, verseData, pageMap) : oldE
    merged.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    return { newEntries: newE, oldEntries: oldE, mergedOldEntries: merged }
  }, [entries, verseSnapshot, verseData, pageMap])

  const surahSuggestions = useMemo(
    () => computeSurahSuggestions(oldEntries, verseSnapshot, verseData, pageMap),
    [oldEntries, verseSnapshot, verseData, pageMap]
  )

  // Surahs that have at least one memorized verse (for revision form scoping)
  const memorizedSurahNums = useMemo(() => {
    const nums = new Set()
    for (const entry of entries) {
      for (let s = Number(entry.startSurah); s <= Number(entry.endSurah); s++) {
        nums.add(s)
      }
    }
    return nums
  }, [entries])

  // Surahs fully memorized (for memorization form scoping)
  const fullyMemorizedSurahNums = useMemo(() => {
    if (!verseData || !surahs.length || !entries.length) return new Set()
    const memorizedBySurah = {}
    for (const entry of entries) {
      const verses = getVersesInRange(entry.startSurah, entry.startVerse, entry.endSurah, entry.endVerse, verseData)
      for (const v of verses) {
        if (!memorizedBySurah[v.surahNum]) memorizedBySurah[v.surahNum] = new Set()
        memorizedBySurah[v.surahNum].add(v.verseNum)
      }
    }
    const full = new Set()
    for (const surah of surahs) {
      const mem = memorizedBySurah[surah.num]
      if (mem && mem.size >= surah.numVerses) full.add(surah.num)
    }
    return full
  }, [entries, verseData, surahs])

  const revisionSurahs = useMemo(
    () => surahs.filter(s => memorizedSurahNums.has(s.num)),
    [surahs, memorizedSurahNums]
  )

  const memorizationSurahs = useMemo(
    () => surahs.filter(s => !fullyMemorizedSurahNums.has(s.num)),
    [surahs, fullyMemorizedSurahNums]
  )

  const sortedRevisions = useMemo(
    () => [...revisions].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)),
    [revisions]
  )

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
    fetch(`${import.meta.env.BASE_URL}data/test_data.json`)
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
      'quran-verse-fsrs-state': verseSnapshot,
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
          const importedVerseState = data['quran-verse-fsrs-state']
          if (!Array.isArray(importedEntries) || !Array.isArray(importedRevisions)) {
            throw new Error('Invalid data format')
          }
          if (window.confirm(`Import ${importedEntries.length} entries and ${importedRevisions.length} revisions? This will replace current data.`)) {
            setEntries(importedEntries)
            setRevisions(importedRevisions)
            if (importedVerseState && typeof importedVerseState === 'object' && !Array.isArray(importedVerseState)) {
              setVerseSnapshot(importedVerseState)
            } else if (verseData) {
              setVerseSnapshot(rebuildSnapshot(importedRevisions, verseData))
            }
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

      <nav className="app-nav">
        <a href="#suggestions" className={page === 'suggestions' ? 'active' : ''}>Suggestions</a>
        <a href="#revisions" className={page === 'revisions' ? 'active' : ''}>Revisions</a>
        <a href="#memorizations" className={page === 'memorizations' ? 'active' : ''}>Memorizations</a>
      </nav>

      {page === 'suggestions' && (
        <SuggestionsPage
          entries={entries}
          newEntries={newEntries}
          surahSuggestions={surahSuggestions}
          revisions={revisions}
          formatEntry={formatEntry}
          getSurahName={getSurahName}
          onLogRevision={handleQuickRevision}
        />
      )}

      {page === 'revisions' && (
        <RevisionsPage
          surahs={surahs}
          revisionSurahs={revisionSurahs}
          getMaxVerses={getMaxVerses}
          editingRevision={editingRevision}
          sortedRevisions={sortedRevisions}
          formatEntry={formatEntry}
          onSubmit={handleRevisionSubmit}
          onEdit={handleRevisionEdit}
          onDelete={handleRevisionDelete}
          onCancel={handleRevisionCancel}
        />
      )}

      {page === 'memorizations' && (
        <MemorizationsPage
          surahs={surahs}
          memorizationSurahs={memorizationSurahs}
          getMaxVerses={getMaxVerses}
          editingEntry={editingEntry}
          entries={entries}
          newEntries={newEntries}
          oldEntries={oldEntries}
          mergedOldEntries={mergedOldEntries}
          formatEntry={formatEntry}
          onSubmit={handleMemorizationSubmit}
          onEdit={handleMemorizationEdit}
          onDelete={handleMemorizationDelete}
          onCancel={handleMemorizationCancel}
        />
      )}

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
