import AVFoundation
import CoreGraphics
import CoreMedia
import Foundation
import OSLog
import ScreenCaptureKit

/// **System audio** via ScreenCaptureKit (Meet, browser, etc.) + **microphone** via `AVAudioRecorder`, merged to one `.m4a`.
/// SCK's `captureMicrophone` is unreliable for many setups; dual capture avoids that.
final class SystemMixedAudioRecorder: NSObject, SCStreamOutput, SCStreamDelegate, @unchecked Sendable {
    private let finalOutputURL: URL
    private let systemTempURL: URL
    private let micTempURL: URL

    private let writerQueue = DispatchQueue(label: "com.productpulse.sck.writer")
    private var stream: SCStream?
    private var assetWriter: AVAssetWriter?
    private var audioInput: AVAssetWriterInput?
    private var sessionStarted = false
    private var receivedAudioSampleCount = 0
    private var appendFailureCount = 0

    private var micRecorder: AVAudioRecorder?
    private let onAudioLevel: (@Sendable (Float) -> Void)?

    private let log = Logger(subsystem: "com.productpulse.recorder", category: "SCK")

    init(outputURL: URL, onAudioLevel: (@Sendable (Float) -> Void)? = nil) {
        self.finalOutputURL = outputURL
        let dir = outputURL.deletingLastPathComponent()
        let id = UUID().uuidString.prefix(8)
        self.systemTempURL = dir.appendingPathComponent("productpulse-sys-\(id).m4a")
        self.micTempURL = dir.appendingPathComponent("productpulse-mic-\(id).m4a")
        self.onAudioLevel = onAudioLevel
    }

    func start() async throws {
        try? FileManager.default.removeItem(at: systemTempURL)
        try? FileManager.default.removeItem(at: micTempURL)
        try? FileManager.default.removeItem(at: finalOutputURL)

        // Screen capture + TCC must succeed before touching the mic. Starting AVAudioRecorder first has caused
        // ScreenCaptureKit to see “rejected” TCC on some macOS builds even when Settings shows the toggle on.
        do {
            try await startSystemCapture()
        } catch {
            log.error("startSystemCapture failed: \(error.localizedDescription, privacy: .public)")
            throw Self.enrichScreenCapturePermissionError(error)
        }

        do {
            try startMicrophone()
        } catch {
            log.warning("Microphone not started (\(error.localizedDescription, privacy: .public)) — system audio only.")
        }
    }

    /// Adds recovery text when macOS reports TCC / screen capture denial (common with Xcode DerivedData paths).
    private static func enrichScreenCapturePermissionError(_ error: Error) -> Error {
        let original = error.localizedDescription
        let lower = original.lowercased()
        let bundlePath = Bundle.main.bundleURL.path
        let hint = """
macOS ties Screen Recording to one app path. Debug builds from Xcode live under DerivedData—after a rebuild, the system may still show an old entry as “on” while blocking this binary.

Fix:
1) System Settings → Privacy & Security → Screen & System Audio Recording → remove ProductPulseRecorder with −, quit this app (⌘Q), run again, press Record, Allow.
2) Or Terminal: tccutil reset ScreenCapture com.productpulse.recorder — then reopen the app.
3) For stable permissions, copy ProductPulseRecorder.app to /Applications and launch from there.

This build path:
\(bundlePath)
"""

        let ns = error as NSError
        let looksLikeTCC =
            lower.contains("tcc")
            || lower.contains("rechaz")
            || lower.contains("deneg")
            || lower.contains("denied")
            || lower.contains("not permitted")
            || lower.contains("not authorized")
            || lower.contains("privacy")
            || ns.domain.contains("ScreenCapture")

        if looksLikeTCC {
            return NSError(
                domain: "ProductPulse",
                code: 40,
                userInfo: [NSLocalizedDescriptionKey: original + "\n\n" + hint]
            )
        }
        return error
    }

    private func startMicrophone() throws {
        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 48_000,
            AVNumberOfChannelsKey: 1,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
        ]
        let rec = try AVAudioRecorder(url: micTempURL, settings: settings)
        rec.isMeteringEnabled = true
        guard rec.prepareToRecord(), rec.record() else {
            throw NSError(
                domain: "ProductPulse",
                code: 11,
                userInfo: [NSLocalizedDescriptionKey: "Could not start microphone. Check Microphone permission in System Settings."]
            )
        }
        micRecorder = rec
        log.debug("Microphone recording started")
    }

    private func startSystemCapture() async throws {
        // Do not call CGRequestScreenCaptureAccess() here when permission is already granted—it can confuse TCC in
        // some states. ScreenCaptureKit triggers the correct prompt on first use.
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
        let mainID = CGMainDisplayID()
        guard let display = content.displays.first(where: { $0.displayID == mainID }) ?? content.displays.first else {
            throw NSError(
                domain: "ProductPulse",
                code: 2,
                userInfo: [NSLocalizedDescriptionKey: "No display found for screen capture."]
            )
        }

        let filter = SCContentFilter(display: display, excludingApplications: [], exceptingWindows: [])
        let config = SCStreamConfiguration()
        config.capturesAudio = true
        // Mic handled by AVAudioRecorder — SCK mic is often missing from the mix in practice.
        config.captureMicrophone = false
        config.sampleRate = 48_000
        config.channelCount = 2
        config.width = 320
        config.height = 240
        config.minimumFrameInterval = CMTime(value: 1, timescale: 4)
        config.pixelFormat = kCVPixelFormatType_32BGRA
        config.showsCursor = false

        let stream = SCStream(filter: filter, configuration: config, delegate: self)
        self.stream = stream

        try stream.addStreamOutput(self, type: .screen, sampleHandlerQueue: writerQueue)
        try stream.addStreamOutput(self, type: .audio, sampleHandlerQueue: writerQueue)

        try await stream.startCapture()
    }

    func stop() async throws {
        let s = stream
        stream = nil
        if let s {
            try await s.stopCapture()
        }

        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            writerQueue.async { [weak self] in
                guard let self else {
                    cont.resume()
                    return
                }

                guard let writer = self.assetWriter, let input = self.audioInput else {
                    self.log.warning("stop: no system AVAssetWriter (buffers: \(self.receivedAudioSampleCount))")
                    cont.resume()
                    return
                }

                input.markAsFinished()
                writer.finishWriting {
                    if writer.status == .failed, let err = writer.error {
                        self.log.error("system finishWriting failed: \(err.localizedDescription, privacy: .public)")
                        cont.resume(throwing: err)
                    } else {
                        cont.resume()
                    }
                }
            }
        }

        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            writerQueue.async { [weak self] in
                self?.assetWriter = nil
                self?.audioInput = nil
                self?.sessionStarted = false
                self?.receivedAudioSampleCount = 0
                self?.appendFailureCount = 0
                cont.resume()
            }
        }

        micRecorder?.stop()
        micRecorder = nil

        let sysBytes = fileByteCount(systemTempURL)
        let micBytes = fileByteCount(micTempURL)
        log.info("stop: system file \(sysBytes) B, mic file \(micBytes) B")

        if sysBytes > 512, micBytes > 512 {
            do {
                try await AudioTrackMerge.merge(systemURL: systemTempURL, micURL: micTempURL, outputURL: finalOutputURL)
            } catch {
                log.error("Mix failed, using system track only: \(error.localizedDescription, privacy: .public)")
                if FileManager.default.fileExists(atPath: finalOutputURL.path) {
                    try? FileManager.default.removeItem(at: finalOutputURL)
                }
                try FileManager.default.copyItem(at: systemTempURL, to: finalOutputURL)
            }
        } else if sysBytes > 512 {
            if FileManager.default.fileExists(atPath: finalOutputURL.path) {
                try? FileManager.default.removeItem(at: finalOutputURL)
            }
            try FileManager.default.copyItem(at: systemTempURL, to: finalOutputURL)
            if micBytes <= 512 {
                log.warning("Microphone file missing or tiny — uploaded system audio only.")
            }
        } else if micBytes > 512 {
            if FileManager.default.fileExists(atPath: finalOutputURL.path) {
                try? FileManager.default.removeItem(at: finalOutputURL)
            }
            try FileManager.default.copyItem(at: micTempURL, to: finalOutputURL)
        } else {
            throw NSError(
                domain: "ProductPulse",
                code: 30,
                userInfo: [NSLocalizedDescriptionKey: "No audio captured from system or microphone."]
            )
        }

        try? FileManager.default.removeItem(at: systemTempURL)
        try? FileManager.default.removeItem(at: micTempURL)
    }

    private func fileByteCount(_ url: URL) -> Int {
        guard FileManager.default.fileExists(atPath: url.path) else { return 0 }
        let n = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? NSNumber)?.intValue
        return n ?? 0
    }

    // MARK: - SCStreamOutput

    func stream(
        _ stream: SCStream,
        didOutputSampleBuffer sampleBuffer: CMSampleBuffer,
        of outputType: SCStreamOutputType
    ) {
        switch outputType {
        case .audio:
            handleSystemAudio(sampleBuffer)
        default:
            break
        }
    }

    private func handleSystemAudio(_ sampleBuffer: CMSampleBuffer) {
        receivedAudioSampleCount += 1
        emitMicLevel()

        if assetWriter == nil {
            let hint = CMSampleBufferGetFormatDescription(sampleBuffer)
            let asbd = hint.flatMap { CMAudioFormatDescriptionGetStreamBasicDescription($0)?.pointee }
            let channels = max(1, Int(asbd?.mChannelsPerFrame ?? 2))
            let sampleRate = asbd?.mSampleRate ?? 48_000
            do {
                if FileManager.default.fileExists(atPath: systemTempURL.path) {
                    try FileManager.default.removeItem(at: systemTempURL)
                }
                let writer = try AVAssetWriter(url: systemTempURL, fileType: .m4a)
                let settings: [String: Any] = [
                    AVFormatIDKey: kAudioFormatMPEG4AAC,
                    AVSampleRateKey: sampleRate,
                    AVNumberOfChannelsKey: channels,
                    AVEncoderBitRateKey: min(256_000, 96_000 * channels)
                ]
                let input = AVAssetWriterInput(mediaType: .audio, outputSettings: settings, sourceFormatHint: hint)
                input.expectsMediaDataInRealTime = true
                guard writer.canAdd(input) else {
                    log.error("AVAssetWriter cannot add system audio input")
                    return
                }
                writer.add(input)
                assetWriter = writer
                audioInput = input
            } catch {
                log.error("Failed to create system AVAssetWriter: \(error.localizedDescription, privacy: .public)")
                return
            }
        }

        guard let writer = assetWriter, let input = audioInput else { return }

        if writer.status == .unknown {
            guard writer.startWriting() else {
                log.error("system startWriting failed: \(writer.error?.localizedDescription ?? "unknown", privacy: .public)")
                return
            }
            let t = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
            writer.startSession(atSourceTime: t)
            sessionStarted = true
        }

        guard sessionStarted else { return }
        if !input.isReadyForMoreMediaData { return }
        if !input.append(sampleBuffer) {
            appendFailureCount += 1
            if appendFailureCount <= 3 {
                log.error("system append failed; writer status=\(String(describing: writer.status), privacy: .public)")
            }
        }
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        if (error as NSError).code != 0 {
            log.warning("stream stopped: \(error.localizedDescription, privacy: .public)")
        }
    }

    private func emitMicLevel() {
        guard let micRecorder else { return }
        micRecorder.updateMeters()
        let db = micRecorder.averagePower(forChannel: 0)
        // Map from roughly [-60, 0] dB to [0, 1] normalized range.
        let normalized = max(0, min(1, (db + 60) / 60))
        onAudioLevel?(normalized)
    }
}
