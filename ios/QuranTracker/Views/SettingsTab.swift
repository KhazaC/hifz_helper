import SwiftUI
import SwiftData
import UniformTypeIdentifiers

/// Settings tab with data management (import, export, clear, load test data).
struct SettingsTab: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(SnapshotManager.self) private var snapshotManager
    @Environment(QuranDataManager.self) private var quranData
    @Environment(NotificationService.self) private var notificationService

    @Query private var entries: [MemorizationEntry]
    @Query private var revisions: [RevisionEntry]

    @AppStorage("notificationsEnabled") private var notificationsEnabled = true
    @AppStorage("dailyReminderHour") private var dailyReminderHour = 8
    @AppStorage("dailyReminderMinute") private var dailyReminderMinute = 0
    @AppStorage("streakRemindersEnabled") private var streakRemindersEnabled = true

    @State private var showImporter = false
    @State private var showClearConfirm = false
    @State private var showLoadTestConfirm = false
    @State private var exportData: Data?
    @State private var alertMessage: String?
    @State private var showAlert = false

    private var exportDocument: ExportDocument? {
        exportData.map { ExportDocument(data: $0) }
    }

    private var reminderTime: Binding<Date> {
        Binding(
            get: {
                Calendar.current.date(from: DateComponents(hour: dailyReminderHour, minute: dailyReminderMinute)) ?? Date()
            },
            set: { newValue in
                let comps = Calendar.current.dateComponents([.hour, .minute], from: newValue)
                dailyReminderHour = comps.hour ?? 8
                dailyReminderMinute = comps.minute ?? 0
            }
        )
    }

    var body: some View {
        NavigationStack {
            List {
                Section("Notifications") {
                    Toggle("Daily Reminders", isOn: $notificationsEnabled)
                        .onChange(of: notificationsEnabled) { _, enabled in
                            if enabled {
                                Task {
                                    let granted = await notificationService.requestPermission()
                                    if !granted { notificationsEnabled = false }
                                }
                            }
                        }

                    if notificationsEnabled {
                        DatePicker("Reminder Time", selection: reminderTime, displayedComponents: .hourAndMinute)

                        Toggle("Streak Reminders", isOn: $streakRemindersEnabled)

                        Text("Streak reminders fire at 9 PM if you haven't revised today")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Section("Data") {
                    HStack {
                        Text("Memorization entries")
                        Spacer()
                        Text("\(entries.count)")
                            .foregroundStyle(.secondary)
                    }
                    HStack {
                        Text("Revision entries")
                        Spacer()
                        Text("\(revisions.count)")
                            .foregroundStyle(.secondary)
                    }
                }

                Section("Import / Export") {
                    Button {
                        prepareExport()
                    } label: {
                        Label("Export Data", systemImage: "square.and.arrow.up")
                    }

                    Button {
                        showImporter = true
                    } label: {
                        Label("Import Data", systemImage: "square.and.arrow.down")
                    }
                }

                Section("Test") {
                    Button {
                        showLoadTestConfirm = true
                    } label: {
                        Label("Load Test Data", systemImage: "testtube.2")
                    }
                }

                Section {
                    Button(role: .destructive) {
                        showClearConfirm = true
                    } label: {
                        Label("Clear All Data", systemImage: "trash")
                    }
                }
            }
            .navigationTitle("Settings")
            .fileImporter(isPresented: $showImporter, allowedContentTypes: [.json]) { result in
                handleImport(result)
            }
            .fileExporter(
                isPresented: Binding(
                    get: { exportData != nil },
                    set: { if !$0 { exportData = nil } }
                ),
                document: exportDocument,
                contentType: .json,
                defaultFilename: "quran-tracker-backup.json"
            ) { result in
                if case .failure(let error) = result {
                    alertMessage = "Export failed: \(error.localizedDescription)"
                    showAlert = true
                }
            }
            .confirmationDialog("Clear all data?", isPresented: $showClearConfirm, titleVisibility: .visible) {
                Button("Clear All", role: .destructive) { clearAllData() }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("This will permanently delete all memorization entries and revisions. This cannot be undone.")
            }
            .confirmationDialog("Load test data?", isPresented: $showLoadTestConfirm, titleVisibility: .visible) {
                Button("Load Test Data", role: .destructive) { loadTestData() }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("This will replace all existing data with sample test data.")
            }
            .alert("Info", isPresented: $showAlert) {
                Button("OK") {}
            } message: {
                Text(alertMessage ?? "")
            }
        }
    }

    // MARK: - Export

    private func prepareExport() {
        do {
            let data = try ImportExportService.exportBackup(
                memorization: entries,
                revisions: revisions,
                snapshot: snapshotManager.snapshot
            )
            exportData = data
        } catch {
            alertMessage = "Export failed: \(error.localizedDescription)"
            showAlert = true
        }
    }

    // MARK: - Import

    private func handleImport(_ result: Result<URL, Error>) {
        switch result {
        case .success(let url):
            guard url.startAccessingSecurityScopedResource() else {
                alertMessage = "Cannot access the selected file."
                showAlert = true
                return
            }
            defer { url.stopAccessingSecurityScopedResource() }

            do {
                let data = try Data(contentsOf: url)
                let imported = try ImportExportService.parseBackup(data)

                // Clear existing
                for e in entries { modelContext.delete(e) }
                for r in revisions { modelContext.delete(r) }

                // Insert imported
                for e in imported.memorization { modelContext.insert(e) }
                for r in imported.revisions { modelContext.insert(r) }

                // Rebuild snapshot
                if imported.snapshot.isEmpty {
                    snapshotManager.rebuild(from: imported.revisions)
                } else {
                    snapshotManager.rebuild(fromCards: imported.snapshot)
                }

                alertMessage = "Imported \(imported.memorization.count) entries and \(imported.revisions.count) revisions."
                showAlert = true
            } catch {
                alertMessage = "Import failed: \(error.localizedDescription)"
                showAlert = true
            }

        case .failure(let error):
            alertMessage = "File selection failed: \(error.localizedDescription)"
            showAlert = true
        }
    }

    // MARK: - Test Data

    private func loadTestData() {
        guard let url = Bundle.main.url(forResource: "test_data", withExtension: "json") else {
            alertMessage = "test_data.json not found in bundle."
            showAlert = true
            return
        }

        do {
            let data = try Data(contentsOf: url)
            let imported = try ImportExportService.parseBackup(data)

            for e in entries { modelContext.delete(e) }
            for r in revisions { modelContext.delete(r) }

            for e in imported.memorization { modelContext.insert(e) }
            for r in imported.revisions { modelContext.insert(r) }

            if imported.snapshot.isEmpty {
                snapshotManager.rebuild(from: imported.revisions)
            } else {
                snapshotManager.rebuild(fromCards: imported.snapshot)
            }

            alertMessage = "Loaded test data: \(imported.memorization.count) entries, \(imported.revisions.count) revisions."
            showAlert = true
        } catch {
            alertMessage = "Failed to load test data: \(error.localizedDescription)"
            showAlert = true
        }
    }

    // MARK: - Clear

    private func clearAllData() {
        for e in entries { modelContext.delete(e) }
        for r in revisions { modelContext.delete(r) }
        snapshotManager.rebuild(from: [])
        alertMessage = "All data cleared."
        showAlert = true
    }
}

// MARK: - Export Document

struct ExportDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.json] }

    let data: Data

    init(data: Data) { self.data = data }

    init(configuration: ReadConfiguration) throws {
        data = configuration.file.regularFileContents ?? Data()
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: data)
    }
}
