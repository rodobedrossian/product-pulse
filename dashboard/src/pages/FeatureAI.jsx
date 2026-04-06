import { Link } from 'react-router-dom'
import LandingNav from '../components/LandingNav.jsx'

function MCPChatLarge() {
  return (
    <div className="pp-mock-chat" style={{ maxWidth: 560, margin: '0 auto' }}>
      <div className="pp-mock-chat-header">
        <div className="pp-mock-chat-dot" />
        <span className="pp-mock-chat-title">product-pulse MCP · Claude</span>
      </div>
      <div className="pp-mock-chat-body">
        <span className="pp-mock-chat-tool">list_tests + get_test_results</span>
        <div className="pp-mock-msg-user">Summarize the checkout flow test</div>
        <div className="pp-mock-msg-ai">
          <strong>Checkout flow · 12 participants</strong>
          <ul>
            <li>67% completion rate (8 of 12 reached the purchase step)</li>
            <li>Average time to complete: 2m 14s</li>
            <li>3 participants dropped at "Enter details" — longest hesitation step</li>
            <li>1 participant abandoned at cart without proceeding</li>
          </ul>
        </div>
        <div className="pp-mock-msg-user">Which participants didn't finish?</div>
        <div className="pp-mock-msg-ai">
          <strong>4 participants did not complete:</strong>
          <ul>
            <li>Ben K. — dropped at cart</li>
            <li>Emma L. — dropped at checkout form</li>
            <li>Frank T. — dropped at checkout form</li>
            <li>Grace H. — dropped at review step</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

function MCPConfigMockup({ tool, config }) {
  return (
    <div style={{
      background: 'var(--color-landing-surface)',
      border: '1px solid var(--color-landing-border)',
      borderRadius: 'var(--radius-md)',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '0.6rem 1rem',
        borderBottom: '1px solid var(--color-landing-border)',
        fontSize: '0.78rem',
        color: 'var(--color-landing-muted)',
        fontWeight: 600,
      }}>
        {tool}
      </div>
      <pre style={{
        margin: 0,
        padding: '1rem',
        fontSize: '0.8rem',
        color: '#c9c3ba',
        lineHeight: 1.6,
        fontFamily: 'monospace',
        overflowX: 'auto',
        background: 'transparent',
      }}>
        {config}
      </pre>
    </div>
  )
}

function ExamplePromptsMockup() {
  const prompts = [
    {
      q: 'Which test has the lowest completion rate this week?',
      a: '"Mobile nav redesign" — 38% (5/13 participants)',
    },
    {
      q: 'How long does the average participant spend on the cart screen?',
      a: '48 seconds on average across all checkout flow sessions',
    },
    {
      q: 'Are there any participants who completed a test but took longer than 5 minutes?',
      a: '2 participants: Grace H. (6m 12s) and Ivan L. (5m 44s)',
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {prompts.map((p) => (
        <div key={p.q} style={{
          background: 'var(--color-landing-surface)',
          border: '1px solid var(--color-landing-border)',
          borderRadius: 'var(--radius-md)',
          padding: '0.85rem 1rem',
        }}>
          <div style={{
            fontSize: '0.82rem',
            color: 'var(--color-landing-text)',
            marginBottom: '0.4rem',
            fontWeight: 500,
          }}>
            &ldquo;{p.q}&rdquo;
          </div>
          <div style={{
            fontSize: '0.8rem',
            color: 'var(--color-landing-muted)',
            paddingLeft: '0.75rem',
            borderLeft: '2px solid var(--color-accent)',
          }}>
            {p.a}
          </div>
        </div>
      ))}
    </div>
  )
}

const cursorConfig = `{
  "mcpServers": {
    "product-pulse": {
      "url": "https://mcp.productpulse.io/mcp",
      "headers": {
        "Authorization": "Bearer pp_mcp_..."
      }
    }
  }
}`

const claudeConfig = `{
  "mcpServers": {
    "product-pulse": {
      "type": "streamable-http",
      "url": "https://mcp.productpulse.io/mcp",
      "headers": {
        "Authorization": "Bearer pp_mcp_..."
      }
    }
  }
}`

export default function FeatureAI() {
  return (
    <div className="pp-landing">
      <LandingNav />

      {/* ── Hero ── */}
      <section className="pp-feature-hero">
        <div className="pp-landing-inner" style={{ textAlign: 'center' }}>
          <p className="pp-landing-kicker-light">AI Insights</p>
          <h1 className="pp-landing-h1" style={{ color: 'var(--color-landing-text)', maxWidth: '22ch', margin: '0 auto 1.25rem' }}>
            Ask your data anything. Get answers in seconds.
          </h1>
          <p className="pp-landing-lead-light" style={{ margin: '0 auto 2.5rem' }}>
            Connect Product Pulse to Claude Desktop, Cursor, or Windsurf via our MCP integration and query your test results in plain English — no dashboards, no filters, no SQL.
          </p>
          <MCPChatLarge />
        </div>
      </section>

      {/* ── Connect ── */}
      <section className="pp-feature-section">
        <div className="pp-landing-inner">
          <div className="pp-landing-grid-2">
            <div>
              <p className="pp-landing-kicker">Connect in 2 minutes</p>
              <h2 className="pp-landing-h2">Works with the AI tools you already use</h2>
              <p className="pp-landing-lead">
                Generate an MCP token from your Settings page, then drop the config snippet into your AI tool of choice. Product Pulse connects via the Model Context Protocol — a standard supported by Claude Desktop, Cursor, Windsurf, and more.
              </p>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.95rem', lineHeight: 1.7 }}>
                Your token is scoped to your team. Every query returns only your team's data.
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <MCPConfigMockup tool="Cursor — .cursor/mcp.json" config={cursorConfig} />
              <MCPConfigMockup tool="Claude Desktop — claude_desktop_config.json" config={claudeConfig} />
            </div>
          </div>
        </div>
      </section>

      {/* ── What you can ask ── */}
      <section className="pp-feature-section pp-landing-dark">
        <div className="pp-landing-inner">
          <div className="pp-landing-grid-2">
            <div>
              <p className="pp-landing-kicker-light">What you can ask</p>
              <h2 className="pp-landing-h2" style={{ color: 'var(--color-landing-text)' }}>
                Natural language over all your test data
              </h2>
              <p className="pp-landing-lead-light">
                Ask about completion rates, individual participants, timing breakdowns, drop-off points, and comparisons across tests. If it's in Product Pulse, you can ask about it.
              </p>
            </div>
            <div>
              <ExamplePromptsMockup />
            </div>
          </div>
        </div>
      </section>

      {/* ── Security ── */}
      <section className="pp-feature-section">
        <div className="pp-landing-inner" style={{ textAlign: 'center', maxWidth: 680, margin: '0 auto' }}>
          <p className="pp-landing-kicker">Team-scoped, token-secured</p>
          <h2 className="pp-landing-h2" style={{ margin: '0 auto 1rem' }}>Your data stays yours</h2>
          <p className="pp-landing-lead" style={{ margin: '0 auto 2rem' }}>
            MCP tokens are generated per-team and stored as a secure hash — we never store the raw value. Revoke and regenerate from Settings at any time. The token only exposes data your team has access to.
          </p>
          <div className="pp-landing-cta-row" style={{ justifyContent: 'center' }}>
            <Link to="/docs" className="pp-cta-secondary-light">Read the docs →</Link>
            <Link to="/auth" state={{ tab: 'signup' }} className="pp-cta-primary">
              Get started free
            </Link>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="pp-landing-dark">
        <div className="pp-landing-inner pp-landing-final-cta">
          <h2 className="pp-landing-h2" style={{ color: 'var(--color-landing-text)', margin: '0 auto 0.75rem' }}>
            Start querying your tests today
          </h2>
          <p>Connect your AI tool in minutes.</p>
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
            <li><Link to="/features/goal-tracking">Goal Tracking</Link></li>
            <li><Link to="/docs">Docs</Link></li>
          </ul>
        </div>
      </footer>
    </div>
  )
}
