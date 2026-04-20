import MemorizationForm from '../components/MemorizationForm'
import MemorizedSections from '../components/MemorizedSections'

export default function MemorizationsPage({
  surahs, memorizationSurahs, getMaxVerses,
  editingEntry, entries, newEntries, oldEntries, mergedOldEntries,
  formatEntry, onSubmit, onEdit, onDelete, onCancel,
}) {
  return (
    <>
      <MemorizationForm
        key={editingEntry ? editingEntry.id : 'new-mem'}
        surahs={editingEntry ? surahs : memorizationSurahs}
        getMaxVerses={getMaxVerses}
        editEntry={editingEntry}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
      <MemorizedSections
        entries={entries}
        newEntries={newEntries}
        oldEntries={oldEntries}
        mergedOldEntries={mergedOldEntries}
        formatEntry={formatEntry}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    </>
  )
}
