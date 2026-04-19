import SuggestionsPanel from '../components/SuggestionsPanel'

export default function SuggestionsPage({
  entries, newEntries, surahSuggestions, revisions,
  formatEntry, getSurahName, onLogRevision,
}) {
  return (
    <SuggestionsPanel
      entries={entries}
      newEntries={newEntries}
      surahSuggestions={surahSuggestions}
      revisions={revisions}
      formatEntry={formatEntry}
      getSurahName={getSurahName}
      onLogRevision={onLogRevision}
    />
  )
}
