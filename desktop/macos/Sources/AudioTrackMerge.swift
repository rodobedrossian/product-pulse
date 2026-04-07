import AVFoundation
import Foundation

/// Mixes system (Meet, etc.) and microphone recordings into one AAC file.
enum AudioTrackMerge {
    static func merge(systemURL: URL, micURL: URL, outputURL: URL) async throws {
        let sysAsset = AVURLAsset(url: systemURL)
        let micAsset = AVURLAsset(url: micURL)

        let sysTracks = try await sysAsset.loadTracks(withMediaType: .audio)
        let micTracks = try await micAsset.loadTracks(withMediaType: .audio)
        guard let sysTrack = sysTracks.first else {
            throw NSError(
                domain: "ProductPulse",
                code: 20,
                userInfo: [NSLocalizedDescriptionKey: "No system audio track to merge."]
            )
        }
        guard let micTrack = micTracks.first else {
            throw NSError(
                domain: "ProductPulse",
                code: 21,
                userInfo: [NSLocalizedDescriptionKey: "No microphone track to merge."]
            )
        }

        let sysDur = try await sysAsset.load(.duration)
        let micDur = try await micAsset.load(.duration)
        let dur = CMTimeMinimum(sysDur, micDur)
        guard CMTimeCompare(dur, .zero) == 1 else {
            throw NSError(
                domain: "ProductPulse",
                code: 22,
                userInfo: [NSLocalizedDescriptionKey: "Recording too short to merge."]
            )
        }

        let composition = AVMutableComposition()
        guard
            let compSys = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid),
            let compMic = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)
        else {
            throw NSError(domain: "ProductPulse", code: 23, userInfo: [NSLocalizedDescriptionKey: "Could not create mix tracks."])
        }

        let range = CMTimeRange(start: .zero, duration: dur)
        try compSys.insertTimeRange(range, of: sysTrack, at: .zero)
        try compMic.insertTimeRange(range, of: micTrack, at: .zero)

        let audioMix = AVMutableAudioMix()
        let sysParams = AVMutableAudioMixInputParameters(track: compSys)
        sysParams.setVolume(1.0, at: .zero)
        let micParams = AVMutableAudioMixInputParameters(track: compMic)
        micParams.setVolume(1.35, at: .zero)
        audioMix.inputParameters = [sysParams, micParams]

        if FileManager.default.fileExists(atPath: outputURL.path) {
            try FileManager.default.removeItem(at: outputURL)
        }
        guard let exporter = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetAppleM4A) else {
            throw NSError(domain: "ProductPulse", code: 24, userInfo: [NSLocalizedDescriptionKey: "Export session unavailable."])
        }
        exporter.outputURL = outputURL
        exporter.outputFileType = .m4a
        exporter.audioMix = audioMix

        await exporter.export()
        guard exporter.status == .completed else {
            let msg = exporter.error?.localizedDescription ?? "Export failed (status \(exporter.status.rawValue))."
            throw NSError(domain: "ProductPulse", code: 25, userInfo: [NSLocalizedDescriptionKey: msg])
        }
    }
}
