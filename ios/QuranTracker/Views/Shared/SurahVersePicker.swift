import SwiftUI

/// Reusable surah dropdown + verse text field pair for start/end range selection.
/// Port of `SurahVerseFields.jsx`.
struct SurahVersePicker: View {
    @Binding var startSurah: Int?
    @Binding var startVerse: String
    @Binding var endSurah: Int?
    @Binding var endVerse: String
    let availableSurahs: [SurahInfo]
    let quranData: QuranDataManager

    var body: some View {
        VStack(spacing: 12) {
            // Start row
            HStack {
                Picker("Start Surah", selection: $startSurah) {
                    Text("Select surah…").tag(nil as Int?)
                    ForEach(availableSurahs) { s in
                        Text("\(s.num). \(s.name)").tag(s.num as Int?)
                    }
                }
                .labelsHidden()

                TextField("e.g. 5 or 5.2", text: $startVerse)
                    #if os(iOS)
                    .keyboardType(.decimalPad)
                    .textFieldStyle(.roundedBorder)
                    #endif
                    .frame(width: 90)

                if let s = startSurah {
                    Text("/ \(quranData.maxVerses(forSurah: s))")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            // End row
            HStack {
                Picker("End Surah", selection: $endSurah) {
                    Text("Select surah…").tag(nil as Int?)
                    ForEach(availableSurahs) { s in
                        Text("\(s.num). \(s.name)").tag(s.num as Int?)
                    }
                }
                .labelsHidden()

                TextField("e.g. 10", text: $endVerse)
                    #if os(iOS)
                    .keyboardType(.decimalPad)
                    .textFieldStyle(.roundedBorder)
                    #endif
                    .frame(width: 90)

                if let s = endSurah {
                    Text("/ \(quranData.maxVerses(forSurah: s))")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .onChange(of: startSurah) { _, new in
            startVerse = "1"
            if endSurah == nil { endSurah = new }
        }
        .onChange(of: endSurah) { _, new in
            if let s = new {
                endVerse = "\(quranData.maxVerses(forSurah: s))"
            }
        }
    }
}
