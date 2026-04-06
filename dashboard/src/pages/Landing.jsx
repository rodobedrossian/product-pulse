import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import LandingNav from '../components/LandingNav.jsx'

/* ── Coded mockup components ─────────────────────────────────────── */

function DashboardMockup() {
  const participants = [
    { initials: 'AR', name: 'Alice R.', done: true, time: '1m 32s' },
    { initials: 'BK', name: 'Ben K.', done: false, time: null },
    { initials: 'CM', name: 'Carol M.', done: true, time: '2m 48s' },
    { initials: 'DJ', name: 'David J.', done: true, time: '1m 55s' },
  ]

  return (
    <div className="pp-mock-window">
      <div className="pp-mock-chrome">
        <div className="pp-mock-traffic">
          <span /><span /><span />
        </div>
        <div className="pp-mock-urlbar">app.productpulse.io/tests/checkout-flow</div>
      </div>
      <div className="pp-mock-body pp-mock-dash">
        <div className="pp-mock-dash-header">
          <span className="pp-mock-dash-title">Checkout flow test</span>
          <span className="badge green" style={{ fontSize: '0.72rem' }}>67% complete</span>
        </div>
        <div className="pp-mock-stats">
          <div className="pp-mock-stat">
            <div className="pp-mock-stat-val">2m 14s</div>
            <div className="pp-mock-stat-label">avg time</div>
          </div>
          <div className="pp-mock-stat">
            <div className="pp-mock-stat-val">67%</div>
            <div className="pp-mock-stat-label">completion</div>
          </div>
          <div className="pp-mock-stat">
            <div className="pp-mock-stat-val">12</div>
            <div className="pp-mock-stat-label">participants</div>
          </div>
        </div>
        {participants.map((p) => (
          <div key={p.name} className="pp-mock-row">
            <div className="pp-mock-row-dot">{p.initials}</div>
            <span className="pp-mock-row-name">{p.name}</span>
            <span className={`badge ${p.done ? 'green' : 'red'}`} style={{ fontSize: '0.68rem' }}>
              {p.done ? 'Completed' : 'Incomplete'}
            </span>
            <span className="pp-mock-row-time">{p.time ?? '—'}</span>
            {p.done && <span className="pp-mock-row-btn">▶ Replay</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

function ReplayMockup() {
  return (
    <div className="pp-mock-window">
      <div className="pp-mock-chrome">
        <div className="pp-mock-traffic">
          <span /><span /><span />
        </div>
        <div className="pp-mock-urlbar">figma.com/proto/abc123/checkout-v3</div>
      </div>
      <div className="pp-mock-replay-body">
        <div className="pp-mock-wireframe">
          <div className="pp-mock-wf-bar" />
          <div className="pp-mock-wf-cols">
            <div className="pp-mock-wf-col" />
            <div className="pp-mock-wf-col" />
          </div>
          <div className="pp-mock-wf-btn" />
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
      </div>
    </div>
  )
}

function GoalPickerMockup() {
  return (
    <div className="pp-mock-window">
      <div className="pp-mock-chrome">
        <div className="pp-mock-traffic">
          <span /><span /><span />
        </div>
        <div className="pp-mock-urlbar">figma.com/proto/abc123/checkout-v3</div>
      </div>
      <div className="pp-mock-goal-body">
        <div className="pp-mock-goal-cards">
          <div className="pp-mock-goal-card" />
          <div className="pp-mock-goal-card" />
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <div style={{ height: 28, flex: 1, background: '#e8e5e0', borderRadius: 4 }} />
          <div style={{ height: 28, flex: 1, background: '#e8e5e0', borderRadius: 4 }} />
        </div>
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <div className="pp-mock-goal-highlighted">
            Checkout →
            <div className="pp-mock-goal-tooltip">Goal: button.checkout</div>
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

function FunnelMockup() {
  const steps = [
    { label: 'Discover product', pct: 100, count: 12 },
    { label: 'Add to cart', pct: 83, count: 10 },
    { label: 'Enter details', pct: 58, count: 7 },
    { label: 'Review order', pct: 42, count: 5 },
    { label: 'Purchase', pct: 33, count: 4 },
  ]

  const colors = [
    '#c94a3c',
    '#d9654a',
    '#e08060',
    '#b09070',
    '#8a847a',
  ]

  return (
    <div className="pp-mock-window">
      <div className="pp-mock-chrome">
        <div className="pp-mock-traffic"><span /><span /><span /></div>
        <div className="pp-mock-urlbar">Checkout scenario · 12 participants</div>
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

/** Logos for tools you might ship prototypes from — shuffled on each page load. */
const PROTOTYPE_TOOL_LOGOS = [
  {
    id: 'v0',
    name: 'v0',
    src: 'https://www.athos-cap.com/wp-content/uploads/2024/09/v0_by_Vercel_logo.png',
    alt: 'v0 by Vercel'
  },
  {
    id: 'figma',
    name: 'Figma',
    src: 'https://upload.wikimedia.org/wikipedia/commons/3/33/Figma-logo.svg',
    alt: 'Figma'
  },
  {
    id: 'lovable',
    name: 'Lovable',
    src: 'https://raw.githubusercontent.com/lobehub/lobe-icons/refs/heads/master/packages/static-png/light/lovable-color.png',
    alt: 'Lovable'
  },
  {
    id: 'cursor',
    name: 'Cursor',
    src: 'https://cursor.com/marketing-static/_next/image?url=%2Fmarketing-static%2Fdownload%2Fapp-icon-3d-dark.png&w=3840&q=70&dpl=dpl_7yLz3c2Ur45gM7FhUhy1EmCqvBZV',
    alt: 'Cursor'
  },
  {
    id: 'claude',
    name: 'Claude',
    src: 'https://upload.wikimedia.org/wikipedia/commons/b/b0/Claude_AI_symbol.svg',
    alt: 'Claude'
  },
  {
    id: 'gemini',
    name: 'Gemini',
    src: 'https://www.gstatic.com/bricks/image/me6u4lx8TR7uZxMdl7YC5WlyZC0P2y0LzMAYP3mICUJJz4x7eZ0AXWaXc3n9EPNxfvCoFc6Y3mmmGg.png',
    alt: 'Google Gemini'
  },
  {
    id: 'replit',
    name: 'Replit',
    src: 'https://www.reachcapital.com/wp-content/uploads/2022/05/Replit_logo.png',
    alt: 'Replit'
  },
  {
    id: 'bolt',
    name: 'Bolt',
    src: 'https://vectorseek.com/wp-content/uploads/2025/07/bolt-ai-logo-01.png',
    alt: 'Bolt'
  }
]

function shufflePrototypeLogos() {
  const items = [...PROTOTYPE_TOOL_LOGOS]
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[items[i], items[j]] = [items[j], items[i]]
  }
  return items
}

function PrototypeToolsLogoGrid() {
  const [logos] = useState(() => shufflePrototypeLogos())
  return (
    <div className="pp-landing-tool-logos" aria-label="Tools and platforms you can ship from">
      {logos.map((logo) => (
        <div key={logo.id} className="pp-landing-tool-logo" title={logo.name}>
          <img
            src={logo.src}
            alt={logo.alt}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
          />
        </div>
      ))}
    </div>
  )
}

function MCPChatMockup() {
  return (
    <div className="pp-mock-chat">
      <div className="pp-mock-chat-header">
        <div className="pp-mock-chat-dot" />
        <span className="pp-mock-chat-title">product-pulse MCP · Claude</span>
      </div>
      <div className="pp-mock-chat-body">
        <span className="pp-mock-chat-tool">MCP tools · agent → agent</span>
        <div className="pp-mock-msg-user">Summarize the checkout flow test</div>
        <div className="pp-mock-msg-ai">
          <strong>Checkout flow · 12 participants</strong>
          <ul>
            <li>67% completion rate (8/12 reached purchase)</li>
            <li>Avg time to complete: 2m 14s</li>
            <li>3 participants dropped off at "Enter details"</li>
            <li>1 participant abandoned at cart</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

/* ── Landing page ─────────────────────────────────────────────────── */

export default function Landing() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!loading && session) {
      navigate('/tests', { replace: true })
    }
  }, [session, loading, navigate])

  return (
    <div className="pp-landing">
      <LandingNav />

      {/* ── Hero ── */}
      <section className="pp-landing-hero">
        <div className="pp-landing-inner">
          <div className="pp-landing-grid-2" style={{ gap: '3rem' }}>
            <div>
              <p className="pp-landing-kicker-light">Prototype usability, measured</p>
              <h1 className="pp-landing-h1" style={{ color: 'var(--color-landing-text)' }}>
                Know exactly how users experience your prototype
              </h1>
              <p className="pp-landing-lead-light">
                Share one link with participants. Product Pulse captures every click, scroll, and hesitation — and shows you exactly who got stuck and where.
              </p>
              <div className="pp-landing-cta-row">
                <Link to="/auth" state={{ tab: 'signup' }} className="pp-cta-primary">
                  Start for free →
                </Link>
                <a href="#how-it-works" className="pp-cta-secondary">
                  See how it works ↓
                </a>
              </div>
            </div>
            <div>
              <DashboardMockup />
            </div>
          </div>
        </div>
      </section>

      {/* ── AI prototyping gap / per-prototype snippets ── */}
      <section className="pp-landing-section-sm pp-landing-stripe">
        <div className="pp-landing-inner">
          <div className="pp-landing-grid-2 pp-landing-prototype-tools-grid">
            <div style={{ maxWidth: '40rem' }}>
              <p className="pp-landing-kicker">Built for how you ship prototypes</p>
              <h2 className="pp-landing-h2" style={{ marginBottom: '1rem' }}>
                The missing piece in the AI prototyping stack is measurement
              </h2>
              <p className="pp-landing-lead" style={{ marginBottom: '1rem' }}>
                Classic product analytics (the kind where you drop <strong>one snippet</strong> in your app and every page view rolls into one place) is built for <strong>one product in production</strong>. That model works great at scale. It breaks when you are iterating <strong>many prototypes in parallel</strong>—each from Lovable, v0, Cursor, or a static host—each with its own goal, funnel, and participant cohort.
              </p>
              <p className="pp-landing-lead" style={{ marginBottom: 0 }}>
                Product Pulse gives you <strong>one snippet per prototype</strong>, tied to the test <em>you</em> define. Run as many tests as you have flows: paste the tag into whatever your AI tool generated, share participant links, and make decisions from <strong>real behaviour</strong>—clicks, time-to-goal, and replays—not guesswork.
              </p>
            </div>
            <PrototypeToolsLogoGrid />
          </div>
        </div>
      </section>

      {/* ── Session Replay ── */}
      <section className="pp-landing-section">
        <div className="pp-landing-inner">
          <div className="pp-landing-grid-2">
            <div>
              <ReplayMockup />
            </div>
            <div>
              <p className="pp-landing-kicker">Session Replay</p>
              <h2 className="pp-landing-h2">Watch exactly what happened. Moment by moment.</h2>
              <p className="pp-landing-lead">
                Every session is captured automatically — clicks, navigations, and time spent on each screen. Replay any participant's session in full, scrub to any moment, and see what they actually did instead of what they said.
              </p>
              <Link to="/features/session-replay" className="pp-cta-link">
                Learn more about Session Replay →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Goal Tracking ── */}
      <section className="pp-landing-section" style={{ background: 'var(--color-surface)', borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)' }}>
        <div className="pp-landing-inner">
          <div className="pp-landing-grid-2">
            <div>
              <p className="pp-landing-kicker">Goal Tracking</p>
              <h2 className="pp-landing-h2">Define success once. Measure it for everyone.</h2>
              <p className="pp-landing-lead">
                Pick a goal element directly inside your prototype — no code, no selectors. Product Pulse automatically detects when each participant reaches it, and records exactly how long it took them to get there.
              </p>
              <Link to="/features/goal-tracking" className="pp-cta-link">
                Learn more about Goal Tracking →
              </Link>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <GoalPickerMockup />
              <div className="pp-mock-stats-card">
                <div className="pp-mock-stats-row">
                  <span className="pp-mock-stats-big">8 / 12</span>
                  <span className="pp-mock-stats-label">participants reached goal</span>
                </div>
                <div className="pp-mock-progress-bar">
                  <div className="pp-mock-progress-fill" style={{ width: '67%' }} />
                </div>
                <div className="pp-mock-progress-label">67% completion · avg 2m 14s</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Scenario Testing ── */}
      <section className="pp-landing-section">
        <div className="pp-landing-inner">
          <div className="pp-landing-grid-2">
            <div>
              <FunnelMockup />
            </div>
            <div>
              <p className="pp-landing-kicker">Scenario Testing</p>
              <h2 className="pp-landing-h2">Guide participants through a complete flow. See where they drop off.</h2>
              <p className="pp-landing-lead">
                Create multi-step scenarios with task instructions that appear as an overlay inside the prototype. Product Pulse tracks progress through each step and shows you a live funnel — so you know exactly where people fall off.
              </p>
              <Link to="/features/goal-tracking" className="pp-cta-link">
                Learn more about Scenario Testing →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── AI Insights / MCP · agent-to-agent ── */}
      <section className="pp-landing-section pp-landing-dark">
        <div className="pp-landing-inner">
          <div className="pp-landing-grid-2">
            <div>
              <p className="pp-landing-kicker-light">AI Insights · MCP</p>
              <h2 className="pp-landing-h2" style={{ color: 'var(--color-landing-text)' }}>
                Agent-to-agent infrastructure for your research data
              </h2>
              <p className="pp-landing-lead-light">
                Product Pulse ships a <strong>Model Context Protocol</strong> server—first-class tools your assistant can call (<code className="pp-landing-code">list_tests</code>,{' '}
                <code className="pp-landing-code">get_test_results</code>, summaries, and more). Connect it in <strong>Claude Desktop</strong>, <strong>Cursor</strong>, or any MCP-capable client: your AI can query structured test data directly—<strong>agent to agent</strong>—without exporting CSVs or copy-pasting screenshots into chat.
              </p>
              <p className="pp-landing-lead-light" style={{ marginBottom: '1.25rem' }}>
                Same agentic idea as the rest of your stack: the tool that helps you build can also <strong>reason over how people used what you built</strong>.
              </p>
              <Link to="/features/ai-insights" className="pp-cta-link">
                Learn more about AI Insights →
              </Link>
            </div>
            <div>
              <MCPChatMockup />
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="pp-landing-section" id="how-it-works">
        <div className="pp-landing-inner">
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <p className="pp-landing-kicker" style={{ justifySelf: 'center' }}>How it works</p>
            <h2 className="pp-landing-h2" style={{ margin: '0 auto 0.5rem' }}>
              From setup to insights in minutes
            </h2>
          </div>
          <div className="pp-how-steps">
            <div className="pp-how-step">
              <div className="pp-how-num">1</div>
              <h3>Add one snippet per prototype (or ask your AI to)</h3>
              <p>
                Each test gets its own lightweight script tag—so parallel prototypes stay separate in the data, unlike a single global tracker for your whole product. Drop it into Framer, Lovable, Webflow, or anything your AI codegen tool output. No SDK, no merge step.
              </p>
            </div>
            <div className="pp-how-step">
              <div className="pp-how-num">2</div>
              <h3>Add participants and share their links</h3>
              <p>Create a test, define your goal, add participant names. Each person gets a unique link that ties their session to their record.</p>
            </div>
            <div className="pp-how-step">
              <div className="pp-how-num">3</div>
              <h3>Watch results come in live</h3>
              <p>Sessions appear in your dashboard as they happen. Replay any recording, check completion rates, and spot patterns across the whole group.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="pp-landing-dark">
        <div className="pp-landing-inner pp-landing-final-cta">
          <h2 className="pp-landing-h2" style={{ color: 'var(--color-landing-text)', margin: '0 auto 0.75rem' }}>
            Ready to run your first test?
          </h2>
          <p>Set up in minutes. No credit card required.</p>
          <div className="pp-landing-cta-row" style={{ justifyContent: 'center' }}>
            <Link to="/auth" state={{ tab: 'signup' }} className="pp-cta-primary">
              Get started free
            </Link>
            <Link to="/auth" className="pp-cta-secondary">
              Already have an account? Sign in
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
            <li><Link to="/features/session-replay">Session Replay</Link></li>
            <li><Link to="/features/goal-tracking">Goal Tracking</Link></li>
            <li><Link to="/features/ai-insights">AI Insights</Link></li>
            <li><Link to="/docs">Docs</Link></li>
            <li><Link to="/auth">Sign in</Link></li>
          </ul>
        </div>
      </footer>
    </div>
  )
}
