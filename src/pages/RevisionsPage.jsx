import RevisionForm from '../components/RevisionForm'
import RevisionLog from '../components/RevisionLog'

export default function RevisionsPage({
  surahs, revisionSurahs, getMaxVerses,
  editingRevision, sortedRevisions, formatEntry,
  onSubmit, onEdit, onDelete, onCancel,
}) {
  return (
    <>
      <RevisionForm
        key={editingRevision ? editingRevision.id : 'new-rev'}
        surahs={editingRevision ? surahs : revisionSurahs}
        getMaxVerses={getMaxVerses}
        editRevision={editingRevision}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
      <RevisionLog
        revisions={sortedRevisions}
        formatEntry={formatEntry}
        onEdit={onEdit}
        onDelete={onDelete}
        surahs={surahs}
      />
    </>
  )
}
