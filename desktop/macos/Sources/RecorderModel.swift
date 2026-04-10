import AppKit
import AVFoundation
import Foundation

@MainActor
final class RecorderModel: ObservableObject {
    static let shared = RecorderModel()

    @Published var token: String?
    @Published var apiBase: String?
    @Published var testId: String?
    @Published var participantId: String?
    @Published var status: String = "Open a "Record with desktop app" link from the Product Pulse dashboard."
    @Published var isRecording = false
    @Published var isUploading = false
    @Published var isStartingCapture = false
    @Published var lastError: String?
    @Published var elapsedSeconds: Int = 0
    @Published var audioLevel: Float = 0

    private var sckRecorder: SystemMixedAudioRecorder?
    private var recordStartedAt: Date?
    private var timer: Timer?

    // ── Segmented recording ───────────────────────────────────────────────────
    /// Each segment is at most this many seconds.  At 96 kbps stereo an
    /// 20-minute segment is ~14 MB — well under any Supabase file-size limit.
    private static let SEGMENT_SECONDS: Double = 20 * 60

    /// Current segment index (0-based).  Incremented each time we roll.
    private var segmentIndex = 0

    /// Background task that fires when it is time to roll to the next segment.
    private var segmentTask: Task<Void, Never>?

    private static func segmentFileURL(_ index: Int) -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent("productpulse-segment-\(index).m4a")
    }

    private init() {}

    func apply(url: URL) {
        lastError = nil
        guard url.scheme?.lowercased() == "productpulse" else { return }
        guard (url.host?.lowercased() == "record") || url.path == "/record" else { return }

        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        func val(_ name: String) -> String? {
            items.first { $0.name == name }?.value
        }

        guard let t = val("token"), let tid = val("test_id"), let pid = val("participant_id") else {
            status = "Invalid link: need token, test_id, and participant_id."
            return
        }

        token = t
        testId = tid
        participantId = pid
        if let base = val("api_base"), !base.isEmpty {
            apiBase = base.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        }
        status = "Session loaded. Obtain verbal consent, then press Record."
    }

    var canRecord: Bool {
        token != nil && apiBase != nil && testId != nil && participantId != nil && !isUploading && !isRecording
            && !isStartingCapture
    }

    func startRecording() {
        lastError = nil
        guard token != nil, apiBase != nil, testId != nil, participantId != nil, !isUploading else { return }
        guard sckRecorder == nil, !isStartingCapture else { return }

        // Reset segment state
        segmentIndex = 0
        (0 ..< 20).forEach { try? FileManager.default.removeItem(at: Self.segmentFileURL($0)) }

        let url = Self.segmentFileURL(0)
        try? FileManager.default.removeItem(at: url)

        isStartingCapture = true
        elapsedSeconds = 0
        audioLevel = 0
        status = "Starting… Allow Screen Recording and Microphone if macOS asks."
        Task {
            await startRecordingTask(outputURL: url)
            isStartingCapture = false
        }
    }

    private func startRecordingTask(outputURL: URL) async {
        do {
            let rec = SystemMixedAudioRecorder(outputURL: outputURL) { [weak self] level in
                guard let self else { return }
                Task { @MainActor in
                    // Asymmetric smoothing: fast attack so peaks register immediately,
                    // slow decay so the waveform doesn't snap to silence between words.
                    let alpha: Float = level > self.audioLevel ? 0.45 : 0.12
                    self.audioLevel = self.audioLevel * (1 - alpha) + level * alpha
                }
            }
            try await rec.start()
            sckRecorder = rec
            recordStartedAt = Date()
            isRecording = true
            startTimer()
            status =
                "Recording… This includes system audio (Meet, Zoom, browser) and your mic. Stop when the session ends."

            // Schedule auto-roll to next segment after SEGMENT_SECONDS
            scheduleNextRoll()
        } catch {
            sckRecorder = nil
            recordStartedAt = nil
            isRecording = false
            stopTimer(resetElapsed: true)
            audioLevel = 0
            lastError = error.localizedDescription
            status = "Could not start recording. See details below."
        }
    }

    // ── Segment rolling ───────────────────────────────────────────────────────

    private func scheduleNextRoll() {
        segmentTask?.cancel()
        segmentTask = Task { @MainActor [weak self] in
            guard let self else { return }
            try? await Task.sleep(for: .seconds(Self.SEGMENT_SECONDS))
            guard !Task.isCancelled, self.isRecording else { return }
            await self.rollSegment()
        }
    }

    /// Starts the next segment recorder, then stops+finalizes+uploads the previous
    /// segment in the background.  The brief overlap during SCK handoff means there
    /// is no gap in captured audio.
    private func rollSegment() async {
        guard let token, let apiBase, let testId, let participantId else { return }

        let completedIndex = segmentIndex
        let completedURL   = Self.segmentFileURL(completedIndex)
        let nextIndex      = completedIndex + 1
        let nextURL        = Self.segmentFileURL(nextIndex)

        // Start the next recorder before tearing down the current one so there
        // is no perceptible gap for the user.
        let newRec = SystemMixedAudioRecorder(outputURL: nextURL) { [weak self] level in
            guard let self else { return }
            Task { @MainActor in
                let alpha: Float = level > self.audioLevel ? 0.45 : 0.12
                self.audioLevel = self.audioLevel * (1 - alpha) + level * alpha
            }
        }
        do {
            try await newRec.start()
        } catch {
            // Could not start next segment (permissions revoked, etc.) — keep recording
            // with the current segment and try again after the next interval.
            scheduleNextRoll()
            return
        }

        // Atomically swap the active recorder.
        let oldRec = sckRecorder
        sckRecorder = newRec
        segmentIndex = nextIndex
        status = "Recording (segment \(nextIndex + 1))…"

        // Schedule the roll after this segment's window too.
        scheduleNextRoll()

        // Finalize and upload the completed segment in the background.
        let segIdx = completedIndex
        Task {
            guard let oldRec else { return }
            do {
                try await oldRec.stop()
            } catch {
                // Log but don't surface — recording continues on the new segment.
                print("[RecorderModel] segment \(segIdx) stop error: \(error)")
                return
            }
            await Self.uploadSegmentFile(
                fileURL: completedURL,
                token: token, apiBase: apiBase,
                testId: testId, participantId: participantId,
                segmentIndex: segIdx
            )
            try? FileManager.default.removeItem(at: completedURL)
        }
    }

    // ── Stop & upload final segment ───────────────────────────────────────────

    func stopAndUpload() async {
        guard isRecording else { return }

        // Cancel pending roll — we are stopping intentionally.
        segmentTask?.cancel()
        segmentTask = nil

        let started = recordStartedAt
        recordStartedAt = nil
        isRecording = false
        stopTimer(resetElapsed: false)
        audioLevel = 0

        let rec = sckRecorder
        sckRecorder = nil

        if let rec {
            do {
                try await rec.stop()
            } catch {
                lastError = error.localizedDescription
                status = "Failed to finalize recording."
                stopTimer(resetElapsed: true)
                return
            }
        }

        guard
            let token,
            let apiBase,
            let testId,
            let participantId
        else {
            status = "Missing session data."
            stopTimer(resetElapsed: true)
            return
        }

        let fileURL = Self.segmentFileURL(segmentIndex)
        let byteSize =
            (try? FileManager.default.attributesOfItem(atPath: fileURL.path)[.size] as? NSNumber)?.intValue ?? 0
        guard byteSize > 512 else {
            lastError = nil
            status =
                "No usable audio file (empty or missing). Keep sound playing during the call (Meet/Chrome), confirm Screen Recording + Microphone for this app, then record again."
            stopTimer(resetElapsed: true)
            return
        }

        isUploading = true
        status = "Uploading…"
        defer { isUploading = false }

        do {
            try await Self.uploadMultipart(
                fileURL: fileURL,
                token: token,
                apiBase: apiBase,
                testId: testId,
                participantId: participantId,
                startedAt: started,
                segmentIndex: segmentIndex
            )
            status = "Upload complete. You can close this window or open another link."
            try? FileManager.default.removeItem(at: fileURL)
            stopTimer(resetElapsed: true)
            audioLevel = 0
        } catch {
            // Keep the local file on failure so the recording isn't lost.
            let errMsg = error.localizedDescription
            if errMsg.lowercased().contains("unauthorized") || errMsg.contains("401") {
                lastError = "Session token expired. Open a fresh \"Record with desktop app\" link from the dashboard and try again. Your local recording is still saved."
            } else {
                lastError = errMsg
            }
            status = "Upload failed — local recording preserved."
            stopTimer(resetElapsed: true)
            audioLevel = 0
        }
    }

    // ── Timer helpers ─────────────────────────────────────────────────────────

    var elapsedLabel: String {
        let minutes = elapsedSeconds / 60
        let seconds = elapsedSeconds % 60
        return String(format: "%02d:%02d", minutes, seconds)
    }

    private func startTimer() {
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            guard let self else { return }
            Task { @MainActor in
                guard self.isRecording, let started = self.recordStartedAt else { return }
                self.elapsedSeconds = Int(Date().timeIntervalSince(started))
            }
        }
    }

    private func stopTimer(resetElapsed: Bool) {
        timer?.invalidate()
        timer = nil
        if resetElapsed {
            elapsedSeconds = 0
        }
    }

    // ── Upload helpers ────────────────────────────────────────────────────────

    /// Background-segment upload (fire-and-forget, no UI state changes).
    private static func uploadSegmentFile(
        fileURL: URL,
        token: String,
        apiBase: String,
        testId: String,
        participantId: String,
        segmentIndex: Int
    ) async {
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return }
        let byteSize =
            (try? FileManager.default.attributesOfItem(atPath: fileURL.path)[.size] as? NSNumber)?.intValue ?? 0
        guard byteSize > 512 else { return }

        do {
            try await uploadMultipart(
                fileURL: fileURL,
                token: token,
                apiBase: apiBase,
                testId: testId,
                participantId: participantId,
                startedAt: nil,
                segmentIndex: segmentIndex
            )
        } catch {
            // Background segment upload failed — local file is preserved by the caller
            // so the moderator can retry manually if needed.
            print("[RecorderModel] background segment \(segmentIndex) upload failed: \(error)")
        }
    }

    private static func uploadMultipart(
        fileURL: URL,
        token: String,
        apiBase: String,
        testId: String,
        participantId: String,
        startedAt: Date?,
        segmentIndex: Int
    ) async throws {
        let base = apiBase.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard let uploadURL = URL(string: "\(base)/api/tests/\(testId)/participants/\(participantId)/recordings") else {
            throw URLError(.badURL)
        }

        let data = try Data(contentsOf: fileURL)
        let boundary = "Boundary-\(UUID().uuidString)"
        var body = Data()

        func append(_ s: String) {
            body.append(s.data(using: .utf8)!)
        }

        append("--\(boundary)\r\n")
        append("Content-Disposition: form-data; name=\"audio\"; filename=\"segment-\(segmentIndex).m4a\"\r\n")
        append("Content-Type: audio/mp4\r\n\r\n")
        body.append(data)
        append("\r\n")

        // Duration of the full session (only meaningful for the final segment)
        if let startedAt {
            let ms = Int(Date().timeIntervalSince(startedAt) * 1000)
            append("--\(boundary)\r\n")
            append("Content-Disposition: form-data; name=\"duration_ms\"\r\n\r\n")
            append("\(ms)\r\n")
        }

        // Segment index — lets the API/UI order multiple clips correctly
        append("--\(boundary)\r\n")
        append("Content-Disposition: form-data; name=\"segment_index\"\r\n\r\n")
        append("\(segmentIndex)\r\n")

        append("--\(boundary)--\r\n")

        var request = URLRequest(url: uploadURL)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.httpBody = body

        let (respData, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw URLError(.badServerResponse)
        }
        guard (200 ... 299).contains(http.statusCode) else {
            let msg =
                (try? JSONSerialization.jsonObject(with: respData) as? [String: Any])?["error"] as? String
                ?? String(data: respData, encoding: .utf8)
                ?? HTTPURLResponse.localizedString(forStatusCode: http.statusCode)
            throw NSError(domain: "ProductPulse", code: http.statusCode, userInfo: [NSLocalizedDescriptionKey: msg])
        }
    }
}
