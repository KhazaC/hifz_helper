import { useState } from 'react'
import SurahVerseFields from './SurahVerseFields'
import { qualityLabels } from '../constants'

/**
 * Form for logging / editing revision entries.
 * Use a `key` prop on this component to force re-mount when switching between add/edit.
 */
export default function RevisionForm({
  surahs,
  getMaxVerses,
  editRevision,
  onSubmit,
  onCancel,
}) {
  const [startSurah, setStartSurah] = useState(editRevision ? String(editRevision.startSurah) : '')
  const [startVerse, setStartVerse] = useState(editRevision ? editRevision.startVerse : '')
  const [endSurah, setEndSurah] = useState(editRevision ? String(editRevision.endSurah) : '')
  const [endVerse, setEndVerse] = useState(editRevision ? editRevision.endVerse : '')
  const [quality, setQuality] = useState(editRevision ? String(editRevision.quality) : '3')

  const clearFields = () => {
    setStartSurah('')
    setStartVerse('')
    setEndSurah('')
    setEndVerse('')
    setQuality('3')
  }

  const handleStartSurahChange = (val) => {
    setStartSurah(val)
    if (!endSurah) setEndSurah(val)
  }

  const handleFormSubmit = (e) => {
    e.preventDefault()
    if (!startSurah || !startVerse || !endSurah || !endVerse) return

    const revision = {
      id: editRevision ? editRevision.id : Date.now(),
      startSurah: Number(startSurah),
      startVerse,
      endSurah: Number(endSurah),
      endVerse,
      quality: Number(quality),
      createdAt: editRevision ? editRevision.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    onSubmit(revision)
    clearFields()
  }

  const handleCancel = () => {
    clearFields()
    onCancel()
  }

  const isEditing = !!editRevision

  return (
    <form onSubmit={handleFormSubmit} className="entry-form revision-form">
      <h2>{isEditing ? 'Edit Revision' : 'Log Revision'}</h2>

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
        <div className="form-group quality-group">
          <label>Quality (1–5)</label>
          <div className="quality-options">
            {[1, 2, 3, 4, 5].map(q => (
              <label key={q} className={`quality-chip ${Number(quality) === q ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="quality"
                  value={q}
                  checked={Number(quality) === q}
                  onChange={e => setQuality(e.target.value)}
                />
                {q} – {qualityLabels[q]}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="form-actions">
        <button type="submit">{isEditing ? 'Update' : 'Add Revision'}</button>
        {isEditing && <button type="button" onClick={handleCancel} className="cancel-btn">Cancel</button>}
      </div>
    </form>
  )
}
