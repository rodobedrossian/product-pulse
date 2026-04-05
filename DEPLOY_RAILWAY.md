# Deploy Product Pulse on Railway

The repo is a monorepo: deploy **two** services from the same GitHub repository (API + dashboard).

## Prerequisites

- GitHub repo connected to Railway ([New Project → Deploy from GitHub](https://railway.app/new)).
- A Supabase project with migrations applied (see [README.md](README.md)).
- In **Supabase → Authentication → URL configuration**, add your Railway dashboard URL(s) to **Redirect URLs** and **Site URL** once you know them (e.g. `https://your-dashboard.up.railway.app`).

---

## 1. API service

1. In the Railway project, **Add service → GitHub Repo** (same repo) *or* duplicate the first service.
2. Open the service **Settings**:
   - **Root Directory**: `api`
3. **Variables** (same names as [api/.env.example](api/.env.example)):

   | Variable | Description |
   |----------|-------------|
   | `SUPABASE_URL` | Supabase project URL |
   | `SUPABASE_ANON_KEY` | Supabase anon (public) key |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase **service role** key (server only) |

   Railway injects **`PORT`** automatically; do not hardcode it.

4. **Deploy**: Nixpacks will run `npm install` and `npm start` from `api/`.
5. After deploy, open **Settings → Networking → Generate Domain** and copy the public URL (e.g. `https://product-pulse-api-production.up.railway.app`). You will use this as `VITE_API_URL` for the dashboard build.

The API also serves the tracking **snippet** from `/snippet/...` (files live in `snippet/` at repo root; the full repo checkout is available at runtime).

---

## 2. Dashboard service

1. **Add service** from the same GitHub repo.
2. **Settings**:
   - **Root Directory**: `dashboard`
3. **Variables** — these must be set **before** the build so Vite can embed them:

   | Variable | Example | Notes |
   |----------|---------|--------|
   | `VITE_API_URL` | `https://your-api.up.railway.app` | **No trailing slash.** Public API URL from step 1. |
   | `VITE_SUPABASE_URL` | `https://xxx.supabase.co` | Same as API’s `SUPABASE_URL`. |
   | `VITE_SUPABASE_ANON_KEY` | `eyJ...` | Same as Supabase anon key (browser-safe). |
   | `VITE_APP_URL` | `https://your-dashboard.up.railway.app` | Public dashboard URL (invite links, `/join/...`). Set after you generate the dashboard domain, then **redeploy** once. |

4. **Build** (Nixpacks usually detects Node):

   - Install: `npm install` (or `npm ci` if you add a lockfile workflow)
   - Build: `npm run build`
   - Start: `npm start` (runs `vite preview` with `PORT` from [vite.config.js](dashboard/vite.config.js))

5. **Networking → Generate Domain** for the dashboard.

6. If you set `VITE_APP_URL` only after the first deploy, trigger a **Redeploy** so invite links pick up the correct URL.

---

## 3. Optional: custom domains

Point your DNS at Railway for both services and update:

- `VITE_API_URL` / `VITE_APP_URL` to match
- Supabase redirect URLs and Site URL

---

## 4. Checklist

- [ ] API health: open `https://<api>/api/tests` (may 401 without auth; connection should work).
- [ ] Dashboard loads and can sign in.
- [ ] Create a test; participant snippet uses `VITE_API_URL` for event ingestion.
- [ ] Team invite link uses `VITE_APP_URL` in Settings.

---

## Troubleshooting

| Issue | What to check |
|-------|----------------|
| Dashboard blank / API errors | `VITE_API_URL` must be the **public** Railway API URL, `https://`, no trailing slash. |
| Auth redirect loop | Supabase **Redirect URLs** must include the exact dashboard origin. |
| CORS | API sets `Access-Control-Allow-Origin: *` and handles `OPTIONS` preflight for `PATCH` + `Authorization`. Redeploy API after changes. |
| Snippet 404 | API service must deploy from repo with `snippet/` present (full Git clone + root `api/`). |

### `zsh: permission denied: api/.env`

Your `api/.env` may be marked executable. Fix locally (do not commit secrets):

```bash
chmod 644 api/.env
```

Railway does not use that file; set variables in the Railway dashboard instead.
