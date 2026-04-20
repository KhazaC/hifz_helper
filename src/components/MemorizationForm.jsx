import { useState, memo } from 'react'
import SurahVerseFields from './SurahVerseFields'
import { localDateStr, isoToLocalDate } from '../constants'

/**
 * Form for logging / editing memorization entries.
 * Use a `key` prop on this component to force re-mount when switching between add/edit.
 */
const MemorizationForm = memo(function MemorizationForm({
  surahs,
  getMaxVerses,
  editEntry,
  onSubmit,
  onCancel,
}) {
  const todayStr = localDateStr()
  const [startSurah, setStartSurah] = useState(editEntry ? String(editEntry.startSurah) : '')
  const [startVerse, setStartVerse] = useState(editEntry ? editEntry.startVerse : '')
  const [endSurah, setEndSurah] = useState(editEntry ? String(editEntry.endSurah) : '')
  const [endVerse, setEndVerse] = useState(editEntry ? editEntry.endVerse : '')
  const [date, setDate] = useState(editEntry ? isoToLocalDate(editEntry.createdAt) : todayStr)

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
      id: editEntry ? editEntry.id : crypto.randomUUID(),
      startSurah: Number(startSurah),
      startVerse,
      endSurah: Number(endSurah),
      endVerse,
      createdAt: new Date(date + 'T00:00:00').toISOString(),
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
})

export default MemorizationForm
