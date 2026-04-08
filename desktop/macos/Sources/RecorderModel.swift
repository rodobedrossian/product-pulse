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
    @Published var status: String = "Open a “Record with desktop app” link from the Product Pulse dashboard."
    @Published var isRecording = false
    @Published var isUploading = false
    @Published var isStartingCapture = false
    @Published var lastError: String?
    @Published var elapsedSeconds: Int = 0
    @Published var audioLevel: Float = 0

    private var sckRecorder: SystemMixedAudioRecorder?
    private var recordStartedAt: Date?
    private var timer: Timer?

    private static var recordFileURL: URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("productpulse-recording.m4a")
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

        let url = Self.recordFileURL
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

    func stopAndUpload() async {
        guard isRecording else { return }
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

        let fileURL = Self.recordFileURL
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
                startedAt: started
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

    private static func uploadMultipart(
        fileURL: URL,
        token: String,
        apiBase: String,
        testId: String,
        participantId: String,
        startedAt: Date?
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
        append("Content-Disposition: form-data; name=\"audio\"; filename=\"recording.m4a\"\r\n")
        append("Content-Type: audio/mp4\r\n\r\n")
        body.append(data)
        append("\r\n")

        if let startedAt {
            let ms = Int(Date().timeIntervalSince(startedAt) * 1000)
            append("--\(boundary)\r\n")
            append("Content-Disposition: form-data; name=\"duration_ms\"\r\n\r\n")
            append("\(ms)\r\n")
        }

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
