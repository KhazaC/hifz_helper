/**
 * Reusable start/end surah + verse input fields.
 * Used by both the memorization form and the revision form.
 */
export default function SurahVerseFields({
  surahs,
  startSurah,
  startVerse,
  endSurah,
  endVerse,
  onStartSurahChange,
  onStartVerseChange,
  onEndSurahChange,
  onEndVerseChange,
  getMaxVerses,
}) {
  return (
    <>
      <div className="form-row">
        <div className="form-group">
          <label>Start Surah</label>
          <select value={startSurah} onChange={e => onStartSurahChange(e.target.value)} required>
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
            onChange={e => onStartVerseChange(e.target.value)}
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
          <select value={endSurah} onChange={e => onEndSurahChange(e.target.value)} required>
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
            onChange={e => onEndVerseChange(e.target.value)}
            placeholder="e.g. 10 or 10.5"
            required
          />
          {endSurah && (
            <span className="hint">Max: {getMaxVerses(endSurah)} verses</span>
          )}
        </div>
      </div>
    </>
  )
}
