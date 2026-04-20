import SwiftUI
import SwiftData

/// Memorization form + new/old entry lists.
/// Port of `MemorizationForm.jsx` + `MemorizedSections.jsx`.
struct MemorizationsTab: View {
    let newEntries: [ClassifiedEntry]
    let mergedOldEntries: [MergedPageEntry]
    let onChanged: () -> Void

    @Environment(\.modelContext) private var modelContext
    @Environment(QuranDataManager.self) private var quranData

    @Query(sort: \MemorizationEntry.createdAt) private var entries: [MemorizationEntry]

    @State private var editingEntry: MemorizationEntry?

    // Form state
    @State private var startSurah: Int?
    @State private var startVerse = ""
    @State private var endSurah: Int?
    @State private var endVerse = ""
    @State private var date = Date.now

    // Section state
    @State private var newSectionOpen = true
    @State private var oldSectionOpen = true
    @State private var newShowCount = 5
    @State private var oldShowCount = 5

    private var memorizationSurahs: [SurahInfo] {
        let fully = ClassificationEngine.fullyMemorizedSurahNumbers(entries: entries, quranData: quranData)
        return quranData.surahs.filter { !fully.contains($0.num) }
    }

    private var formSurahs: [SurahInfo] {
        editingEntry != nil ? quranData.surahs : memorizationSurahs
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    memorizationForm
                    memorizedSections
                }
                .padding()
            }
            .navigationTitle("Memorizations")
        }
    }

    // MARK: - Form

    @ViewBuilder
    private var memorizationForm: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(editingEntry != nil ? "Edit Entry" : "Log Memorization")
                .font(.headline)

            SurahVersePicker(
                startSurah: $startSurah,
                startVerse: $startVerse,
                endSurah: $endSurah,
                endVerse: $endVerse,
                availableSurahs: formSurahs,
                quranData: quranData
            )

            DatePicker("Date", selection: $date, in: ...Date.now, displayedComponents: .date)
                .datePickerStyle(.compact)

            Text("Use a past date to backlog")
                .font(.caption)
                .foregroundStyle(.secondary)

            HStack {
                if editingEntry != nil {
                    Button("Cancel", role: .cancel) { cancelEdit() }
                        .buttonStyle(.bordered)
                }
                Spacer()
                Button(editingEntry != nil ? "Update" : "Submit") { submitEntry() }
                    .buttonStyle(.borderedProminent)
                    .disabled(startSurah == nil || endSurah == nil || startVerse.isEmpty || endVerse.isEmpty)
            }
        }
        .padding()
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    // MARK: - Sections

    @ViewBuilder
    private var memorizedSections: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Memorized Sections (\(entries.count))")
                .font(.headline)

            // New entries
            DisclosureGroup(isExpanded: $newSectionOpen) {
                let visible = Array(newEntries.prefix(newShowCount))
                ForEach(visible) { classified in
                    newEntryRow(classified)
                }

                paginationControls(
                    total: newEntries.count,
                    showCount: $newShowCount
                )
            } label: {
                Text("New (\(newEntries.count))")
                    .font(.subheadline.bold())
            }
            .tint(.primary)

            // Old entries
            DisclosureGroup(isExpanded: $oldSectionOpen) {
                let visible = Array(mergedOldEntries.prefix(oldShowCount))
                ForEach(visible) { entry in
                    oldEntryRow(entry)
                }

                paginationControls(
                    total: mergedOldEntries.count,
                    showCount: $oldShowCount
                )
            } label: {
                HStack {
                    Text("Old (\(mergedOldEntries.count))")
                        .font(.subheadline.bold())
                }
            }
            .tint(.primary)
        }
    }

    @ViewBuilder
    private func newEntryRow(_ classified: ClassifiedEntry) -> some View {
        let entry = classified.entry
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(FormatHelpers.formatEntry(entry, quranData: quranData))
                    .font(.subheadline)
                Text(entry.createdAt, style: .date)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Text("\(classified.revisionsRemaining) left")
                .font(.caption2)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(.blue.opacity(0.15))
                .clipShape(Capsule())
            Menu {
                Button("Edit") { startEdit(entry) }
                Button("Delete", role: .destructive) { deleteEntry(entry) }
            } label: {
                Image(systemName: "ellipsis.circle")
            }
        }
        .padding(.vertical, 4)
    }

    @ViewBuilder
    private func oldEntryRow(_ entry: MergedPageEntry) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(FormatHelpers.formatRange(
                    startSurah: entry.startSurah, startVerse: entry.startVerse,
                    endSurah: entry.endSurah, endVerse: entry.endVerse,
                    quranData: quranData
                ))
                .font(.subheadline)

                if let pageNum = entry.pageNum {
                    Text("Page \(pageNum)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer()
            if entry.isMerged {
                Text("merged from \(entry.sourceCount)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }

    @ViewBuilder
    private func paginationControls(total: Int, showCount: Binding<Int>) -> some View {
        if total > showCount.wrappedValue {
            Button("Show more") { showCount.wrappedValue += 10 }
                .frame(maxWidth: .infinity)
        } else if showCount.wrappedValue > 5 && total > 5 {
            Button("Show less") { showCount.wrappedValue = 5 }
                .frame(maxWidth: .infinity)
        }
    }

    // MARK: - Actions

    private func submitEntry() {
        guard let ss = startSurah, let es = endSurah,
              !startVerse.isEmpty, !endVerse.isEmpty else { return }

        if let editing = editingEntry {
            editing.startSurah = ss
            editing.startVerse = startVerse
            editing.endSurah = es
            editing.endVerse = endVerse
            editing.createdAt = date
            editing.updatedAt = .now
        } else {
            let entry = MemorizationEntry(
                startSurah: ss, startVerse: startVerse,
                endSurah: es, endVerse: endVerse,
                createdAt: date
            )
            modelContext.insert(entry)
        }

        resetForm()
        onChanged()
    }

    private func startEdit(_ entry: MemorizationEntry) {
        editingEntry = entry
        startSurah = entry.startSurah
        startVerse = entry.startVerse
        endSurah = entry.endSurah
        endVerse = entry.endVerse
        date = entry.createdAt
    }

    private func cancelEdit() {
        editingEntry = nil
        resetForm()
    }

    private func deleteEntry(_ entry: MemorizationEntry) {
        modelContext.delete(entry)
        onChanged()
    }

    private func resetForm() {
        editingEntry = nil
        startSurah = nil
        startVerse = ""
        endSurah = nil
        endVerse = ""
        date = .now
    }
}
