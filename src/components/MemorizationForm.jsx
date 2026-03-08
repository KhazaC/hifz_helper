import { useState } from 'react'
import SurahVerseFields from './SurahVerseFields'

/**
 * Form for logging / editing memorization entries.
 * Use a `key` prop on this component to force re-mount when switching between add/edit.
 */
export default function MemorizationForm({
  surahs,
  getMaxVerses,
  editEntry,
  onSubmit,
  onCancel,
}) {
  const todayStr = new Date().toISOString().slice(0, 10)
  const [startSurah, setStartSurah] = useState(editEntry ? String(editEntry.startSurah) : '')
  const [startVerse, setStartVerse] = useState(editEntry ? editEntry.startVerse : '')
  const [endSurah, setEndSurah] = useState(editEntry ? String(editEntry.endSurah) : '')
  const [endVerse, setEndVerse] = useState(editEntry ? editEntry.endVerse : '')
  const [date, setDate] = useState(editEntry ? editEntry.createdAt.slice(0, 10) : todayStr)

  const clearFields = () => {
    setStartSurah('')
    setStartVerse('')
    setEndSurah('')
    setEndVerse('')
    setDate(todayStr)
  }

  const handleStartSurahChange = (val) => {
    setStartSurah(val)
    if (!endSurah) setEndSurah(val)
  }

  const handleFormSubmit = (e) => {
    e.preventDefault()
    if (!startSurah || !startVerse || !endSurah || !endVerse) return

    const entry = {
      id: editEntry ? editEntry.id : Date.now(),
      startSurah: Number(startSurah),
      startVerse,
      endSurah: Number(endSurah),
      endVerse,
      createdAt: editEntry ? new Date(date + 'T00:00:00').toISOString() : new Date(date + 'T00:00:00').toISOString(),
      updatedAt: new Date().toISOString(),
    }

    onSubmit(entry)
    clearFields()
  }

  const handleCancel = () => {
    clearFields()
    onCancel()
  }

  const isEditing = !!editEntry

  return (
    <form onSubmit={handleFormSubmit} className="entry-form">
      <h2>{isEditing ? 'Edit Entry' : 'Log Memorization'}</h2>

      <SurahVerseFields
        surahs={surahs}
        startSurah={startSurah}
        startVerse={startVerse}
        endSurah={endSurah}
        endVerse={endVerse}
        onStartSurahChange={handleStartSurahChange}
        onStartVerseChange={setStartVerse}
        onEndSurahChange={setEndSurah}
        onEndVerseChange={setEndVerse}
        getMaxVerses={getMaxVerses}
      />

      <div className="form-row">
        <div className="form-group">
          <label>Date</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            max={todayStr}
          />
          <span className="hint">Use a past date to backlog</span>
        </div>
      </div>

      <div className="form-actions">
        <button type="submit">{isEditing ? 'Update' : 'Add Entry'}</button>
        {isEditing && <button type="button" onClick={handleCancel} className="cancel-btn">Cancel</button>}
      </div>
    </form>
  )
}
