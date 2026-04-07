import AppKit
import Foundation

/// Opens System Settings / System Preferences to the Screen Recording privacy pane (best-effort across macOS versions).
enum MacPrivacySettings {
    static func openScreenRecordingPane() {
        let candidates = [
            // macOS 15+ “Screen & system audio recording”
            "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?privacy_lite_screen_capture",
            "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_ScreenCapture",
            "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
        ]
        openFirstWorkingURL(candidates)
    }

    static func openMicrophonePane() {
        let candidates = [
            "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?privacy_lite_microphone",
            "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"
        ]
        openFirstWorkingURL(candidates)
    }

    private static func openFirstWorkingURL(_ candidates: [String]) {
        for raw in candidates {
            if let url = URL(string: raw), NSWorkspace.shared.open(url) {
                break
            }
        }
    }
}
