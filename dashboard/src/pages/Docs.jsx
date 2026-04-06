import { useEffect, useRef, useState } from 'react'

const MCP_URL = 'https://product-pulse-mcp.up.railway.app/mcp'

const NAV_ITEMS = [
  { id: 'overview',       label: 'Overview' },
  { id: 'quickstart',     label: 'Quick Start' },
  { id: 'snippet',        label: 'Installing the Snippet' },
  { id: 'events',         label: 'Tracked Events' },
  { id: 'goals',          label: 'Defining Goals' },
  { id: 'test-types',     label: 'Test Types' },
  { id: 'session-replay', label: 'Session Replay' },
  { id: 'mcp',            label: 'MCP Integration' },
  { id: 'mcp-tools',      label: 'MCP Tools' },
]

// ── Reusable sub-components ──────────────────────────────────────────────────

function CodeBlock({ code }) {
  const [copied, setCopied] = useState(false)
  async function handleCopy() {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="pp-code-wrap">
      <pre className="pp-code-block">{code.trim()}</pre>
      <button type="button" className="secondary pp-code-copy" onClick={handleCopy}>
        {copied ? '✓ Copied' : 'Copy'}
      </button>
    </div>
  )
}

function ParamTable({ rows }) {
  return (
    <table className="pp-param-table">
      <thead>
        <tr>
          <th>Parameter</th>
          <th>Type</th>
          <th>Required</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.name}>
            <td><span className="pp-param-name">{r.name}</span></td>
            <td><span className="pp-param-type">{r.type}</span></td>
            <td>
              {r.required
                ? <span className="pp-param-required">required</span>
                : <span className="pp-param-optional">optional</span>}
            </td>
            <td>{r.desc}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ToolCard({ name, desc, params, response }) {
  return (
    <div className="pp-tool-card">
      <p className="pp-tool-name">{name}</p>
      <p className="pp-tool-desc">{desc}</p>
      {params.length > 0 && (
        <>
          <p className="pp-label" style={{ marginBottom: '0.4rem', fontSize: '0.8rem' }}>Inputs</p>
          <ParamTable rows={params} />
        </>
      )}
      {response && (
        <>
          <p className="pp-label" style={{ marginBottom: '0.4rem', fontSize: '0.8rem' }}>Response</p>
          <CodeBlock code={response} />
        </>
      )}
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function Docs() {
  const [activeId, setActiveId] = useState('overview')
  const observerRef = useRef(null)

  useEffect(() => {
    const sections = document.querySelectorAll('.pp-docs-section[id]')
    observerRef.current = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible.length > 0) setActiveId(visible[0].target.id)
      },
      { rootMargin: '-10% 0px -60% 0px', threshold: 0 }
    )
    sections.forEach((s) => observerRef.current.observe(s))
    return () => observerRef.current?.disconnect()
  }, [])

  function scrollTo(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="pp-page">
      <div className="pp-docs-layout">

        {/* ── Sidebar ── */}
        <aside className="pp-docs-sidebar">
          <p>Documentation</p>
          <nav>
            {NAV_ITEMS.map(({ id, label }) => (
              <a
                key={id}
                href={`#${id}`}
                className={activeId === id ? 'pp-docs-active' : undefined}
                onClick={(e) => { e.preventDefault(); scrollTo(id) }}
              >
                {label}
              </a>
            ))}
          </nav>
        </aside>

        {/* ── Content ── */}
        <div className="pp-docs-content">

          {/* ── Overview ── */}
          <section id="overview" className="pp-docs-section">
            <h2>Overview</h2>
            <p className="pp-muted" style={{ marginBottom: '1.25rem', fontSize: '1rem' }}>
              Product Pulse is a usability testing platform for prototypes. Set up a test, share a link with participants, and watch interaction data, session replays, and completion results come in automatically — no code changes to your prototype required.
            </p>

            <h3>What you can do</h3>
            <ul>
              <li><strong>Run single-goal tests</strong> — measure whether participants can find or reach a specific element or screen, and how long it takes.</li>
              <li><strong>Run scenario tests</strong> — guide participants through a multi-step flow and see where they drop off.</li>
              <li><strong>Watch session replays</strong> — see exactly what each participant did, click by click, with a full timeline scrubber.</li>
              <li><strong>Ask your AI assistant</strong> — connect Claude Desktop, Cursor, or any MCP-compatible tool to query your results in plain language.</li>
            </ul>
          </section>

          {/* ── Quick Start ── */}
          <section id="quickstart" className="pp-docs-section">
            <h2>Quick Start</h2>
            <p>Get your first test running in under 5 minutes.</p>

            <div className="pp-docs-steps">
              <div className="pp-docs-step">
                <div className="pp-docs-step-num">1</div>
                <div className="pp-docs-step-body">
                  <strong>Create a test</strong>
                  <p>Go to <strong>New test</strong>, enter a name and your prototype URL, and choose Single-goal or Scenario.</p>
                </div>
              </div>
              <div className="pp-docs-step">
                <div className="pp-docs-step-num">2</div>
                <div className="pp-docs-step-body">
                  <strong>Define your goal</strong>
                  <p>On the test setup page, click <strong>Pick element</strong> — your prototype opens in a selection mode. Click the target element or navigate to the destination screen to record the goal.</p>
                </div>
              </div>
              <div className="pp-docs-step">
                <div className="pp-docs-step-num">3</div>
                <div className="pp-docs-step-body">
                  <strong>Add participants</strong>
                  <p>Enter a participant name to generate a unique link. Share it — when they open it, tracking begins automatically. No instructions needed on their end.</p>
                </div>
              </div>
              <div className="pp-docs-step">
                <div className="pp-docs-step-num">4</div>
                <div className="pp-docs-step-body">
                  <strong>View results</strong>
                  <p>Go to the <strong>Results</strong> tab to see completion rates, timing, event timelines, and session replays. Or ask your AI assistant via MCP.</p>
                </div>
              </div>
            </div>
          </section>

          {/* ── Snippet ── */}
          <section id="snippet" className="pp-docs-section">
            <h2>Installing the Snippet</h2>
            <p>
              The snippet is what makes tracking work. It's a small piece of code that you paste into your prototype once — it handles all event capture, session recording, and the participant task overlay automatically.
            </p>

            <h3>Getting the snippet</h3>
            <p>
              You don't need to write it yourself. On the test setup page, the embed code is already generated for you with your test's details pre-filled. It looks like this:
            </p>
            <CodeBlock code={`<script src="https://your-api.railway.app/api/tests/{testId}/snippet.js"></script>`} />
            <p>
              Paste it into the <code>&lt;head&gt;</code> or just before <code>&lt;/body&gt;</code> on every page of your prototype. If your prototype is a single-page app, one paste is enough.
            </p>

            <div className="pp-docs-note">
              <strong>Figma / Webflow / no-code tools:</strong> If your prototype doesn't let you add custom scripts, you'll need to export it to a host that supports HTML embedding — or test with a coded prototype instead.
            </div>

            <h3>How participants get tracked</h3>
            <p>
              When you add a participant on the test setup page and share their link, the link already contains everything needed to identify that participant's session. No extra setup is required — tracking starts the moment they open the link.
            </p>

            <h3>Goal selection mode</h3>
            <p>
              When you click <strong>Pick element</strong> on the test setup page, your prototype opens in a special mode just for you. Hover over any element on the page and it highlights — click it to set it as the goal. You can also click <strong>Use page URL</strong> to set a destination screen as the goal instead. The dashboard records your selection automatically and closes the window.
            </p>
            <p>
              This mode is completely separate from participant sessions. Your participants will never see it.
            </p>
          </section>

          {/* ── Events ── */}
          <section id="events" className="pp-docs-section">
            <h2>Tracked Events</h2>
            <p>
              The snippet automatically records participant interactions as they happen. You don't configure what gets tracked — it captures everything relevant out of the box.
            </p>

            <table className="pp-param-table" style={{ marginBottom: '1.5rem' }}>
              <thead>
                <tr>
                  <th>Interaction</th>
                  <th>When it's recorded</th>
                  <th>What you see in results</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Click</strong></td>
                  <td>The participant clicks anything — buttons, links, images, text</td>
                  <td>The element that was clicked, its label, the page it was on, and a screenshot</td>
                </tr>
                <tr>
                  <td><strong>Page navigation</strong></td>
                  <td>The participant moves to a different screen or URL</td>
                  <td>The destination URL and a screenshot of the new screen</td>
                </tr>
                <tr>
                  <td><strong>Form interaction</strong></td>
                  <td>The participant fills in or changes a form field</td>
                  <td>That a form field was touched — values are never stored</td>
                </tr>
              </tbody>
            </table>

            <h3>Custom tracking</h3>
            <p>
              If your prototype has interactions that aren't covered automatically — like a custom animation trigger or a multi-step modal — you can log them manually using a single line of JavaScript:
            </p>
            <CodeBlock code={`window.ProtoPulse.track('animation_played', { name: 'onboarding-intro' })`} />
            <p>
              The first argument is a label you choose. The second is optional extra context. Custom events appear in the participant's event timeline alongside automatically tracked ones.
            </p>
          </section>

          {/* ── Goals ── */}
          <section id="goals" className="pp-docs-section">
            <h2>Defining Goals</h2>
            <p>
              A goal is the action that marks success for a test or step. When a participant reaches their goal, Product Pulse records the completion and stops timing.
            </p>

            <h3>Three ways to define a goal</h3>
            <div className="pp-docs-steps" style={{ marginBottom: '1.25rem' }}>
              <div className="pp-docs-step">
                <div className="pp-docs-step-num" style={{ background: 'var(--color-text)', fontSize: '0.75rem' }}>1</div>
                <div className="pp-docs-step-body">
                  <strong>Click a specific element</strong>
                  <p>The participant must click a particular button, link, or element — anywhere on the prototype. Use this when the goal is a single action like "click the checkout button."</p>
                </div>
              </div>
              <div className="pp-docs-step">
                <div className="pp-docs-step-num" style={{ background: 'var(--color-text)', fontSize: '0.75rem' }}>2</div>
                <div className="pp-docs-step-body">
                  <strong>Reach a specific screen</strong>
                  <p>The participant must navigate to a particular page or URL. Use this when the goal is an outcome like "arriving at the confirmation screen."</p>
                </div>
              </div>
              <div className="pp-docs-step">
                <div className="pp-docs-step-num" style={{ background: 'var(--color-text)', fontSize: '0.75rem' }}>3</div>
                <div className="pp-docs-step-body">
                  <strong>Click an element on a specific screen</strong>
                  <p>Both must match — the right element clicked on the right page. Use this when the same button appears on multiple screens and you only want to count one of them.</p>
                </div>
              </div>
            </div>

            <p>
              The easiest way to set a goal is the <strong>visual picker</strong>. Click <strong>Pick element</strong> on the test setup page, navigate to the right screen in your prototype, then click the target element (or choose "Use page URL" for a screen-based goal). The dashboard captures the details automatically.
            </p>

            <h3>Start point (optional)</h3>
            <p>
              You can also define a <strong>start point</strong> — the action that begins timing for a participant. If you leave it blank, timing starts from the participant's very first interaction. A start point is useful when participants need to navigate to the right place before the actual task begins, and you don't want that navigation counted in the time.
            </p>
          </section>

          {/* ── Test Types ── */}
          <section id="test-types" className="pp-docs-section">
            <h2>Test Types</h2>

            <h3>Single-goal test</h3>
            <p>
              Best for measuring whether participants can complete one specific task — finding the checkout button, locating a setting, or reaching a particular screen. Results show completion rate and time-to-complete for each participant.
            </p>

            <p><strong>Fields on the New Test form:</strong></p>
            <table className="pp-param-table" style={{ marginBottom: '1.5rem' }}>
              <thead><tr><th>Field</th><th>Required</th><th>What it does</th></tr></thead>
              <tbody>
                <tr>
                  <td><strong>Test name</strong></td>
                  <td><span className="pp-param-required">required</span></td>
                  <td>A label for your own reference — not shown to participants</td>
                </tr>
                <tr>
                  <td><strong>Prototype URL</strong></td>
                  <td><span className="pp-param-required">required</span></td>
                  <td>The starting page of your prototype</td>
                </tr>
                <tr>
                  <td><strong>Start point</strong></td>
                  <td><span className="pp-param-optional">optional</span></td>
                  <td>The action that begins timing. If blank, timing starts from the first interaction.</td>
                </tr>
                <tr>
                  <td><strong>Goal</strong></td>
                  <td><span className="pp-param-optional">optional</span></td>
                  <td>The element or screen the participant must reach. Without a goal, events are still tracked but completion is not automatically detected.</td>
                </tr>
              </tbody>
            </table>

            <p><strong>What results look like:</strong> For each participant you'll see whether they completed the goal, how long it took, a full event timeline with screenshots, and a link to watch their session replay.</p>

            <h3>Scenario test (multi-step)</h3>
            <p>
              Best for testing a complete user flow — onboarding, a purchase funnel, a sign-up sequence. Participants are guided through tasks one at a time via an on-screen card. Results show a drop-off funnel across all steps.
            </p>

            <p><strong>Fields on the New Test form:</strong> Same as single-goal (name and prototype URL), plus you build out steps after creating the test.</p>

            <p><strong>Each step has three fields:</strong></p>
            <table className="pp-param-table" style={{ marginBottom: '1.5rem' }}>
              <thead><tr><th>Field</th><th>Required</th><th>What it does</th></tr></thead>
              <tbody>
                <tr>
                  <td><strong>Title</strong></td>
                  <td><span className="pp-param-optional">optional</span></td>
                  <td>A short label shown to you in the results funnel — not visible to participants</td>
                </tr>
                <tr>
                  <td><strong>Task</strong></td>
                  <td><span className="pp-param-optional">optional</span></td>
                  <td>The instruction shown to the participant in the on-screen overlay card during their session</td>
                </tr>
                <tr>
                  <td><strong>Goal</strong></td>
                  <td><span className="pp-param-optional">optional</span></td>
                  <td>The element or screen that marks this step as complete. Set using the visual picker.</td>
                </tr>
              </tbody>
            </table>

            <p><strong>How participants experience it:</strong> An overlay card appears in the corner of the screen showing the current task. When they complete the step's goal, the card celebrates briefly and advances to the next task automatically.</p>

            <p><strong>What results look like:</strong> A completion funnel showing how many participants finished each step, median time per step, and where the biggest drop-offs happened. You can also drill into individual participants to see which steps they completed and watch their replay.</p>

            <div className="pp-docs-note">
              <strong>Step order is enforced.</strong> Participants can only complete steps in sequence — completing a later step before an earlier one doesn't count. This keeps your funnel data accurate.
            </div>
          </section>

          {/* ── Session Replay ── */}
          <section id="session-replay" className="pp-docs-section">
            <h2>Session Replay</h2>
            <p>
              Every participant session is recorded automatically. No configuration needed — if tracking is running, recording is running.
            </p>

            <h3>What you can see</h3>
            <p>
              Replays reconstruct the participant's full session: every click, scroll, and screen change, exactly as they experienced it. You can scrub through the timeline, pause on any moment, and see what the participant saw at each point in time.
            </p>

            <h3>Viewing a replay</h3>
            <p>
              Go to the <strong>Results</strong> tab for any test. Next to each participant, if a recording is available, you'll see a <strong>Watch replay</strong> button. Click it to open the full-screen player with timeline scrubber and playback controls.
            </p>

            <h3>Privacy</h3>
            <ul>
              <li><strong>No form values are stored.</strong> Anything a participant types — passwords, emails, names, search queries — is replaced with placeholders before it ever leaves their device.</li>
              <li><strong>No audio or video.</strong> Replays capture screen state and interactions only — not the participant's camera or microphone.</li>
              <li><strong>Team-only access.</strong> Recordings are private and only accessible to members of your team.</li>
            </ul>
          </section>

          {/* ── MCP Integration ── */}
          <section id="mcp" className="pp-docs-section">
            <h2>MCP Integration</h2>
            <p>
              The MCP (Model Context Protocol) server exposes your Product Pulse data as tools that any AI assistant can call.
              Instead of opening the dashboard, you can ask in plain English: <em>"Summarize the checkout flow test"</em> or <em>"Which step had the highest drop-off?"</em>
            </p>

            <h3>1. Generate a token</h3>
            <p>
              Go to <strong>Settings → AI / MCP Access</strong>, enter a label (e.g. "Claude Desktop"), and click <strong>Generate token</strong>.
              Copy the <code>pp_mcp_…</code> token — it's shown only once.
            </p>

            <h3>2. Configure your AI tool</h3>

            <p><strong>Cursor</strong> — add to <code>~/.cursor/mcp.json</code>:</p>
            <CodeBlock code={`{
  "mcpServers": {
    "product-pulse": {
      "type": "http",
      "url": "${MCP_URL}",
      "headers": {
        "Authorization": "Bearer pp_mcp_your_token_here"
      }
    }
  }
}`} />

            <p><strong>Claude Desktop</strong> — add to <code>claude_desktop_config.json</code>:</p>
            <CodeBlock code={`{
  "mcpServers": {
    "product-pulse": {
      "type": "http",
      "url": "${MCP_URL}",
      "headers": {
        "Authorization": "Bearer pp_mcp_your_token_here"
      }
    }
  }
}`} />

            <div className="pp-docs-note">
              <strong>Transport:</strong> The server uses Streamable HTTP (<code>type: "http"</code>). Tokens are long-lived and team-scoped — each request is authenticated and returns only your team's data.
            </div>

            <h3>Token security</h3>
            <ul>
              <li>Format: <code>pp_mcp_</code> + 64 random hex characters (256 bits of entropy)</li>
              <li>Only the SHA-256 hash is stored — the raw token is never persisted</li>
              <li>Tokens can be revoked instantly from Settings at any time</li>
              <li><code>last_used_at</code> is updated on every successful request</li>
            </ul>
          </section>

          {/* ── MCP Tools ── */}
          <section id="mcp-tools" className="pp-docs-section">
            <h2>MCP Tools</h2>
            <p>
              These tools are available to any MCP-compatible AI assistant once you've configured your token.
              All tools are automatically scoped to your team — you can only access your own data.
            </p>

            <ToolCard
              name="list_tests"
              desc="List all usability tests for your team, ordered by most recent."
              params={[
                { name: 'limit', type: 'number', required: false, desc: '1–100, default 50' },
              ]}
              response={`{
  "tests": [
    { "id": "uuid", "name": "Checkout flow", "test_type": "single",
      "prototype_url": "https://…", "created_at": "…" }
  ],
  "count": 3
}`}
            />

            <ToolCard
              name="get_test"
              desc="Get full details of a single test — goal definition, participant count, and steps for scenario tests."
              params={[
                { name: 'test_id', type: 'string (UUID)', required: true, desc: 'Test identifier' },
              ]}
              response={`{
  "id": "uuid",
  "name": "Checkout flow",
  "test_type": "single",
  "prototype_url": "https://…",
  "goal_event": { "type": "click", "selector": "button.checkout" },
  "participant_count": 12,
  "steps": []
}`}
            />

            <ToolCard
              name="get_test_results"
              desc="Get aggregate completion statistics for a single-goal test — completion rate, average time, and per-participant breakdown."
              params={[
                { name: 'test_id', type: 'string (UUID)', required: true, desc: 'Must be a single-goal test' },
              ]}
              response={`{
  "total_participants": 12,
  "completed_count": 8,
  "completion_rate_pct": "67%",
  "avg_time_formatted": "2m 15s",
  "median_time_formatted": "1m 48s",
  "participants": [ { "name": "Alice", "completed": true, "time_to_complete_formatted": "1m 32s" } ]
}`}
            />

            <ToolCard
              name="get_scenario_results"
              desc="Get per-step funnel and drop-off analysis for a scenario (multi-step) test."
              params={[
                { name: 'test_id', type: 'string (UUID)', required: true, desc: 'Must be a scenario test' },
              ]}
              response={`{
  "total_participants": 10,
  "funnel": [
    { "order_index": 1, "title": "Sign Up", "completion_rate_pct": "90%",
      "drop_off_count": 1, "median_time_formatted": "45s" }
  ],
  "participants": [ { "name": "Alice", "steps_completed": 3, "fully_completed": true } ]
}`}
            />

            <ToolCard
              name="get_participant_events"
              desc="Get the full event timeline for a specific participant session — every click, URL change, and form interaction in order."
              params={[
                { name: 'test_id', type: 'string (UUID)', required: true,  desc: 'Test identifier' },
                { name: 'tid',     type: 'string',        required: true,  desc: 'Participant tracking ID' },
                { name: 'limit',   type: 'number',        required: false, desc: '1–500, default 200' },
              ]}
              response={`{
  "participant_name": "Alice",
  "event_count": 42,
  "events": [
    { "type": "click", "selector": "button.add-to-cart",
      "url": "https://…/product", "relative_formatted": "+0s" },
    { "type": "url_change", "url": "https://…/cart", "relative_formatted": "+12s" }
  ]
}`}
            />

            <ToolCard
              name="summarize_test"
              desc="Generate a plain-English markdown summary of test findings — completion rates, timing, biggest drop-offs, and participant breakdown."
              params={[
                { name: 'test_id', type: 'string (UUID)', required: true, desc: 'Test identifier' },
              ]}
              response={`{
  "test_name": "Checkout flow",
  "summary": "## Checkout flow\\n\\n8 of 12 participants (67%) completed…"
}`}
            />

            <ToolCard
              name="get_team_info"
              desc="Get information about the authenticated team — member list and total test count."
              params={[]}
              response={`{
  "team": { "id": "uuid", "name": "Acme Design", "created_at": "…" },
  "members": [ { "full_name": "Alice", "role": "Product Designer" } ],
  "member_count": 3,
  "total_tests": 7
}`}
            />
          </section>

        </div>{/* end pp-docs-content */}
      </div>{/* end pp-docs-layout */}
    </div>
  )
}
