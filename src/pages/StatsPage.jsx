import StatsPanel from '../components/StatsPanel'

export default function StatsPage({
  entries, revisions, verseData, surahs,
}) {
  return (
    <StatsPanel
      entries={entries}
      revisions={revisions}
      verseData={verseData}
      surahs={surahs}
    />
  )
}
