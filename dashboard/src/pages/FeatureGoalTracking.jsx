import { Link } from 'react-router-dom'
import LandingNav from '../components/LandingNav.jsx'

function GoalPickerLarge() {
  return (
    <div className="pp-mock-window" style={{ maxWidth: 600, margin: '0 auto' }}>
      <div className="pp-mock-chrome">
        <div className="pp-mock-traffic"><span /><span /><span /></div>
        <div className="pp-mock-urlbar">figma.com/proto/abc123/checkout-v3</div>
      </div>
      <div className="pp-mock-goal-body" style={{ minHeight: 260 }}>
        <div className="pp-mock-goal-cards" style={{ marginBottom: '0.75rem' }}>
          <div className="pp-mock-goal-card" style={{ height: 70 }} />
          <div className="pp-mock-goal-card" style={{ height: 70 }} />
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <div style={{ height: 36, flex: 2, background: '#e8e5e0', borderRadius: 4 }} />
          <div style={{ height: 36, flex: 1, background: '#e8e5e0', borderRadius: 4 }} />
        </div>
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <div className="pp-mock-goal-highlighted" style={{ width: 150 }}>
            Complete purchase →
            <div className="pp-mock-goal-tooltip">Goal: button.purchase</div>
          </div>
        </div>
        <div className="pp-mock-goal-toolbar">
          <span className="pp-mock-goal-toolbar-item">Navigate</span>
          <span className="pp-mock-goal-toolbar-item">Page URL</span>
          <span className="pp-mock-goal-toolbar-item active">Pick Element</span>
        </div>
      </div>
    </div>
  )
}

function SingleGoalStatsMockup() {
  const participants = [
    { initials: 'AR', name: 'Alice R.', done: true, time: '1m 32s' },
    { initials: 'BK', name: 'Ben K.', done: false, time: null },
    { initials: 'CM', name: 'Carol M.', done: true, time: '2m 48s' },
    { initials: 'DJ', name: 'David J.', done: true, time: '1m 55s' },
    { initials: 'EL', name: 'Emma L.', done: false, time: null },
  ]

  return (
    <div className="pp-mock-window">
      <div className="pp-mock-chrome">
        <div className="pp-mock-traffic"><span /><span /><span /></div>
        <div className="pp-mock-urlbar">Single goal · Checkout flow</div>
      </div>
      <div className="pp-mock-body pp-mock-dash">
        <div className="pp-mock-stats" style={{ marginBottom: '0.85rem' }}>
          <div className="pp-mock-stat">
            <div className="pp-mock-stat-val">60%</div>
            <div className="pp-mock-stat-label">completion</div>
          </div>
          <div className="pp-mock-stat">
            <div className="pp-mock-stat-val">2m 05s</div>
            <div className="pp-mock-stat-label">avg time</div>
          </div>
          <div className="pp-mock-stat">
            <div className="pp-mock-stat-val">5</div>
            <div className="pp-mock-stat-label">participants</div>
          </div>
        </div>
        {participants.map((p) => (
          <div key={p.name} className="pp-mock-row">
            <div className="pp-mock-row-dot">{p.initials}</div>
            <span className="pp-mock-row-name">{p.name}</span>
            <span className={`badge ${p.done ? 'green' : 'red'}`} style={{ fontSize: '0.68rem' }}>
              {p.done ? 'Reached goal' : 'Did not reach'}
            </span>
            <span className="pp-mock-row-time">{p.time ?? '—'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function FunnelMockup() {
  const steps = [
    { label: 'Landing page', pct: 100, count: 10 },
    { label: 'Product page', pct: 80, count: 8 },
    { label: 'Added to cart', pct: 60, count: 6 },
    { label: 'Checkout form', pct: 40, count: 4 },
    { label: 'Confirmed order', pct: 30, count: 3 },
  ]

  const colors = ['#c94a3c', '#d9654a', '#e08060', '#b09070', '#8a847a']

  return (
    <div className="pp-mock-window">
      <div className="pp-mock-chrome">
        <div className="pp-mock-traffic"><span /><span /><span /></div>
        <div className="pp-mock-urlbar">Scenario · E-commerce flow · 10 participants</div>
      </div>
      <div className="pp-mock-funnel">
        {steps.map((s, i) => (
          <div key={s.label} className="pp-mock-funnel-step">
            <span className="pp-mock-funnel-label">{s.label}</span>
            <div className="pp-mock-funnel-bar-wrap">
              <div
                className="pp-mock-funnel-bar"
                style={{ width: `${s.pct}%`, background: colors[i] }}
              >
                {s.pct}%
              </div>
            </div>
            <span className="pp-mock-funnel-count">{s.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function StartEventMockup() {
  return (
    <div className="pp-mock-window">
      <div className="pp-mock-chrome">
        <div className="pp-mock-traffic"><span /><span /><span /></div>
        <div className="pp-mock-urlbar">Start event configuration</div>
      </div>
      <div className="pp-mock-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-text)', marginBottom: '0.25rem' }}>
          When does the clock start?
        </div>
        {[
          { label: 'When participant opens the link', active: false },
          { label: 'When participant clicks a specific element', active: true },
          { label: 'When participant navigates to a specific page', active: false },
        ].map((opt) => (
          <div key={opt.label} style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            padding: '0.6rem 0.75rem',
            border: `1px solid ${opt.active ? 'var(--color-accent)' : 'var(--color-border)'}`,
            borderRadius: 6,
            background: opt.active ? 'rgba(201,74,60,0.05)' : 'transparent',
            cursor: 'default',
          }}>
            <div style={{
              width: 14,
              height: 14,
              borderRadius: '50%',
              border: `2px solid ${opt.active ? 'var(--color-accent)' : 'var(--color-border)'}`,
              background: opt.active ? 'var(--color-accent)' : 'transparent',
              flexShrink: 0,
            }} />
            <span style={{ fontSize: '0.82rem', color: 'var(--color-text)' }}>{opt.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function FeatureGoalTracking() {
  return (
    <div className="pp-landing">
      <LandingNav />

      {/* ── Hero ── */}
      <section className="pp-feature-hero">
        <div className="pp-landing-inner" style={{ textAlign: 'center' }}>
          <p className="pp-landing-kicker-light">Goal Tracking</p>
          <h1 className="pp-landing-h1" style={{ color: 'var(--color-landing-text)', maxWidth: '20ch', margin: '0 auto 1.25rem' }}>
            Define success once. Measure it for everyone.
          </h1>
          <p className="pp-landing-lead-light" style={{ margin: '0 auto 2.5rem' }}>
            Point and click to pick a goal element directly inside your prototype. Product Pulse tracks whether each participant reached it — and how long it took.
          </p>
          <GoalPickerLarge />
        </div>
      </section>

      {/* ── Single goal ── */}
      <section className="pp-feature-section">
        <div className="pp-landing-inner">
          <div className="pp-landing-grid-2">
            <div>
              <p className="pp-landing-kicker">Single-goal tests</p>
              <h2 className="pp-landing-h2">One action. Measured for everyone.</h2>
              <p className="pp-landing-lead">
                Define a single goal — a button click, a page visit, or a specific URL — and Product Pulse tracks it for every participant. See who reached it, who didn't, and how long it took the ones who did.
              </p>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.95rem', lineHeight: 1.7 }}>
                Results update in real time as sessions come in. No waiting for everyone to finish before you start seeing patterns.
              </p>
            </div>
            <div>
              <SingleGoalStatsMockup />
            </div>
          </div>
        </div>
      </section>

      {/* ── Scenario tests ── */}
      <section className="pp-feature-section" style={{ background: 'var(--color-surface)', borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)' }}>
        <div className="pp-landing-inner">
          <div className="pp-landing-grid-2">
            <div>
              <FunnelMockup />
            </div>
            <div>
              <p className="pp-landing-kicker">Scenario tests</p>
              <h2 className="pp-landing-h2">Guide participants. See where they fall off.</h2>
              <p className="pp-landing-lead">
                Build multi-step scenarios with task instructions that appear as an overlay inside the prototype. Each step has its own goal, and Product Pulse tracks completion through the whole sequence — giving you a live funnel view.
              </p>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.95rem', lineHeight: 1.7 }}>
                Scenario steps appear as a floating card that follows participants through the prototype without interfering with the design you're testing.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Start events ── */}
      <section className="pp-feature-section">
        <div className="pp-landing-inner">
          <div className="pp-landing-grid-2">
            <div>
              <p className="pp-landing-kicker">Start events</p>
              <h2 className="pp-landing-h2">Define when the clock begins</h2>
              <p className="pp-landing-lead">
                Don't want to count the time participants spend reading the task instructions? Set a start event — a specific click or page visit — so timing begins exactly when you want it to.
              </p>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.95rem', lineHeight: 1.7 }}>
                This gives you cleaner data on task completion time, separate from reading time or orientation time.
              </p>
            </div>
            <div>
              <StartEventMockup />
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="pp-landing-dark">
        <div className="pp-landing-inner pp-landing-final-cta">
          <h2 className="pp-landing-h2" style={{ color: 'var(--color-landing-text)', margin: '0 auto 0.75rem' }}>
            Start tracking goals today
          </h2>
          <p>No dev setup. Just paste a snippet and go.</p>
          <div className="pp-landing-cta-row" style={{ justifyContent: 'center' }}>
            <Link to="/auth" state={{ tab: 'signup' }} className="pp-cta-primary">
              Get started free
            </Link>
            <Link to="/" className="pp-cta-secondary">See all features</Link>
          </div>
        </div>
      </section>

      <footer className="pp-landing-footer">
        <div className="pp-landing-footer-inner">
          <div>
            <div className="pp-landing-footer-brand">Product Pulse</div>
            <div className="pp-landing-footer-tagline">Prototype usability, measured</div>
          </div>
          <ul className="pp-landing-footer-links">
            <li><Link to="/">Home</Link></li>
            <li><Link to="/features/session-replay">Session Replay</Link></li>
            <li><Link to="/features/ai-insights">AI Insights</Link></li>
            <li><Link to="/docs">Docs</Link></li>
          </ul>
        </div>
      </footer>
    </div>
  )
}
