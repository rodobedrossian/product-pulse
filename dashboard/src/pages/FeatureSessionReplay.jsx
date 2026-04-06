import { Link } from 'react-router-dom'
import LandingNav from '../components/LandingNav.jsx'

function ReplayMockupLarge() {
  return (
    <div className="pp-mock-window" style={{ maxWidth: 600, margin: '0 auto' }}>
      <div className="pp-mock-chrome">
        <div className="pp-mock-traffic"><span /><span /><span /></div>
        <div className="pp-mock-urlbar">figma.com/proto/abc123/checkout-v3</div>
      </div>
      <div className="pp-mock-replay-body" style={{ minHeight: 280 }}>
        <div className="pp-mock-wireframe">
          <div className="pp-mock-wf-bar" />
          <div className="pp-mock-wf-cols">
            <div className="pp-mock-wf-col" style={{ height: 110 }} />
            <div className="pp-mock-wf-col" style={{ height: 110 }} />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <div className="pp-mock-wf-btn" />
            <div style={{ width: 80, height: 32, background: '#e8e5e0', borderRadius: 4 }} />
          </div>
        </div>
        <div className="pp-mock-cursor" aria-hidden />
      </div>
      <div className="pp-mock-scrubber">
        <span className="pp-mock-scrubber-btn">◀◀</span>
        <span className="pp-mock-scrubber-btn">▶</span>
        <div className="pp-mock-scrubber-track">
          <div className="pp-mock-scrubber-fill" />
          <div className="pp-mock-scrubber-thumb" />
        </div>
        <span className="pp-mock-scrubber-time">0:15 / 0:42</span>
        <span className="pp-mock-scrubber-btn">1×</span>
        <span className="pp-mock-scrubber-btn">2×</span>
      </div>
    </div>
  )
}

function EventTimelineMockup() {
  const events = [
    { time: '0:02', label: 'Page loaded', icon: '⬛' },
    { time: '0:08', label: 'Clicked "Add to cart"', icon: '🖱' },
    { time: '0:15', label: 'Navigated to checkout', icon: '➡️' },
    { time: '0:27', label: 'Hovered over coupon field', icon: '🖱' },
    { time: '0:34', label: 'Clicked "Confirm order"', icon: '🖱' },
    { time: '0:42', label: 'Session ended', icon: '⬛' },
  ]

  return (
    <div className="pp-mock-window">
      <div className="pp-mock-chrome">
        <div className="pp-mock-traffic"><span /><span /><span /></div>
        <div className="pp-mock-urlbar">Event timeline · Alice R.</div>
      </div>
      <div className="pp-mock-body" style={{ display: 'flex', flexDirection: 'column', gap: 0, padding: '0.75rem' }}>
        {events.map((e) => (
          <div key={e.time} style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.45rem 0.25rem',
            borderBottom: '1px solid var(--color-border)',
            fontSize: '0.8rem',
          }}>
            <span style={{ color: 'var(--color-muted)', minWidth: 32, fontVariantNumeric: 'tabular-nums' }}>{e.time}</span>
            <span style={{ fontSize: '0.85rem' }}>{e.icon}</span>
            <span style={{ color: 'var(--color-text)' }}>{e.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function PrivacyMockup() {
  return (
    <div className="pp-mock-window">
      <div className="pp-mock-chrome">
        <div className="pp-mock-traffic"><span /><span /><span /></div>
        <div className="pp-mock-urlbar">Checkout form · masked inputs</div>
      </div>
      <div className="pp-mock-body" style={{ background: '#f8f7f5', padding: '1.25rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {['Name', 'Email', 'Card number'].map((label) => (
            <div key={label}>
              <div style={{ fontSize: '0.72rem', color: 'var(--color-muted)', marginBottom: '0.3rem' }}>{label}</div>
              <div style={{
                background: '#e2dfd9',
                borderRadius: 6,
                height: 36,
                display: 'flex',
                alignItems: 'center',
                paddingInline: '0.75rem',
                gap: '3px',
              }}>
                {Array.from({ length: 12 }).map((_, i) => (
                  <span key={i} style={{
                    display: 'inline-block',
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: '#b5b0a8',
                  }} />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div style={{
          marginTop: '1rem',
          padding: '0.6rem 0.85rem',
          background: 'var(--color-success-bg)',
          border: '1px solid var(--color-success-border)',
          borderRadius: 6,
          fontSize: '0.78rem',
          color: 'var(--color-success)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}>
          <span>🔒</span> Text inputs are masked — keystrokes are never recorded
        </div>
      </div>
    </div>
  )
}

export default function FeatureSessionReplay() {
  return (
    <div className="pp-landing">
      <LandingNav />

      {/* ── Hero ── */}
      <section className="pp-feature-hero">
        <div className="pp-landing-inner" style={{ textAlign: 'center' }}>
          <p className="pp-landing-kicker-light">Session Replay</p>
          <h1 className="pp-landing-h1" style={{ color: 'var(--color-landing-text)', maxWidth: '18ch', margin: '0 auto 1.25rem' }}>
            Watch exactly what happened
          </h1>
          <p className="pp-landing-lead-light" style={{ margin: '0 auto 2.5rem' }}>
            Every participant session is captured automatically. Replay any recording in full — clicks, navigations, hesitations — and understand exactly how people moved through your prototype.
          </p>
          <ReplayMockupLarge />
        </div>
      </section>

      {/* ── What gets recorded ── */}
      <section className="pp-feature-section">
        <div className="pp-landing-inner">
          <div className="pp-landing-grid-2">
            <div>
              <p className="pp-landing-kicker">What gets recorded</p>
              <h2 className="pp-landing-h2">Every interaction, no configuration</h2>
              <p className="pp-landing-lead">
                Product Pulse captures the full picture: every click, every navigation event, every screen transition, and every moment of hesitation. You see what the participant saw, in the order they experienced it.
              </p>
              <ul style={{ color: 'var(--color-text-secondary)', fontSize: '0.95rem', lineHeight: 2, paddingLeft: '1.25rem' }}>
                <li>Clicks and taps on any element</li>
                <li>Page and screen navigations</li>
                <li>Time spent on each screen</li>
                <li>Scroll depth and direction</li>
                <li>Session start and end timestamps</li>
              </ul>
            </div>
            <div>
              <EventTimelineMockup />
            </div>
          </div>
        </div>
      </section>

      {/* ── Privacy ── */}
      <section className="pp-feature-section" style={{ background: 'var(--color-surface)', borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)' }}>
        <div className="pp-landing-inner">
          <div className="pp-landing-grid-2">
            <div>
              <PrivacyMockup />
            </div>
            <div>
              <p className="pp-landing-kicker">Privacy by design</p>
              <h2 className="pp-landing-h2">Keystrokes are never recorded</h2>
              <p className="pp-landing-lead">
                All text input fields are automatically masked. Product Pulse captures navigation and interaction behaviour — not what your participants type. No configuration required; this is the default.
              </p>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.95rem', lineHeight: 1.7 }}>
                Replays are private to your team. Participants are identified only by the name you assign them when creating the test — no email addresses or personal data are collected.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Event timeline ── */}
      <section className="pp-feature-section">
        <div className="pp-landing-inner" style={{ textAlign: 'center' }}>
          <p className="pp-landing-kicker">Watch alongside the event log</p>
          <h2 className="pp-landing-h2" style={{ maxWidth: '22ch', margin: '0 auto 1rem' }}>
            Video and events, side by side
          </h2>
          <p className="pp-landing-lead" style={{ margin: '0 auto 2.5rem' }}>
            While you watch a replay, the event timeline scrolls alongside it. Jump to any interaction instantly — skip the quiet moments and go straight to the clicks that mattered.
          </p>
          <div className="pp-landing-cta-row" style={{ justifyContent: 'center' }}>
            <Link to="/auth" state={{ tab: 'signup' }} className="pp-cta-primary">
              Start for free →
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="pp-landing-footer">
        <div className="pp-landing-footer-inner">
          <div>
            <div className="pp-landing-footer-brand">Product Pulse</div>
            <div className="pp-landing-footer-tagline">Prototype usability, measured</div>
          </div>
          <ul className="pp-landing-footer-links">
            <li><Link to="/">Home</Link></li>
            <li><Link to="/features/goal-tracking">Goal Tracking</Link></li>
            <li><Link to="/features/ai-insights">AI Insights</Link></li>
            <li><Link to="/docs">Docs</Link></li>
          </ul>
        </div>
      </footer>
    </div>
  )
}
