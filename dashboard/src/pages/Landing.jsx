import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import LandingNav from '../components/LandingNav.jsx'

const PRIMARY_CTA = 'Test your prototype'

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
        <div className="pp-mock-msg-user">Where do users drop off in the checkout test?</div>
        <div className="pp-mock-msg-ai">
          <strong>Checkout flow · 12 participants</strong>
          <ul>
            <li>67% completion rate (8/12 reached purchase)</li>
            <li>Avg time to complete: 2m 14s</li>
            <li>3 participants dropped off at &quot;Enter details&quot;</li>
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

      {/* Hero */}
      <section className="pp-landing-hero">
        <div className="pp-landing-inner">
          <div className="pp-landing-grid-2" style={{ gap: '3rem' }}>
            <div>
              <p className="pp-landing-kicker-light">Validation for AI-built prototypes</p>
              <h1 className="pp-landing-h1" style={{ color: 'var(--color-landing-text)' }}>
                Test your AI-built prototype with real users
              </h1>
              <p className="pp-landing-lead-light" style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '0.75rem' }}>
                Know what works. Fix what doesn&apos;t. Before you ship.
              </p>
              <p className="pp-landing-lead-light">
                Add one snippet to your prototype. Share a link. See where people click, stall, backtrack, or drop off—with session replay and goals tied to <em>this</em> test, not a global production dashboard.
              </p>
              <p className="pp-landing-urgency">You built it in a day. Know if it works before you rebuild it.</p>
              <div className="pp-landing-cta-row">
                <Link to="/auth" state={{ tab: 'signup' }} className="pp-cta-primary">
                  {PRIMARY_CTA} →
                </Link>
                <a href="#how-it-works" className="pp-cta-secondary">
                  See how it works ↓
                </a>
              </div>
              <p className="pp-landing-micro-trust">No instrumentation. No engineering ticket. Free to start.</p>
            </div>
            <div>
              <DashboardMockup />
            </div>
          </div>
        </div>
      </section>

      {/* Trust / tools */}
      <section className="pp-landing-trust-strip" aria-label="Compatible tools">
        <div className="pp-landing-inner">
          <p className="pp-landing-trust-line">
            Build with any AI tool. Paste one snippet. Test with real users.{' '}
            <strong>Works with anything that outputs HTML you can host.</strong>
          </p>
          <PrototypeToolsLogoGrid />
        </div>
      </section>

      {/* Blunt value */}
      <section className="pp-landing-section-sm pp-landing-stripe">
        <div className="pp-landing-inner" style={{ maxWidth: '44rem' }}>
          <p className="pp-landing-kicker">The gap</p>
          <h2 className="pp-landing-h2" style={{ marginBottom: '1rem' }}>
            You&apos;re building faster than you can validate
          </h2>
          <p className="pp-landing-lead" style={{ marginBottom: '1rem' }}>
            AI helps you ship prototypes in minutes. You still don&apos;t know if they <em>work</em> for real people.
          </p>
          <p className="pp-landing-lead" style={{ marginBottom: '1rem' }}>
            Product Pulse turns any hosted prototype into a <strong>behavioral test</strong>: one lightweight snippet per prototype, participant links, and a dashboard for replays and completion—<strong>no moderated sessions required</strong> to get signal.
          </p>
          <p className="pp-landing-lead" style={{ marginBottom: 0 }}>
            <strong>One snippet per prototype. One test per idea.</strong> Iterate in parallel without merging every experiment into a single production dataset.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section className="pp-landing-section" id="how-it-works">
        <div className="pp-landing-inner">
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <p className="pp-landing-kicker" style={{ justifySelf: 'center' }}>How it works</p>
            <h2 className="pp-landing-h2" style={{ margin: '0 auto 0.5rem' }}>
              From prototype to insights in minutes
            </h2>
          </div>
          <div className="pp-how-steps">
            <div className="pp-how-step">
              <div className="pp-how-num">1</div>
              <h3>Add the snippet</h3>
              <p>
                Paste Product Pulse&apos;s tag into your prototype (or ask your AI codegen tool to add it to the layout). Each test gets its own snippet so parallel prototypes stay separate in the data.
              </p>
            </div>
            <div className="pp-how-step">
              <div className="pp-how-num">2</div>
              <h3>Share a test link</h3>
              <p>
                Add participants and send each person their unique link. Sessions are tied to that person so you can replay and compare results cleanly.
              </p>
            </div>
            <div className="pp-how-step">
              <div className="pp-how-num">3</div>
              <h3>See what happens</h3>
              <p>
                Watch replays, track goals and time-to-complete, and— for multi-step tests—see funnel drop-offs. Optionally ask your AI (via MCP) the same questions without CSV exports.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Session replay */}
      <section className="pp-landing-section">
        <div className="pp-landing-inner">
          <div className="pp-landing-grid-2">
            <div>
              <ReplayMockup />
            </div>
            <div>
              <p className="pp-landing-kicker">Session replay</p>
              <h2 className="pp-landing-h2">See what users actually did</h2>
              <p className="pp-landing-lead">
                Not what they said they&apos;d do. Replay full sessions—clicks, navigations, and pacing—so you can see wrong turns, loops, and where people stall before they drop off.
              </p>
              <Link to="/features/session-replay" className="pp-cta-link">
                Learn more about Session Replay →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Goals */}
      <section className="pp-landing-section" style={{ background: 'var(--color-surface)', borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)' }}>
        <div className="pp-landing-inner">
          <div className="pp-landing-grid-2">
            <div>
              <p className="pp-landing-kicker">Goals</p>
              <h2 className="pp-landing-h2">Define success visually</h2>
              <p className="pp-landing-lead">
                No tracking plan. No manual instrumentation. Click an element or match a URL inside your running prototype—that&apos;s your success definition. We track who reaches it and how long it took.
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

      {/* Scenarios */}
      <section className="pp-landing-section" style={{ background: 'var(--color-surface)', borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)' }}>
        <div className="pp-landing-inner">
          <div className="pp-landing-grid-2">
            <div>
              <FunnelMockup />
            </div>
            <div>
              <p className="pp-landing-kicker">Scenario tests</p>
              <h2 className="pp-landing-h2">Test complete flows, step by step</h2>
              <p className="pp-landing-lead">
                Guide participants through ordered tasks with on-prototype instructions. Measure completion per step and see the funnel—so you know exactly where a flow breaks.
              </p>
              <div className="pp-landing-overlay-note">
                <span>💬</span>
                <span>Task instructions appear as a floating card <em>inside</em> the prototype. No scheduling, no moderation calls—participants work through tasks on their own.</span>
              </div>
              <Link to="/features/goal-tracking" className="pp-cta-link" style={{ marginTop: '1.25rem', display: 'inline-flex' }}>
                Learn more about Scenario Testing →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Differentiation */}
      <section className="pp-landing-section-sm pp-landing-stripe">
        <div className="pp-landing-inner">
          <div style={{ maxWidth: '40rem' }}>
            <p className="pp-landing-kicker">Built for prototypes. Not production analytics.</p>
            <h2 className="pp-landing-h2" style={{ marginBottom: '1rem' }}>
              Most tools assume one product, one environment, one dataset
            </h2>
            <p className="pp-landing-lead" style={{ marginBottom: '1rem' }}>
              You&apos;re running <strong>multiple prototypes</strong>, <strong>multiple tests</strong>, and <strong>constant iteration</strong>. Product Pulse matches that: separate tests, separate snippets, separate participant cohorts—without standing up a full analytics implementation for each throwaway URL.
            </p>
            <ul className="pp-landing-diff-list">
              <li><strong>Hotjar / PostHog / Mixpanel</strong> — one snippet, all traffic from all users, aggregated into one dataset. Powerful for production. Wrong tool for a prototype you haven't shipped yet.</li>
              <li><strong>Product Pulse</strong> — one snippet per prototype, tied to the specific test you defined, with named participants you invited. Built for parallel, throwaway URLs that don't live in production.</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Use cases */}
      <section className="pp-landing-section">
        <div className="pp-landing-inner">
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <p className="pp-landing-kicker" style={{ justifySelf: 'center' }}>Use cases</p>
            <h2 className="pp-landing-h2" style={{ margin: '0 auto' }}>
              Validate before you over-invest
            </h2>
          </div>
          <ul className="pp-landing-use-cases">
            <li>Test a landing page before you launch it</li>
            <li>Validate onboarding flows with real behavior, not self-reported feedback</li>
            <li>Find confusion <em>before</em> you commit backend or schema work</li>
            <li>Run quick evals on AI-generated UI without a research ops team</li>
            <li>Test a navigation redesign without touching your production codebase</li>
            <li>Validate checkout or sign-up flows with a handful of real users first</li>
          </ul>
          <div className="pp-landing-compare-callout">
            <strong>Running two ideas in parallel?</strong>
            <p>Each prototype gets its own snippet and its own test — results stay completely separate. Compare side by side without merging everything into one dashboard.</p>
          </div>
        </div>
      </section>

      {/* AI / MCP */}
      <section className="pp-landing-section pp-landing-dark">
        <div className="pp-landing-inner">
          <div className="pp-landing-grid-2">
            <div>
              <p className="pp-landing-kicker-light">AI Insights · MCP</p>
              <h2 className="pp-landing-h2" style={{ color: 'var(--color-landing-text)' }}>
                Turn behavior into answers
              </h2>
              <p className="pp-landing-lead-light">
                Use the dashboard for replays and metrics—then ask your AI assistant the follow-ups. Product Pulse exposes a <strong>Model Context Protocol</strong> server with first-class tools (
                <code className="pp-landing-code">list_tests</code>,{' '}
                <code className="pp-landing-code">get_test_results</code>, funnel summaries, and more) so <strong>Claude Desktop</strong>, <strong>Cursor</strong>, or any MCP client can pull structured test data—<strong>agent to agent</strong>.
              </p>
              <p className="pp-landing-lead-light" style={{ marginBottom: '1.25rem' }}>
                Skip CSV exports and screenshot archaeology. Same agentic stack you use to build can <strong>reason over how people used what you shipped</strong>.
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

      {/* Speed */}
      <section className="pp-landing-speed-strip">
        <div className="pp-landing-inner">
          <h2 className="pp-landing-h2" style={{ marginBottom: '0.5rem', fontSize: 'clamp(1.25rem, 2.5vw, 1.5rem)' }}>
            Set up in minutes, not sprints
          </h2>
          <p className="pp-landing-lead" style={{ margin: 0, maxWidth: '40rem' }}>
            No instrumentation plan. No ticket to engineering. No waiting for a tracking sprint to finish — paste one snippet, share participant links, watch behavior.
          </p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="pp-landing-dark">
        <div className="pp-landing-inner pp-landing-final-cta">
          <h2 className="pp-landing-h2" style={{ color: 'var(--color-landing-text)', margin: '0 auto 0.75rem' }}>
            Ready to see if your prototype actually works?
          </h2>
          <p>Run your first test in minutes. No credit card required.</p>
          <div className="pp-landing-cta-row" style={{ justifyContent: 'center' }}>
            <Link to="/auth" state={{ tab: 'signup' }} className="pp-cta-primary">
              {PRIMARY_CTA} →
            </Link>
            <Link to="/auth" className="pp-cta-secondary">
              Already have an account? Sign in
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="pp-landing-footer">
        <div className="pp-landing-footer-inner">
          <div>
            <div className="pp-landing-footer-brand">Product Pulse</div>
            <div className="pp-landing-footer-tagline">Validation for AI-built prototypes</div>
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
