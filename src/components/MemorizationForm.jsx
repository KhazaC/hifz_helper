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
  const [startSurah, setStartSurah] = useState(editEntry ? String(editEntry.startSurah) : '')
  const [startVerse, setStartVerse] = useState(editEntry ? editEntry.startVerse : '')
  const [endSurah, setEndSurah] = useState(editEntry ? String(editEntry.endSurah) : '')
  const [endVerse, setEndVerse] = useState(editEntry ? editEntry.endVerse : '')

  const clearFields = () => {
    setStartSurah('')
    setStartVerse('')
    setEndSurah('')
    setEndVerse('')
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
      createdAt: editEntry ? editEntry.createdAt : new Date().toISOString(),
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

      <div className="form-actions">
        <button type="submit">{isEditing ? 'Update' : 'Add Entry'}</button>
        {isEditing && <button type="button" onClick={handleCancel} className="cancel-btn">Cancel</button>}
      </div>
    </form>
  )
}
