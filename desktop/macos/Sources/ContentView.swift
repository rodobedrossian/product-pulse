import AppKit
import SwiftUI

/// Notion-inspired compact recorder: fixed footprint, clear hierarchy, no technical clutter.
struct ContentView: View {
    @EnvironmentObject private var model: RecorderModel

    private let cardFill = Color.white
    private let cardStroke = Color.black.opacity(0.08)
    private let accentBlue = Color(red: 0.22, green: 0.51, blue: 1.0)
    private let subtext = Color.black.opacity(0.55)

    var body: some View {
        ZStack(alignment: .topLeading) {
            mainCard
                .padding(0)

            closeButton
                .padding(.top, 14)
                .padding(.leading, 14)

            WindowConfigurator()
                .frame(width: 0, height: 0)
        }
        .frame(width: 520, height: 248)
        .background(Color.clear)
        .onOpenURL { model.apply(url: $0) }
    }

    private var mainCard: some View {
        VStack(spacing: 14) {
            HStack(alignment: .center, spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(Color.black.opacity(0.05))
                        .frame(width: 54, height: 54)
                    Image(systemName: iconName)
                        .font(.system(size: 24, weight: .medium))
                        .foregroundStyle(.black.opacity(0.85))
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text(headline)
                        .font(.system(size: 24, weight: .bold))
                        .foregroundStyle(.black)
                    if let sub = subline {
                        Text(sub)
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundStyle(subtext)
                            .lineLimit(2)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                primaryControl
            }
            .padding(.horizontal, 18)
            .padding(.top, 18)

            if model.isRecording {
                RecordingLevelView(level: model.audioLevel, elapsed: model.elapsedLabel)
                    .padding(.horizontal, 18)
            }

            Rectangle()
                .fill(Color.black.opacity(0.08))
                .frame(height: 1)
                .padding(.horizontal, 18)

            if model.lastError != nil {
                errorStrip
                    .padding(.horizontal, 18)
                    .padding(.bottom, 12)
            } else {
                Text(footerDisclaimer)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(subtext)
                    .multilineTextAlignment(.leading)
                    .lineLimit(2)
                    .padding(.horizontal, 18)
                    .padding(.bottom, 12)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(cardFill)
                .overlay(
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .strokeBorder(cardStroke, lineWidth: 1)
                )
                .shadow(color: .black.opacity(0.14), radius: 20, x: 0, y: 12)
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
        if model.isRecording { return "Audio capture in progress" }
        if model.isStartingCapture { return "Allow prompts if shown" }
        if model.status.contains("Upload complete") { return "You can close this window" }
        if model.token != nil { return "Confirm consent on the call, then start" }
        if model.status.contains("Invalid link") { return model.status }
        return "Open the link from your dashboard"
    }

    private var footerDisclaimer: String {
        "Confirm verbal consent before you record. Only participants who agreed should be captured."
    }

    private var closeButton: some View {
        Button {
            NSApp.keyWindow?.performClose(nil)
        } label: {
            Image(systemName: "xmark")
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(Color.black.opacity(0.68))
                .frame(width: 28, height: 28)
                .background(
                    Circle()
                        .fill(Color.white.opacity(0.9))
                        .overlay(
                            Circle()
                                .strokeBorder(Color.black.opacity(0.09), lineWidth: 1)
                        )
                )
        }
        .buttonStyle(.plain)
        .help("Close")
    }

    @ViewBuilder
    private var primaryControl: some View {
        if model.isUploading {
            ProgressView()
                .scaleEffect(1.0)
                .tint(.black)
                .frame(width: 140, height: 44)
        } else if model.isRecording {
            Button {
                Task { await model.stopAndUpload() }
            } label: {
                Text("Stop & save")
                    .font(.system(size: 17, weight: .bold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 22)
                    .padding(.vertical, 11)
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
                    .font(.system(size: 17, weight: .bold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 22)
                    .padding(.vertical, 11)
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
                    .font(.system(size: 12))
                    .foregroundStyle(Color(red: 1, green: 0.45, blue: 0.45))
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(maxHeight: 72)

            HStack(spacing: 14) {
                Button("Screen & audio access") {
                    MacPrivacySettings.openScreenRecordingPane()
                }
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(accentBlue.opacity(0.95))

                Button("Microphone") {
                    MacPrivacySettings.openMicrophonePane()
                }
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(accentBlue.opacity(0.95))
            }
            .buttonStyle(.plain)
        }
    }
}

private struct WindowConfigurator: NSViewRepresentable {
    func makeNSView(context: Context) -> NSView {
        let view = NSView()
        DispatchQueue.main.async {
            guard let window = view.window else { return }
            configure(window: window)
        }
        return view
    }

    func updateNSView(_ nsView: NSView, context: Context) {
        DispatchQueue.main.async {
            guard let window = nsView.window else { return }
            configure(window: window)
        }
    }

    private func configure(window: NSWindow) {
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.isMovableByWindowBackground = true
        window.backgroundColor = .clear
        window.isOpaque = false
        window.hasShadow = true

        // Keep native resize/move behavior, but hide default window chrome.
        window.standardWindowButton(.closeButton)?.isHidden = true
        window.standardWindowButton(.miniaturizeButton)?.isHidden = true
        window.standardWindowButton(.zoomButton)?.isHidden = true
    }
}

private struct RecordingLevelView: View {
    let level: Float
    let elapsed: String

    private var bars: [CGFloat] {
        let base = CGFloat(max(0.08, min(1, level)))
        return [
            max(0.10, base * 0.55),
            max(0.12, base * 0.80),
            max(0.15, base * 1.00),
            max(0.12, base * 0.82),
            max(0.10, base * 0.60),
            max(0.10, base * 0.70),
            max(0.12, base * 0.90),
            max(0.10, base * 0.62)
        ]
    }

    var body: some View {
        HStack(spacing: 12) {
            Text(elapsed)
                .font(.system(size: 15, weight: .semibold, design: .monospaced))
                .foregroundStyle(.black.opacity(0.75))
                .frame(minWidth: 54, alignment: .leading)

            HStack(alignment: .bottom, spacing: 4) {
                ForEach(Array(bars.enumerated()), id: \.offset) { _, h in
                    RoundedRectangle(cornerRadius: 2, style: .continuous)
                        .fill(
                            LinearGradient(
                                colors: [
                                    Color(red: 0.17, green: 0.44, blue: 0.95),
                                    Color(red: 0.12, green: 0.64, blue: 0.86)
                                ],
                                startPoint: .bottom,
                                endPoint: .top
                            )
                        )
                        .frame(width: 8, height: 12 + (h * 34))
                }
            }
            .animation(.easeOut(duration: 0.32), value: level)

            Text(level > 0.08 ? "Audio detected" : "Listening…")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(.black.opacity(0.55))
                .frame(maxWidth: .infinity, alignment: .trailing)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color(red: 0.97, green: 0.98, blue: 1.0))
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .strokeBorder(Color.black.opacity(0.05), lineWidth: 1)
                )
        )
    }
}
