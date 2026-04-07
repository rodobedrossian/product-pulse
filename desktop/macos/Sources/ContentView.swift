import SwiftUI

/// Notion-inspired compact recorder: fixed footprint, clear hierarchy, no technical clutter.
struct ContentView: View {
    @EnvironmentObject private var model: RecorderModel

    private let cardFill = Color(red: 0.11, green: 0.11, blue: 0.11)
    private let cardStroke = Color.white.opacity(0.08)
    private let accentBlue = Color(red: 0.22, green: 0.51, blue: 1.0)
    private let subtext = Color.white.opacity(0.55)

    var body: some View {
        ZStack {
            Color(red: 0.07, green: 0.07, blue: 0.08)
                .ignoresSafeArea()

            mainCard
                .padding(20)
                .frame(width: 400)
        }
        .frame(width: 440, height: 280)
        .onOpenURL { model.apply(url: $0) }
    }

    private var mainCard: some View {
        VStack(spacing: 0) {
            HStack(alignment: .center, spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(Color.white.opacity(0.06))
                        .frame(width: 44, height: 44)
                    Image(systemName: iconName)
                        .font(.system(size: 20, weight: .medium))
                        .foregroundStyle(.white.opacity(0.9))
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text(headline)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(.white)
                    if let sub = subline {
                        Text(sub)
                            .font(.system(size: 12))
                            .foregroundStyle(subtext)
                            .lineLimit(2)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                primaryControl
            }
            .padding(.horizontal, 16)
            .padding(.top, 16)
            .padding(.bottom, 12)

            if model.lastError != nil {
                errorStrip
                    .padding(.horizontal, 16)
                    .padding(.bottom, 12)
            } else {
                Rectangle()
                    .fill(Color.white.opacity(0.07))
                    .frame(height: 1)
                    .padding(.horizontal, 16)

                Text(footerDisclaimer)
                    .font(.system(size: 10))
                    .foregroundStyle(subtext)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 10)
            }
        }
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(cardFill)
                .overlay(
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .strokeBorder(cardStroke, lineWidth: 1)
                )
        )
    }

    private var iconName: String {
        if model.isRecording { return "waveform.circle.fill" }
        if model.isUploading { return "arrow.up.circle.fill" }
        if model.status.contains("Upload complete") { return "checkmark.circle.fill" }
        if model.token != nil { return "record.circle" }
        return "link.circle"
    }

    private var headline: String {
        if model.isUploading { return "Saving" }
        if model.isRecording { return "Recording" }
        if model.isStartingCapture { return "Preparing" }
        if model.status.contains("Upload complete") { return "Saved" }
        if model.token != nil { return "Session recording" }
        return "Product Pulse"
    }

    private var subline: String? {
        if model.isUploading { return "Sending to your workspace" }
        if model.isRecording { return "Stop when you’re done" }
        if model.isStartingCapture { return "Allow prompts if shown" }
        if model.status.contains("Upload complete") { return "You can close this window" }
        if model.token != nil { return "Confirm consent on the call, then start" }
        if model.status.contains("Invalid link") { return model.status }
        return "Open the link from your dashboard"
    }

    private var footerDisclaimer: String {
        "Confirm verbal consent before you record. Only participants who agreed should be captured."
    }

    @ViewBuilder
    private var primaryControl: some View {
        if model.isUploading {
            ProgressView()
                .scaleEffect(0.9)
                .tint(.white)
                .frame(width: 120, height: 36)
        } else if model.isRecording {
            Button {
                Task { await model.stopAndUpload() }
            } label: {
                Text("Stop & save")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 8)
                    .background(
                        Capsule(style: .continuous)
                            .fill(accentBlue)
                    )
            }
            .buttonStyle(.plain)
            .keyboardShortcut(.defaultAction)
        } else {
            Button {
                model.startRecording()
            } label: {
                Text(model.isStartingCapture ? "Starting…" : "Start recording")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 8)
                    .background(
                        Capsule(style: .continuous)
                            .fill(model.canRecord && !model.isStartingCapture ? accentBlue : accentBlue.opacity(0.35))
                    )
            }
            .buttonStyle(.plain)
            .disabled(!model.canRecord || model.isStartingCapture)
            .keyboardShortcut(.defaultAction)
        }
    }

    private var errorStrip: some View {
        VStack(alignment: .leading, spacing: 8) {
            ScrollView {
                Text(model.lastError ?? "")
                    .font(.system(size: 11))
                    .foregroundStyle(Color(red: 1, green: 0.45, blue: 0.45))
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(maxHeight: 72)

            HStack(spacing: 14) {
                Button("Screen & audio access") {
                    MacPrivacySettings.openScreenRecordingPane()
                }
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(accentBlue.opacity(0.95))

                Button("Microphone") {
                    MacPrivacySettings.openMicrophonePane()
                }
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(accentBlue.opacity(0.95))
            }
            .buttonStyle(.plain)
        }
    }
}
