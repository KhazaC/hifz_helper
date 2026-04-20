import { useMemo, useState, memo } from 'react'
import { getVersesInRange } from '../fsrs'
import { localDateStr, isoToLocalDate } from '../constants'

const TOTAL_QURAN_VERSES = 6236

/** Get streak (consecutive days ending at today or yesterday with revisions) */
function computeStreak(revisionDays) {
  if (revisionDays.size === 0) return { current: 0, best: 0 }
  const sorted = [...revisionDays].sort().reverse()
  const today = localDateStr()
  const yesterday = localDateStr(new Date(Date.now() - 86400000))

  let current = 0
  let best = 0
  let streak = 0
  let expected = sorted[0] === today || sorted[0] === yesterday ? sorted[0] : null

  if (!expected) {
    // No revision today or yesterday — current streak is 0, compute best only
    current = 0
  }

  // Compute all streaks
  const allDays = [...revisionDays].sort()
  streak = 1
  best = 1
  for (let i = 1; i < allDays.length; i++) {
    const prev = new Date(allDays[i - 1])
    const curr = new Date(allDays[i])
    const diff = (curr - prev) / 86400000
    if (diff === 1) {
      streak++
    } else {
      streak = 1
    }
    if (streak > best) best = streak
  }

  // Compute current streak (consecutive days ending at today or yesterday)
  if (expected) {
    current = 0
    const sortedDesc = [...revisionDays].sort().reverse()
    let checkDate = new Date(sortedDesc[0])
    for (const day of sortedDesc) {
      if (day === localDateStr(checkDate)) {
        current++
        checkDate = new Date(checkDate.getTime() - 86400000)
      } else {
        break
      }
    }
  }

  return { current, best }
}

/** Calendar heatmap component — shows 3 months of activity */
const CalendarHeatmap = memo(function CalendarHeatmap({ revisionsByDay }) {
  const today = new Date()
  const weeks = 13 // ~3 months
  const totalDays = weeks * 7
  const startDate = new Date(today)
  startDate.setDate(startDate.getDate() - totalDays + 1)
  // Align to start of week (Sunday)
  startDate.setDate(startDate.getDate() - startDate.getDay())

  const cells = []
  const d = new Date(startDate)
  for (let w = 0; w < weeks; w++) {
    for (let dow = 0; dow < 7; dow++) {
      const key = localDateStr(d)
      const count = revisionsByDay[key] || 0
      const isFuture = d > today
      cells.push({ key, count, dow, week: w, isFuture })
      d.setDate(d.getDate() + 1)
    }
  }

  const maxCount = Math.max(1, ...cells.map(c => c.count))

  function getColor(count, isFuture) {
    if (isFuture) return '#f3f4f6'
    if (count === 0) return '#ebedf0'
    const intensity = Math.min(count / maxCount, 1)
    if (intensity < 0.25) return '#9be9a8'
    if (intensity < 0.5) return '#40c463'
    if (intensity < 0.75) return '#30a14e'
    return '#216e39'
  }

  const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

  // Get month labels
  const monthLabels = []
  const md = new Date(startDate)
  let lastMonth = -1
  for (let w = 0; w < weeks; w++) {
    const monthDate = new Date(md)
    monthDate.setDate(monthDate.getDate() + 3) // mid-week
    const month = monthDate.getMonth()
    if (month !== lastMonth) {
      monthLabels.push({ week: w, label: monthDate.toLocaleString('default', { month: 'short' }) })
      lastMonth = month
    }
    md.setDate(md.getDate() + 7)
  }

  const cellSize = 14
  const cellGap = 2
  const labelWidth = 18
  const headerHeight = 16
  const svgWidth = labelWidth + weeks * (cellSize + cellGap)
  const svgHeight = headerHeight + 7 * (cellSize + cellGap)

  const [tooltip, setTooltip] = useState(null)

  return (
    <div className="calendar-heatmap">
      <svg width={svgWidth} height={svgHeight} style={{ display: 'block' }}>
        {/* Month labels */}
        {monthLabels.map(m => (
          <text
            key={m.week}
            x={labelWidth + m.week * (cellSize + cellGap)}
            y={12}
            fontSize="10"
            fill="#6b7280"
          >
            {m.label}
          </text>
        ))}
        {/* Day labels */}
        {[1, 3, 5].map(dow => (
          <text
            key={dow}
            x={0}
            y={headerHeight + dow * (cellSize + cellGap) + cellSize - 2}
            fontSize="9"
            fill="#6b7280"
          >
            {dayLabels[dow]}
          </text>
        ))}
        {/* Cells */}
        {cells.map(c => (
          <rect
            key={c.key}
            x={labelWidth + c.week * (cellSize + cellGap)}
            y={headerHeight + c.dow * (cellSize + cellGap)}
            width={cellSize}
            height={cellSize}
            rx={2}
            fill={getColor(c.count, c.isFuture)}
            onMouseEnter={() => setTooltip(c)}
            onMouseLeave={() => setTooltip(null)}
          />
        ))}
      </svg>
      {tooltip && !tooltip.isFuture && (
        <div className="calendar-tooltip">
          {tooltip.count} revision{tooltip.count !== 1 ? 's' : ''} on {tooltip.key}
        </div>
      )}
    </div>
  )
})

const StatsPanel = memo(function StatsPanel({
  entries,
  revisions,
  verseData,
  surahs,
}) {
  // --- Progress Overview ---
  const progress = useMemo(() => {
    const entryVerses = new Set()
    for (const entry of entries) {
      if (verseData) {
        const verses = getVersesInRange(entry.startSurah, entry.startVerse, entry.endSurah, entry.endVerse, verseData)
        for (const v of verses) entryVerses.add(`${v.surahNum}:${v.verseNum}`)
      } else {
        // Fallback: count from entries without verseData
        const s0 = Number(entry.startSurah)
        const v0 = Math.floor(Number(entry.startVerse))
        const s1 = Number(entry.endSurah)
        const v1 = Math.floor(Number(entry.endVerse))
        if (s0 === s1) {
          for (let v = v0; v <= v1; v++) entryVerses.add(`${s0}:${v}`)
        }
      }
    }
    const totalMemorized = entryVerses.size

    // Per-surah breakdown
    const surahProgress = {}
    for (const key of entryVerses) {
      const [s] = key.split(':')
      surahProgress[s] = (surahProgress[s] || 0) + 1
    }

    return {
      totalMemorized,
      percentage: ((totalMemorized / TOTAL_QURAN_VERSES) * 100).toFixed(1),
      surahProgress,
    }
  }, [entries, verseData])

  // --- Statistics ---
  const stats = useMemo(() => {
    if (revisions.length === 0) {
      return { total: 0, today: 0, thisWeek: 0, thisMonth: 0, avgQuality: 0, streak: { current: 0, best: 0 }, revisionsByDay: {} }
    }

    const now = new Date()
    const todayStr = localDateStr(now)
    const weekAgo = new Date(now.getTime() - 7 * 86400000)
    const monthAgo = new Date(now.getTime() - 30 * 86400000)

    let today = 0, thisWeek = 0, thisMonth = 0, qualitySum = 0
    const revisionDays = new Set()
    const revisionsByDay = {}

    for (const rev of revisions) {
      const d = isoToLocalDate(rev.createdAt)
      revisionDays.add(d)
      revisionsByDay[d] = (revisionsByDay[d] || 0) + 1

      if (d === todayStr) today++
      const rd = new Date(rev.createdAt)
      if (rd >= weekAgo) thisWeek++
      if (rd >= monthAgo) thisMonth++
      qualitySum += rev.quality
    }

    const streak = computeStreak(revisionDays)

    return {
      total: revisions.length,
      today,
      thisWeek,
      thisMonth,
      avgQuality: (qualitySum / revisions.length).toFixed(1),
      streak,
      revisionsByDay,
    }
  }, [revisions])

  // Per-surah progress list
  const surahBreakdown = useMemo(() => {
    if (!surahs.length) return []
    return surahs
      .filter(s => progress.surahProgress[s.num])
      .map(s => ({
        num: s.num,
        name: s.name,
        memorized: progress.surahProgress[s.num] || 0,
        total: s.numVerses,
        pct: (((progress.surahProgress[s.num] || 0) / s.numVerses) * 100).toFixed(0),
      }))
      .sort((a, b) => b.memorized - a.memorized)
  }, [surahs, progress.surahProgress])

  const [showSurahBreakdown, setShowSurahBreakdown] = useState(false)

  return (
    <div className="stats-panel">
      {/* Progress Overview */}
      <div className="stats-section">
        <h3>Progress Overview</h3>
        <div className="progress-bar-container">
          <div className="progress-bar" style={{ width: `${Math.min(100, progress.percentage)}%` }} />
          <span className="progress-label">
            {progress.totalMemorized} / {TOTAL_QURAN_VERSES} verses ({progress.percentage}%)
          </span>
        </div>
        {surahBreakdown.length > 0 && (
          <>
            <button
              className="show-more-btn"
              onClick={() => setShowSurahBreakdown(prev => !prev)}
            >
              {showSurahBreakdown ? 'Hide' : 'Show'} surah breakdown ({surahBreakdown.length} surahs)
            </button>
            {showSurahBreakdown && (
              <div className="surah-breakdown">
                {surahBreakdown.map(s => (
                  <div key={s.num} className="surah-progress-row">
                    <span className="surah-progress-name">{s.name}</span>
                    <div className="surah-progress-bar-wrap">
                      <div className="surah-progress-bar" style={{ width: `${s.pct}%` }} />
                    </div>
                    <span className="surah-progress-count">{s.memorized}/{s.total} ({s.pct}%)</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Statistics */}
      <div className="stats-section">
        <h3>Statistics</h3>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value">{stats.total}</div>
            <div className="stat-label">Total Revisions</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.today}</div>
            <div className="stat-label">Today</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.thisWeek}</div>
            <div className="stat-label">This Week</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.thisMonth}</div>
            <div className="stat-label">This Month</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.avgQuality || '—'}</div>
            <div className="stat-label">Avg Quality</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.streak.current}d</div>
            <div className="stat-label">Current Streak</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.streak.best}d</div>
            <div className="stat-label">Best Streak</div>
          </div>
        </div>
      </div>

      {/* Calendar Heatmap */}
      <div className="stats-section">
        <h3>Activity</h3>
        <CalendarHeatmap revisionsByDay={stats.revisionsByDay} />
      </div>
    </div>
  )
})

export default StatsPanel
