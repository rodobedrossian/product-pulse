import { Link } from 'react-router-dom'
import { useDesktopReleases } from '../hooks/useDesktopReleases.js'
import { detectClientDesktopOS } from '../lib/desktopPlatform.js'

/**
 * Header control: direct download when DESKTOP_*_DOWNLOAD_URL is configured, else link to Settings.
 */
export default function DesktopAppDownloadButton() {
  const { mac, win, loading } = useDesktopReleases()
  const os = detectClientDesktopOS()

  const macUrl = mac?.download_url
  const winUrl = win?.download_url
  const primaryUrl =
    os === 'win32' && winUrl ? winUrl : macUrl || winUrl

  if (loading) {
    return (
      <span className="pp-header-desktop-placeholder" aria-hidden>
        …
      </span>
    )
  }

  if (primaryUrl) {
    const label =
      os === 'darwin' && macUrl && primaryUrl === macUrl
        ? 'Download for Mac'
        : os === 'win32' && winUrl && primaryUrl === winUrl
          ? 'Download for Windows'
          : 'Download app'
    return (
      <a
        href={primaryUrl}
        className="pp-btn-header-download"
        rel="noreferrer"
        title={
          macUrl && winUrl
            ? 'We picked a build for your OS; full list is in Settings'
            : 'Download desktop recorder'
        }
      >
        {label}
      </a>
    )
  }

  return (
    <Link to="/settings#desktop-app" className="pp-btn-header-download pp-btn-header-download--muted">
      Desktop app
    </Link>
  )
}
