# Product Pulse

A lightweight usability testing tool. Instrument any web prototype with a JS snippet, define start/goal events, generate unique participant links, and visualize results in a dashboard.

## Project Structure

```
Product Pulse/
├── api/          # Node.js + Express backend
├── dashboard/    # React + Vite frontend
├── snippet/      # Vanilla JS tracking snippet + rrweb replay bundle
└── supabase/     # SQL migration files
```

## 1. Supabase Setup

Create a new [Supabase](https://supabase.com) project, then run the following SQL in the **SQL Editor**:

```sql
CREATE TABLE tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  prototype_url TEXT NOT NULL,
  start_event JSONB NOT NULL,
  goal_event JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID REFERENCES tests(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  tid TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tid TEXT NOT NULL,
  test_id UUID REFERENCES tests(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  selector TEXT,
  url TEXT,
  metadata JSONB,
  timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX events_tid_test_id_idx ON events(tid, test_id);
CREATE INDEX events_timestamp_idx ON events(timestamp);
```

Copy your **Project URL** and **anon public** key from Project Settings → API.

### Session Replay (optional)

Run the second migration in `supabase/session_replay_migration.sql` for the `session_replays` table.

Create a **private** Storage bucket named `session-replays`:

### Event Screenshots (optional)

Run `supabase/event_screenshots_migration.sql` to add the `screenshot_object_path` column to the `events` table.

Create a **private** Storage bucket named `event-screenshots`:

```bash
curl -X POST https://YOUR_PROJECT.supabase.co/storage/v1/bucket \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"id":"event-screenshots","name":"event-screenshots","public":false}'
```

Once set up, the snippet automatically captures a viewport screenshot with every tracked event (click, navigation, input change). Screenshots appear in the Results timeline as clickable icons.

```bash
curl -X POST https://YOUR_PROJECT.supabase.co/storage/v1/bucket \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"id":"session-replays","name":"session-replays","public":false}'
```

Copy your **service role** key (Project Settings → API → service_role — keep it secret) and add it to `api/.env` as `SUPABASE_SERVICE_ROLE_KEY`.

## 2. API Setup

```bash
cd api
cp .env.example .env
# Fill in SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY in .env
npm install
npm run dev
# API runs on http://localhost:3001
```

## 3. Dashboard Setup

```bash
cd dashboard
cp .env.example .env
# VITE_API_URL is already set to http://localhost:3001 for local dev
npm install
npm run dev
# Dashboard runs on http://localhost:5173
```

## 4. Snippet Usage

In the dashboard, go to a test's detail page to get the ready-to-copy snippet tag. Add it to your prototype's `<head>`:

```html
<script>window.ProtoPulse = { apiUrl: 'https://your-api.com' }</script>
<script src="https://your-api.com/snippet/protopulse.js" data-test-id="YOUR_TEST_ID"></script>
```

**Requirements:**
- Place the `<script>` tag **without** the `async` attribute so `document.currentScript` is available.
- The snippet reads `__tid` and `__test_id` from the URL query string automatically when a participant opens their unique link.

### Custom Events

```javascript
window.ProtoPulse.track('video_played', { videoId: '123' })
```

## 5. Event Definition Reference

When creating a test, you define a **start event** and a **goal event**:

| Field | Description |
|---|---|
| `type` | `click`, `url_change`, `input_change`, or any custom event name |
| `selector` | CSS selector — matches if the event's selector equals this |
| `url_pattern` | String — matches if the event's URL contains this substring |

If both `selector` and `url_pattern` are set, either match will trigger the event (OR logic).

## 6. Session Replay

Session replay starts automatically when a participant opens their test link — no consent banner is shown (participants are recruited for the test and consent is implicit).

- The `replay-bundle.js` (built from rrweb) is loaded lazily.
- **All text input values are masked** by default (`maskAllInputs: true`).
- Events are batched and uploaded every 3 seconds (or when the buffer hits ~300 KB) to `POST /api/replay/chunk`.
- A full DOM re-snapshot is taken every 10 seconds to ensure correct playback across SPA route changes.
- The session is marked complete when the participant navigates away (`pagehide` / `beforeunload`).

In the dashboard, a **▶ Watch replay** button appears on the Results page for any participant with a recorded session. Click it to open the full rrweb-player with a timeline scrubber and speed controls.

**Known limitations:**
- `<canvas>` elements and cross-origin `<iframe>` content are not replayed.
- Some heavy CSS animations and WebGL content may look incomplete.
- Replays are a DOM reconstruction, not a pixel-level video recording.

**Rebuilding the replay bundle** (e.g. after upgrading rrweb):

```bash
cd snippet
npm install
npm run build
```

The output `snippet/replay-bundle.js` is committed and served at `/snippet/replay-bundle.js`.

## 7. Deploy

**Railway (monorepo: API + dashboard from one GitHub repo):** see [DEPLOY_RAILWAY.md](DEPLOY_RAILWAY.md).

### API → Railway or Render

1. Push `api/` to a GitHub repo (or the monorepo root).
2. Set environment variables: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, plus **`RECORDING_JWT_SECRET`** (random string) and **`PUBLIC_API_URL`** (your API’s public `https://…` URL, matching dashboard `VITE_API_URL`). Optional: **`DESKTOP_MAC_DOWNLOAD_URL`** / **`DESKTOP_WIN_DOWNLOAD_URL`** for the in-app **Download app** button.
3. Build command: `npm install` — Start command: `npm start`.
4. The `/snippet/protopulse.js` and `/snippet/replay-bundle.js` files are served as static files from the API.

### Dashboard → Vercel

1. Set the **Root Directory** to `dashboard/`.
2. Set environment variables: `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_APP_URL` (see [dashboard/.env.example](dashboard/.env.example)). **`VITE_API_URL`** must be the same origin as the API’s **`PUBLIC_API_URL`** so deep links and uploads work for the desktop recorder.
3. Build command: `npm run build` — Output directory: `dist`.

### Dashboard → Railway

Same env vars as Vercel; **Root Directory** `dashboard/`, build `npm run build`, start `npm start` (serves `dist` via `vite preview`). Details in [DEPLOY_RAILWAY.md](DEPLOY_RAILWAY.md).

## 8. Row Level Security (baseline)

After other SQL migrations, run [api/migrations/005_rls_enable.sql](api/migrations/005_rls_enable.sql) in the Supabase SQL Editor. It enables **RLS** on all public app tables with **no permissive policies** for `anon` / `authenticated`, so direct PostgREST access is blocked while the **API and MCP** (service role) behave the same.

**Verify after applying:** sign in on the dashboard, list/create tests, post events from a participant link, and use MCP tools (e.g. `list_tests`). Optional: a `SELECT` on `public.tests` using only the **anon** key via the REST API should not return rows.

### Storage buckets

Keep `session-replays` and `event-screenshots` **private**. The Node API uses the **service role** for Storage reads/writes; do not expose that key in the browser. If you add Storage RLS policies later, avoid granting `anon` broad `SELECT` on `storage.objects` for those buckets.

## API Reference

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/tests` | Create a test |
| `GET` | `/api/tests` | List all tests |
| `GET` | `/api/tests/:id` | Test detail with participants |
| `POST` | `/api/tests/:id/participants` | Add participant, returns link |
| `POST` | `/api/events` | Receive events from snippet |
| `GET` | `/api/tests/:id/results` | Results per participant (includes `has_replay`) |
| `POST` | `/api/replay/chunk` | Upload rrweb event batch from snippet |
| `POST` | `/api/replay/complete` | Mark a session replay as fully recorded |
| `GET` | `/api/tests/:id/replay/:tid` | Load merged rrweb events for dashboard playback |
| `GET` | `/api/tests/:id/events/:eventId/screenshot` | Proxy event screenshot JPEG from Storage |
