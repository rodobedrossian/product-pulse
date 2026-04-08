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
                .padding(shadowPad)

            closeButton
                .padding(.top, shadowPad + 14)
                .padding(.leading, shadowPad + 14)

            WindowConfigurator()
                .frame(width: 0, height: 0)
        }
        .frame(width: cardW + shadowPad * 2, height: cardH + shadowPad * 2)
        .background(Color.clear)
        .ignoresSafeArea()
        .onOpenURL { model.apply(url: $0) }
    }

    // Card dimensions + transparent shadow gutter so the drop shadow isn't clipped
    private let cardW: CGFloat = 520
    private let cardH: CGFloat = 248
    private let shadowPad: CGFloat = 24

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
                        .strokeBorder(
                            model.isRecording
                                ? Color.red.opacity(0.45)
                                : cardStroke,
                            lineWidth: model.isRecording ? 1.5 : 1
                        )
                )
                // Red glow when recording, neutral shadow otherwise
                .shadow(
                    color: model.isRecording
                        ? Color.red.opacity(0.18)
                        : Color.black.opacity(0.14),
                    radius: model.isRecording ? 24 : 20,
                    x: 0,
                    y: model.isRecording ? 8 : 12
                )
        )
        .animation(.easeInOut(duration: 0.4), value: model.isRecording)
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
            NSApp.keyWindow?.close()
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
        // Fully borderless — no title bar, no traffic lights, no system chrome.
        window.styleMask = [.borderless, .fullSizeContentView]
        window.isMovableByWindowBackground = true
        window.backgroundColor = .clear
        window.isOpaque = false
        window.hasShadow = false   // card draws its own shadow via SwiftUI
        window.level = .floating   // stay above other windows like a recorder widget
    }
}

// MARK: - Waveform

/// Each bar oscillates at its own frequency/phase; amplitude is driven by the audio level.
/// Uses TimelineView so motion is continuous — no discrete animation triggers needed.
private struct RecordingLevelView: View {
    let level: Float
    let elapsed: String

    // (oscillation Hz, phase 0…1) — prime-ish ratios keep bars from syncing up
    private static let barDNA: [(freq: Double, phase: Double)] = [
        (1.90, 0.00), (2.65, 0.17), (3.20, 0.34), (1.75, 0.51),
        (2.40, 0.12), (3.55, 0.69), (2.10, 0.28), (2.85, 0.45),
        (1.60, 0.73), (3.30, 0.07), (2.55, 0.90), (1.85, 0.57)
    ]

    private let minH: CGFloat =  4   // px at silence
    private let maxH: CGFloat = 46   // px at full volume

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 60.0)) { ctx in
            let t   = ctx.date.timeIntervalSinceReferenceDate
            let lv  = CGFloat(max(0, level))
            let hot = lv > 0.08   // distinguishes "audio present" from idle

            HStack(spacing: 12) {
                // ── Elapsed timer ────────────────────────────────────
                HStack(spacing: 5) {
                    // Pulsing red dot — clearly shows active capture
                    Circle()
                        .fill(Color.red)
                        .frame(width: 7, height: 7)
                        .opacity(hot ? 1 : 0.35)
                        .scaleEffect(hot ? 1 : 0.75)
                        .animation(.easeInOut(duration: 0.6).repeatForever(autoreverses: true), value: hot)

                    Text(elapsed)
                        .font(.system(size: 14, weight: .semibold, design: .monospaced))
                        .foregroundStyle(.black.opacity(0.75))
                }
                .frame(minWidth: 72, alignment: .leading)

                // ── Animated bars ─────────────────────────────────────
                HStack(alignment: .center, spacing: 3) {
                    ForEach(0..<Self.barDNA.count, id: \.self) { i in
                        let dna  = Self.barDNA[i]
                        // Continuous sine in [0,1]
                        let wave = (sin(t * dna.freq * 2 * .pi + dna.phase * 2 * .pi) * 0.5 + 0.5)
                        // At silence: tiny 4–10 px ambient flutter
                        // At full volume: full minH…maxH driven by level + wave
                        let h: CGFloat = hot
                            ? minH + wave * (maxH - minH) * (0.25 + lv * 0.75)
                            : minH + wave * 6
                        Capsule()
                            .fill(barGradient(wave: wave, lv: lv))
                            .frame(width: 4, height: max(minH, h))
                    }
                }
                .frame(height: maxH + 6)

                // ── Status label ──────────────────────────────────────
                Text(hot ? "Audio detected" : "Listening…")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.black.opacity(0.45))
                    .frame(maxWidth: .infinity, alignment: .trailing)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    // Background deepens slightly when audio is active
                    .fill(hot
                          ? Color(red: 0.93, green: 0.96, blue: 1.0)
                          : Color(red: 0.97, green: 0.98, blue: 1.0))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .strokeBorder(
                                hot ? Color(red: 0.22, green: 0.51, blue: 1.0).opacity(0.25)
                                    : Color.black.opacity(0.05),
                                lineWidth: hot ? 1.5 : 1
                            )
                    )
            )
        }
    }

    /// Bars shift from steel-blue toward vivid cyan at peaks, giving depth without noise.
    private func barGradient(wave: Double, lv: CGFloat) -> LinearGradient {
        let t = lv * CGFloat(wave)
        let lo = Color(red: 0.18 - t * 0.04, green: 0.46 + t * 0.18, blue: 0.92)
        let hi = Color(red: 0.14 - t * 0.02, green: 0.60 + t * 0.12, blue: 1.00)
        return LinearGradient(colors: [lo, hi], startPoint: .bottom, endPoint: .top)
    }
}
