import { useEffect, useRef, useState } from 'react'

const MCP_URL = 'https://product-pulse-mcp.up.railway.app/mcp'

const NAV_ITEMS = [
  { id: 'overview',       label: 'Overview' },
  { id: 'quickstart',     label: 'Quick Start' },
  { id: 'snippet',        label: 'Installing the Snippet' },
  { id: 'events',         label: 'Tracked Events' },
  { id: 'goals',          label: 'Goal Events' },
  { id: 'test-types',     label: 'Test Types' },
  { id: 'session-replay', label: 'Session Replay' },
  { id: 'api',            label: 'REST API' },
  { id: 'mcp',            label: 'MCP Integration' },
  { id: 'mcp-tools',      label: 'MCP Tools' },
]

// ── Reusable sub-components ──────────────────────────────────────────────────

function CodeBlock({ code, language = 'js' }) {
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

function MethodBadge({ method }) {
  return (
    <span className={`pp-method-badge pp-method-${method.toLowerCase()}`}>
      {method}
    </span>
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

function Endpoint({ method, path, desc, children }) {
  return (
    <div className="pp-endpoint">
      <div className="pp-endpoint-head">
        <MethodBadge method={method} />
        <span>{path}</span>
      </div>
      {desc && <p className="pp-endpoint-desc">{desc}</p>}
      {children}
    </div>
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
          <CodeBlock code={response} language="json" />
        </>
      )}
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function Docs() {
  const [activeId, setActiveId] = useState('overview')
  const observerRef = useRef(null)

  // IntersectionObserver — highlights sidebar link for the visible section
  useEffect(() => {
    const sections = document.querySelectorAll('.pp-docs-section[id]')
    observerRef.current = new IntersectionObserver(
      (entries) => {
        // Find the topmost intersecting section
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
              Product Pulse is a lightweight usability testing platform for prototypes. Embed one script tag — it handles event tracking, session replay, goal detection, and recruiting participants without modifying your prototype code.
            </p>

            <h3>How it works</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', margin: '1rem 0', fontFamily: 'ui-monospace, monospace', fontSize: '0.85rem' }}>
              {['Your Prototype', '→', 'Snippet', '→', 'API', '→', 'Dashboard', '/', 'MCP'].map((label, i) => (
                label === '→' || label === '/' ? (
                  <span key={i} className="pp-muted">{label}</span>
                ) : (
                  <span key={i} style={{ padding: '0.3rem 0.75rem', background: 'var(--color-border)', borderRadius: 'var(--radius-sm)' }}>{label}</span>
                )
              ))}
            </div>

            <p>The platform has three main components:</p>
            <ul>
              <li><strong>Snippet</strong> — a JavaScript snippet injected into your prototype that tracks clicks, URL changes, and form interactions, uploads session replays, and renders the participant task overlay.</li>
              <li><strong>REST API</strong> — manages tests, participants, events, replays, and MCP tokens. All endpoints are CORS-enabled and accessible from any origin.</li>
              <li><strong>MCP Server</strong> — exposes your data as natural-language tools so AI assistants (Claude Desktop, Cursor, Windsurf) can query your test results without writing SQL.</li>
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
                  <p>Go to <strong>New test</strong>, enter a name and your prototype URL, choose Single-goal or Scenario, and save. You'll get a test ID.</p>
                </div>
              </div>
              <div className="pp-docs-step">
                <div className="pp-docs-step-num">2</div>
                <div className="pp-docs-step-body">
                  <strong>Define your goal</strong>
                  <p>On the test setup page, click <strong>Pick element</strong> — your prototype opens in picker mode. Click the target element (a button, link, or page) to record the goal event.</p>
                </div>
              </div>
              <div className="pp-docs-step">
                <div className="pp-docs-step-num">3</div>
                <div className="pp-docs-step-body">
                  <strong>Add participants</strong>
                  <p>Enter a participant name to generate a unique tracking link. Share that link — when they open it, the snippet activates and tracking begins automatically.</p>
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
              The snippet is served dynamically per-test — it bakes in the API URL and test ID, so participants need no configuration.
              The dashboard generates the embed code for you on the test setup page.
            </p>

            <h3>Automatic embed (recommended)</h3>
            <p>Copy the snippet from the test setup page. It looks like this:</p>
            <CodeBlock language="html" code={`<script src="https://your-api.railway.app/api/tests/{testId}/snippet.js"></script>`} />
            <p>Paste it into the <code>&lt;head&gt;</code> or before <code>&lt;/body&gt;</code> of every page in your prototype.</p>

            <h3>URL parameters</h3>
            <p>When a participant opens their unique link, these parameters are injected automatically:</p>
            <ParamTable rows={[
              { name: '__test_id', type: 'string (UUID)', required: true, desc: 'Test identifier — injected by the participant link' },
              { name: '__tid',     type: 'string (UUID)', required: true, desc: 'Participant tracking ID — injected by the participant link' },
              { name: '__pp_mode', type: '"pick"',        required: false, desc: 'Activates picker mode for goal selection (used by the dashboard, not participants)' },
            ]} />
            <p>The snippet persists <code>__test_id</code> and <code>__tid</code> in <code>sessionStorage</code> and appends them to all same-origin links, so tracking survives SPA navigation.</p>

            <h3>Picker mode</h3>
            <p>
              When opened with <code>?__pp_mode=pick</code>, the snippet renders a floating toolbar instead of tracking events.
              The test designer can click "Pick Element" then hover over any element to select it as a goal.
              The selection is sent back to the dashboard via <code>postMessage</code>.
            </p>

            <div className="pp-docs-note">
              <strong>Note:</strong> Picker mode completely disables participant tracking. A participant can never accidentally trigger picker mode — the dashboard opens it in a separate popup window.
            </div>
          </section>

          {/* ── Events ── */}
          <section id="events" className="pp-docs-section">
            <h2>Tracked Events</h2>
            <p>
              The snippet automatically tracks three event types. Each event is sent to{' '}
              <code>POST /api/events</code> in real time.
            </p>

            <table className="pp-param-table" style={{ marginBottom: '1.5rem' }}>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Trigger</th>
                  <th>selector</th>
                  <th>screenshot</th>
                  <th>metadata</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><span className="pp-param-name">click</span></td>
                  <td>Any click (capture phase)</td>
                  <td>CSS selector of target</td>
                  <td>Yes</td>
                  <td><code>{'{ text: "…" }'}</code> (first 80 chars of element text)</td>
                </tr>
                <tr>
                  <td><span className="pp-param-name">url_change</span></td>
                  <td>pushState, replaceState, popstate, hashchange</td>
                  <td><em>null</em></td>
                  <td>Yes (150ms delay)</td>
                  <td><em>null</em></td>
                </tr>
                <tr>
                  <td><span className="pp-param-name">input_change</span></td>
                  <td><code>change</code> event on form inputs</td>
                  <td>CSS selector of input</td>
                  <td>No</td>
                  <td><code>{'{ tagName: "INPUT" }'}</code></td>
                </tr>
              </tbody>
            </table>

            <h3>Custom events</h3>
            <p>You can send custom events from your prototype code using the global <code>window.ProtoPulse</code> object:</p>
            <CodeBlock language="js" code={`// Track a custom interaction
window.ProtoPulse.track('form_submitted', { formId: 'signup', step: 2 })

// Track an animation completion
window.ProtoPulse.track('animation_complete', { name: 'hero-entrance' })`} />
            <ParamTable rows={[
              { name: 'eventName', type: 'string', required: true, desc: 'Custom event type name' },
              { name: 'metadata',  type: 'object', required: false, desc: 'Any JSON-serializable key-value data' },
            ]} />

            <h3>Event payload</h3>
            <p>Every event sent to the API has this shape:</p>
            <CodeBlock language="json" code={`{
  "tid": "participant-tracking-id",
  "test_id": "uuid",
  "type": "click",
  "selector": "button.checkout",
  "url": "https://app.example.com/cart",
  "metadata": { "text": "Proceed to checkout" },
  "timestamp": "2026-04-06T14:30:00.000Z",
  "screenshot": "data:image/png;base64,…"
}`} />
          </section>

          {/* ── Goals ── */}
          <section id="goals" className="pp-docs-section">
            <h2>Goal Events</h2>
            <p>
              A goal is a rule that tells Product Pulse what "success" looks like for a test or step.
              Goals are defined as a JSON object with up to three fields:
            </p>
            <CodeBlock language="json" code={`{
  "type": "click",
  "selector": "button.checkout",
  "url_pattern": "/cart"
}`} />
            <ParamTable rows={[
              { name: 'type',        type: 'string', required: true,  desc: 'Event type to match: "click", "url_change", "input_change", or any custom type' },
              { name: 'selector',    type: 'string', required: false, desc: 'CSS selector of the target element. Must be an exact match.' },
              { name: 'url_pattern', type: 'string', required: false, desc: 'Substring to find in the current page URL. Case-sensitive.' },
            ]} />

            <h3>Matching logic</h3>
            <p>All conditions use <strong>AND logic</strong> — all specified fields must match simultaneously:</p>
            <table className="pp-param-table">
              <thead><tr><th>type</th><th>selector</th><th>url_pattern</th><th>Matches when…</th></tr></thead>
              <tbody>
                <tr><td>✓</td><td></td><td></td><td>Any event of that type</td></tr>
                <tr><td>✓</td><td>✓</td><td></td><td>Correct type AND selector matches</td></tr>
                <tr><td>✓</td><td></td><td>✓</td><td>Correct type AND URL contains pattern</td></tr>
                <tr><td>✓</td><td>✓</td><td>✓</td><td>All three must match</td></tr>
              </tbody>
            </table>
            <div className="pp-docs-note">
              <strong>Why AND, not OR?</strong> Setting only <code>url_pattern: "/"</code> would match every page. Requiring both <code>type</code> and at least one specificity field prevents accidental false positives.
            </div>

            <h3>Picker mode</h3>
            <p>The easiest way to define a goal is using the visual picker in the test setup page. Click <strong>Pick element</strong> to open your prototype, then click the target element. The dashboard records the exact CSS selector and current URL automatically.</p>
          </section>

          {/* ── Test Types ── */}
          <section id="test-types" className="pp-docs-section">
            <h2>Test Types</h2>

            <h3>Single-goal test</h3>
            <p>Best for measuring whether participants can complete one specific task (e.g., find the checkout button). Tracks completion and time from start to goal.</p>
            <CodeBlock language="json" code={`POST /api/tests
{
  "name": "Purchase flow",
  "prototype_url": "https://app.example.com",
  "test_type": "single",
  "start_event": { "type": "click", "selector": "button.add-to-cart" },
  "goal_event":  { "type": "url_change", "url_pattern": "/order-confirmation" }
}`} />
            <p>
              <code>start_event</code> is optional — if omitted, timing starts from the participant's first event.{' '}
              <code>goal_event</code> can also be omitted, which disables automatic completion detection.
            </p>

            <h3>Scenario test (multi-step)</h3>
            <p>Best for testing a complete flow across multiple tasks in sequence. Each step has its own goal, and steps must be completed in order.</p>
            <CodeBlock language="json" code={`POST /api/tests
{
  "name": "Onboarding flow",
  "prototype_url": "https://app.example.com/onboarding",
  "test_type": "scenario"
}

// Then add steps:
POST /api/tests/{testId}/steps
{
  "title": "Sign Up",
  "task": "Create an account with your email",
  "follow_up": "You should now be on the email confirmation screen"
}

// Set the goal for that step:
PATCH /api/tests/{testId}/steps/{stepId}
{
  "goal_event": { "type": "url_change", "url_pattern": "/confirm-email" }
}`} />

            <h3>Sequential enforcement</h3>
            <p>
              The server validates completion order. If step 3's goal fires before step 2 is complete, it is silently ignored.
              This prevents participants from accidentally triggering a goal from a previous session or navigating out of order.
            </p>
            <p>
              Timing per step is measured as: <em>time from previous step completion → this step's goal event</em>.
              For step 1, timing starts from the participant's first tracked event.
            </p>
          </section>

          {/* ── Session Replay ── */}
          <section id="session-replay" className="pp-docs-section">
            <h2>Session Replay</h2>
            <p>
              Every participant session is automatically recorded using <strong>rrweb</strong> — a full DOM snapshot + incremental mutations approach that reconstructs exactly what the participant saw and did.
            </p>

            <h3>How recording works</h3>
            <div className="pp-docs-steps">
              <div className="pp-docs-step">
                <div className="pp-docs-step-num">1</div>
                <div className="pp-docs-step-body">
                  <strong>Replay bundle loads</strong>
                  <p>The snippet fetches <code>/api/snippet/replay-bundle.js</code>, which provides <code>window.__ppStartReplay()</code>.</p>
                </div>
              </div>
              <div className="pp-docs-step">
                <div className="pp-docs-step-num">2</div>
                <div className="pp-docs-step-body">
                  <strong>Recording starts</strong>
                  <p>rrweb begins capturing DOM events with <code>maskAllInputs: true</code> — all typed values are replaced with asterisks.</p>
                </div>
              </div>
              <div className="pp-docs-step">
                <div className="pp-docs-step-num">3</div>
                <div className="pp-docs-step-body">
                  <strong>Chunks uploaded</strong>
                  <p>Events are batched and sent to <code>POST /api/replay/chunk</code> as they accumulate. Each chunk is stored in Supabase Storage.</p>
                </div>
              </div>
              <div className="pp-docs-step">
                <div className="pp-docs-step-num">4</div>
                <div className="pp-docs-step-body">
                  <strong>Recording stops</strong>
                  <p>When the participant completes the test goal, <code>window.__ppStopReplay()</code> is called and <code>POST /api/replay/complete</code> marks the session as done.</p>
                </div>
              </div>
            </div>

            <h3>Privacy</h3>
            <ul>
              <li>All input values are masked — passwords, emails, and form data are never stored.</li>
              <li>No audio or video is captured — only DOM structure and interactions.</li>
              <li>Replays are stored in a private Supabase Storage bucket, accessible only via authenticated API calls.</li>
            </ul>

            <h3>Viewing replays</h3>
            <p>
              From the Results page, click <strong>Watch replay</strong> next to any participant who has a recording.
              The replay player shows a full-fidelity reconstruction of their session with a timeline scrubber and playback controls.
            </p>
          </section>

          {/* ── REST API ── */}
          <section id="api" className="pp-docs-section">
            <h2>REST API</h2>
            <p>
              All endpoints are served from your Railway API service. Authenticated endpoints require an <code>Authorization: Bearer &lt;supabase-jwt&gt;</code> header.
              Public endpoints (snippet, event ingestion, participant creation) require no auth.
            </p>
            <div className="pp-docs-note">
              <strong>Base URL:</strong> <code>https://your-api.up.railway.app</code>
            </div>

            <h3>Tests</h3>

            <Endpoint method="GET" path="/api/tests" desc="List all tests for your team, newest first.">
              <p style={{ fontSize: '0.875rem', marginBottom: 0 }}>Returns: <code>{'[ { id, name, test_type, prototype_url, created_at } ]'}</code></p>
            </Endpoint>

            <Endpoint method="POST" path="/api/tests" desc="Create a new usability test.">
              <ParamTable rows={[
                { name: 'name',          type: 'string',  required: true,  desc: 'Test name' },
                { name: 'prototype_url', type: 'string',  required: true,  desc: 'URL of the prototype to test' },
                { name: 'test_type',     type: '"single" | "scenario"', required: false, desc: 'Defaults to "single"' },
                { name: 'start_event',   type: 'GoalEvent', required: false, desc: 'Event that marks the start of timing' },
                { name: 'goal_event',    type: 'GoalEvent', required: false, desc: 'Event that marks test completion' },
              ]} />
            </Endpoint>

            <Endpoint method="GET" path="/api/tests/:id" desc="Get a single test with participants and steps." />

            <Endpoint method="PATCH" path="/api/tests/:id" desc="Update test name, URL, or goal events.">
              <ParamTable rows={[
                { name: 'name',          type: 'string',    required: false, desc: 'New test name' },
                { name: 'prototype_url', type: 'string',    required: false, desc: 'New prototype URL' },
                { name: 'goal_event',    type: 'GoalEvent', required: false, desc: 'New goal event definition' },
                { name: 'start_event',   type: 'GoalEvent', required: false, desc: 'New start event definition' },
              ]} />
            </Endpoint>

            <Endpoint method="GET" path="/api/tests/:id/snippet.js" desc="Get the tracking snippet for this test (public, no auth required). Returns JavaScript." />

            <Endpoint method="GET" path="/api/tests/:id/tasks" desc="Get scenario task definitions for the participant overlay (public)." />

            <Endpoint method="GET" path="/api/tests/:id/heartbeat" desc="Check if a test is actively receiving events (public). Returns active status and seconds since last event." />

            <Endpoint method="GET" path="/api/tests/:id/results" desc="Get aggregated results. Returns different shapes for single-goal vs scenario tests." />

            <h3>Steps (scenario tests)</h3>

            <Endpoint method="POST" path="/api/tests/:id/steps" desc="Add a step to a scenario test.">
              <ParamTable rows={[
                { name: 'title',     type: 'string', required: false, desc: 'Step title shown in the overlay' },
                { name: 'task',      type: 'string', required: false, desc: 'Task description shown to the participant' },
                { name: 'follow_up', type: 'string', required: false, desc: 'Follow-up text shown after the task' },
              ]} />
            </Endpoint>

            <Endpoint method="PATCH" path="/api/tests/:id/steps/:stepId" desc="Update step content or goal event.">
              <ParamTable rows={[
                { name: 'title',      type: 'string',    required: false, desc: 'Step title' },
                { name: 'task',       type: 'string',    required: false, desc: 'Task description' },
                { name: 'follow_up',  type: 'string',    required: false, desc: 'Follow-up text' },
                { name: 'goal_event', type: 'GoalEvent', required: false, desc: 'Goal for this step' },
              ]} />
            </Endpoint>

            <Endpoint method="DELETE" path="/api/tests/:id/steps/:stepId" desc="Delete a step and re-sequence remaining steps." />

            <h3>Participants</h3>

            <Endpoint method="POST" path="/api/tests/:id/participants" desc="Create a participant and get their unique tracking link (public, no auth required).">
              <ParamTable rows={[
                { name: 'name', type: 'string', required: true, desc: 'Participant name' },
              ]} />
              <CodeBlock language="json" code={`{
  "id": "uuid",
  "tid": "tracking-uuid",
  "name": "Alice",
  "link": "https://your-prototype.com?__test_id=…&__tid=…",
  "created_at": "2026-04-06T14:00:00Z"
}`} />
            </Endpoint>

            <h3>Events</h3>

            <Endpoint method="POST" path="/api/events" desc="Ingest a tracked event from the snippet (public). Returns 204 No Content.">
              <ParamTable rows={[
                { name: 'tid',        type: 'string',    required: true,  desc: 'Participant tracking ID' },
                { name: 'test_id',    type: 'string',    required: true,  desc: 'Test UUID' },
                { name: 'type',       type: 'string',    required: true,  desc: 'Event type' },
                { name: 'selector',   type: 'string',    required: false, desc: 'CSS selector of interacted element' },
                { name: 'url',        type: 'string',    required: false, desc: 'Current page URL' },
                { name: 'metadata',   type: 'object',    required: false, desc: 'Custom key-value data' },
                { name: 'timestamp',  type: 'ISO 8601',  required: true,  desc: 'Event timestamp' },
                { name: 'screenshot', type: 'data URI',  required: false, desc: 'Base64 screenshot (max 4 MB)' },
              ]} />
            </Endpoint>

            <h3>Session Replay</h3>

            <Endpoint method="POST" path="/api/replay/chunk" desc="Upload a batch of rrweb events (public).">
              <ParamTable rows={[
                { name: 'tid',        type: 'string', required: true, desc: 'Participant tracking ID' },
                { name: 'test_id',    type: 'string', required: true, desc: 'Test UUID' },
                { name: 'part_index', type: 'number', required: true, desc: 'Chunk index (0-based)' },
                { name: 'events',     type: 'array',  required: true, desc: 'Array of rrweb events' },
              ]} />
            </Endpoint>

            <Endpoint method="POST" path="/api/replay/complete" desc="Mark a session replay as fully uploaded (public).">
              <ParamTable rows={[
                { name: 'tid',     type: 'string', required: true, desc: 'Participant tracking ID' },
                { name: 'test_id', type: 'string', required: true, desc: 'Test UUID' },
              ]} />
            </Endpoint>

            <Endpoint method="GET" path="/api/tests/:testId/replay/:tid" desc="Download and reconstruct a complete session replay (authenticated).">
              <CodeBlock language="json" code={`{
  "tid": "string",
  "status": "recording | complete",
  "chunk_count": 12,
  "events": [ /* merged rrweb event array */ ]
}`} />
            </Endpoint>

            <h3>MCP Tokens</h3>

            <Endpoint method="POST" path="/api/mcp/tokens" desc="Generate a new MCP access token. The raw token is returned once — save it immediately.">
              <ParamTable rows={[
                { name: 'name', type: 'string', required: false, desc: 'Human-readable label, e.g. "Claude Desktop"' },
              ]} />
              <CodeBlock language="json" code={`{
  "id": "uuid",
  "name": "Claude Desktop",
  "token": "pp_mcp_a1b2c3…",
  "created_at": "2026-04-06T14:00:00Z"
}`} />
            </Endpoint>

            <Endpoint method="GET" path="/api/mcp/tokens" desc="List all active (non-revoked) MCP tokens for your team. Never returns raw token values." />

            <Endpoint method="DELETE" path="/api/mcp/tokens/:id" desc="Revoke an MCP token immediately. The token is soft-deleted and rejected on all future requests." />
          </section>

          {/* ── MCP Integration ── */}
          <section id="mcp" className="pp-docs-section">
            <h2>MCP Integration</h2>
            <p>
              The MCP (Model Context Protocol) server exposes your Product Pulse data as tools that any AI assistant can call.
              Instead of writing queries or reading CSVs, you ask in plain English: <em>"Summarize the checkout flow test"</em> or <em>"Which step had the highest drop-off?"</em>
            </p>

            <h3>1. Generate a token</h3>
            <p>
              Go to <strong>Settings → AI / MCP Access</strong> → enter a label (e.g. "Claude Desktop") → click <strong>Generate token</strong>.
              Copy the <code>pp_mcp_…</code> token — it's shown only once.
            </p>

            <h3>2. Configure your AI tool</h3>

            <p><strong>Cursor</strong> — add to <code>~/.cursor/mcp.json</code>:</p>
            <CodeBlock language="json" code={`{
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
            <CodeBlock language="json" code={`{
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
