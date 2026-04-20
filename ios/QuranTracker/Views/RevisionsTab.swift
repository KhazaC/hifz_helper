import SwiftUI
import SwiftData

/// Revision form + log with filtering.
/// Port of `RevisionForm.jsx` + `RevisionLog.jsx`.
struct RevisionsTab: View {
    let onSnapshotChanged: () -> Void

    @Environment(\.modelContext) private var modelContext
    @Environment(QuranDataManager.self) private var quranData
    @Environment(SnapshotManager.self) private var snapshotManager

    @Query(sort: \MemorizationEntry.createdAt) private var entries: [MemorizationEntry]
    @Query(sort: \RevisionEntry.updatedAt, order: .reverse) private var revisions: [RevisionEntry]

    @State private var editingRevision: RevisionEntry?

    // Form state
    @State private var startSurah: Int?
    @State private var startVerse = ""
    @State private var endSurah: Int?
    @State private var endVerse = ""
    @State private var quality = 3
    @State private var date = Date.now

    // Filter state
    @State private var showFilters = false
    @State private var filterSurah: Int?
    @State private var filterQuality: Int?
    @State private var filterDateFrom: Date?
    @State private var filterDateTo: Date?
    @State private var showCount = 5

    private var revisionSurahs: [SurahInfo] {
        let nums = ClassificationEngine.memorizedSurahNumbers(entries: entries)
        return quranData.surahs.filter { nums.contains($0.num) }
    }

    private var formSurahs: [SurahInfo] {
        editingRevision != nil ? quranData.surahs : revisionSurahs
    }

    private var filteredRevisions: [RevisionEntry] {
        revisions.filter { rev in
            if let s = filterSurah {
                guard rev.startSurah <= s && rev.endSurah >= s else { return false }
            }
            if let q = filterQuality, rev.quality != q { return false }
            if let from = filterDateFrom {
                guard rev.createdAt >= Calendar.current.startOfDay(for: from) else { return false }
            }
            if let to = filterDateTo {
                let end = Calendar.current.date(byAdding: .day, value: 1, to: Calendar.current.startOfDay(for: to))!
                guard rev.createdAt < end else { return false }
            }
            return true
        }
    }

    private var hasActiveFilters: Bool {
        filterSurah != nil || filterQuality != nil || filterDateFrom != nil || filterDateTo != nil
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    revisionForm
                    revisionLog
                }
                .padding()
            }
            .navigationTitle("Revisions")
        }
    }

    // MARK: - Form

    @ViewBuilder
    private var revisionForm: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(editingRevision != nil ? "Edit Revision" : "Log Revision")
                .font(.headline)

            SurahVersePicker(
                startSurah: $startSurah,
                startVerse: $startVerse,
                endSurah: $endSurah,
                endVerse: $endVerse,
                availableSurahs: formSurahs,
                quranData: quranData
            )

            QualityPicker(quality: $quality)

            DatePicker("Date", selection: $date, in: ...Date.now, displayedComponents: .date)
                .datePickerStyle(.compact)

            Text("Use a past date to backlog")
                .font(.caption)
                .foregroundStyle(.secondary)

            HStack {
                if editingRevision != nil {
                    Button("Cancel", role: .cancel) { cancelEdit() }
                        .buttonStyle(.bordered)
                }
                Spacer()
                Button(editingRevision != nil ? "Update" : "Submit") { submitRevision() }
                    .buttonStyle(.borderedProminent)
                    .disabled(startSurah == nil || endSurah == nil || startVerse.isEmpty || endVerse.isEmpty)
            }
        }
        .padding()
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Log

    @ViewBuilder
    private var revisionLog: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Revision Log")
                    .font(.headline)
                Spacer()
                Button {
                    showFilters.toggle()
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "line.3.horizontal.decrease.circle")
                        if hasActiveFilters {
                            Circle().fill(.blue).frame(width: 6, height: 6)
                        }
                    }
                }
            }

            if showFilters {
                filterPanel
            }

            if hasActiveFilters {
                Text("\(filteredRevisions.count) of \(revisions.count) revisions")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            let visible = Array(filteredRevisions.prefix(showCount))
            ForEach(visible) { rev in
                revisionRow(rev)
            }

            if filteredRevisions.count > showCount {
                Button("Show more") { showCount += 10 }
                    .frame(maxWidth: .infinity)
            } else if showCount > 5 {
                Button("Show less") { showCount = 5 }
                    .frame(maxWidth: .infinity)
            }
        }
    }

    @ViewBuilder
    private var filterPanel: some View {
        VStack(spacing: 8) {
            Picker("Surah", selection: $filterSurah) {
                Text("All surahs").tag(nil as Int?)
                ForEach(revisionSurahs) { s in
                    Text("\(s.num). \(s.name)").tag(s.num as Int?)
                }
            }

            Picker("Quality", selection: $filterQuality) {
                Text("All").tag(nil as Int?)
                ForEach(1...5, id: \.self) { q in
                    Text(FormatHelpers.qualityLabel(q)).tag(q as Int?)
                }
            }

            if filterDateFrom != nil {
                DatePicker("From", selection: Binding(
                    get: { filterDateFrom ?? Date() },
                    set: { filterDateFrom = $0 }
                ), displayedComponents: .date)
            } else {
                Button("Set start date") { filterDateFrom = Date() }
            }

            if filterDateTo != nil {
                DatePicker("To", selection: Binding(
                    get: { filterDateTo ?? Date() },
                    set: { filterDateTo = $0 }
                ), displayedComponents: .date)
            } else {
                Button("Set end date") { filterDateTo = Date() }
            }

            Button("Clear Filters") { clearFilters() }
                .foregroundStyle(.red)
        }
        .padding()
        .background(Color.gray.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    @ViewBuilder
    private func revisionRow(_ rev: RevisionEntry) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(FormatHelpers.formatRevision(rev, quranData: quranData))
                    .font(.subheadline)
                Text(rev.createdAt, style: .date)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Text(FormatHelpers.qualityLabel(rev.quality))
                .font(.caption2)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(qualityColor(rev.quality).opacity(0.2))
                .clipShape(Capsule())
            Menu {
                Button("Edit") { startEdit(rev) }
                Button("Delete", role: .destructive) { deleteRevision(rev) }
            } label: {
                Image(systemName: "ellipsis.circle")
            }
        }
        .padding(.vertical, 4)
    }

    // MARK: - Actions

    private func submitRevision() {
        guard let ss = startSurah, let es = endSurah,
              !startVerse.isEmpty, !endVerse.isEmpty else { return }

        if let editing = editingRevision {
            editing.startSurah = ss
            editing.startVerse = startVerse
            editing.endSurah = es
            editing.endVerse = endVerse
            editing.quality = quality
            editing.createdAt = date
            editing.updatedAt = .now
            // Full rebuild needed after edit
            snapshotManager.rebuild(from: revisions)
        } else {
            let rev = RevisionEntry(
                startSurah: ss, startVerse: startVerse,
                endSurah: es, endVerse: endVerse,
                quality: quality, createdAt: date
            )
            modelContext.insert(rev)
            snapshotManager.applyRevision(rev)
        }

        resetForm()
        onSnapshotChanged()
    }

    private func startEdit(_ rev: RevisionEntry) {
        editingRevision = rev
        startSurah = rev.startSurah
        startVerse = rev.startVerse
        endSurah = rev.endSurah
        endVerse = rev.endVerse
        quality = rev.quality
        date = rev.createdAt
    }

    private func cancelEdit() {
        editingRevision = nil
        resetForm()
    }

    private func deleteRevision(_ rev: RevisionEntry) {
        modelContext.delete(rev)
        snapshotManager.rebuild(from: revisions.filter { $0.id != rev.id })
        onSnapshotChanged()
    }

    private func resetForm() {
        editingRevision = nil
        startSurah = nil
        startVerse = ""
        endSurah = nil
        endVerse = ""
        quality = 3
        date = .now
    }

    private func clearFilters() {
        filterSurah = nil
        filterQuality = nil
        filterDateFrom = nil
        filterDateTo = nil
    }
}
