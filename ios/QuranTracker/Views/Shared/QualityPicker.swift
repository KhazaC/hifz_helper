import SwiftUI

/// 5-chip quality picker (Poor, Weak, Okay, Good, Solid).
/// Port of the quality radio group in RevisionForm.jsx.
struct QualityPicker: View {
    @Binding var quality: Int

    private static let labels: [(Int, String)] = [
        (1, "Poor"), (2, "Weak"), (3, "Okay"), (4, "Good"), (5, "Solid")
    ]

    var body: some View {
        HStack(spacing: 8) {
            ForEach(Self.labels, id: \.0) { value, label in
                Button {
                    quality = value
                } label: {
                    Text(label)
                        .font(.caption)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(quality == value ? qualityColor(value) : Color.gray.opacity(0.15))
                        .foregroundStyle(quality == value ? .white : .primary)
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
            }
        }
    }
}

func qualityColor(_ quality: Int) -> Color {
    switch quality {
    case 1: .red
    case 2: .orange
    case 3: .yellow
    case 4: .green
    case 5: .mint
    default: .gray
    }
}

func retentionColor(_ retention: Double) -> Color {
    switch retention {
    case ..<0.5: .red
    case 0.5..<0.7: .orange
    case 0.7..<0.85: .yellow
    default: .green
    }
}
