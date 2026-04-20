import SwiftUI

/// Inline revision menu shown beneath a suggestion entry.
/// Port of the inline quality picker in SuggestionsPanel.jsx.
struct InlineRevisionMenu: View {
    let startSurah: Int
    let startVerse: String
    let endSurah: Int
    let endVerse: String
    let onSubmit: (RevisionEntry) -> Void
    let onCancel: () -> Void

    @State private var quality = 3
    @State private var showDatePicker = false
    @State private var date = Date.now

    var body: some View {
        VStack(spacing: 8) {
            QualityPicker(quality: $quality)

            if showDatePicker {
                DatePicker("Date", selection: $date, in: ...Date.now, displayedComponents: .date)
                    .datePickerStyle(.compact)
            }

            HStack {
                Button("Cancel", role: .cancel) { onCancel() }
                    .buttonStyle(.bordered)

                Spacer()

                Toggle(isOn: $showDatePicker) {
                    Image(systemName: "calendar")
                }
                .toggleStyle(.button)

                Button("Submit") {
                    let rev = RevisionEntry(
                        startSurah: startSurah,
                        startVerse: startVerse,
                        endSurah: endSurah,
                        endVerse: endVerse,
                        quality: quality,
                        createdAt: showDatePicker ? date : .now
                    )
                    onSubmit(rev)
                }
                .buttonStyle(.borderedProminent)
            }
        }
        .padding()
        .background(.regularMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}
