/**
 * GitHub repo scanner — builds a product map from a repo's file tree.
 * Uses the GitHub REST API (no npm client needed; fetch is native in Node 20).
 *
 * Layer 1: Regex-based extraction (free, instant)
 *   - Broadened file-pattern matching for common project structures
 *   - Express, Fastify, Next.js (function + const), NestJS, Hono
 *   - SQL migrations, Prisma schema, Supabase .from() calls
 *   - JSX/TSX/Vue components with feature grouping
 *
 * Layer 2: AI summarisation (opt-in via OPENAI_API_KEY, ~$0.01/scan)
 *   - Sends route file contents to GPT-4o-mini
 *   - Returns endpoint descriptions, semantic feature groups, product summary
 *
 * Returns: { features[], endpoints[], db_tables[], tech_stack, raw_file_count, ai_summary }
 */

const GH_API = 'https://api.github.com'
const MAX_FILE_SIZE = 200 * 1024   // 200 KB per file
const MAX_FILES = 200              // max files processed total
const BATCH_SIZE = 5               // concurrent fetches at a time

function ghHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'ProductPulse/1.0'
  }
}

async function ghFetch(token, path) {
  const res = await fetch(`${GH_API}${path}`, { headers: ghHeaders(token) })
  if (res.status === 403 || res.status === 429) {
    const msg = res.headers.get('x-ratelimit-remaining') === '0'
      ? 'GitHub API rate limit reached. Try again in an hour.'
      : 'GitHub API access denied. Check repo permissions.'
    throw new Error(msg)
  }
  if (!res.ok) throw new Error(`GitHub API error ${res.status} for ${path}`)
  return res.json()
}

// ── File content fetch ────────────────────────────────────────────────────────

async function fetchFileContent(token, owner, repo, path) {
  try {
    const data = await ghFetch(token, `/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`)
    if (!data.content || data.size > MAX_FILE_SIZE) return null
    return Buffer.from(data.content, 'base64').toString('utf8')
  } catch {
    return null
  }
}

// ── Batch fetcher ─────────────────────────────────────────────────────────────

async function fetchBatch(tasks) {
  const results = []
  for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
    const batch = tasks.slice(i, i + BATCH_SIZE)
    const settled = await Promise.allSettled(batch.map((t) => t()))
    for (const s of settled) {
      results.push(s.status === 'fulfilled' ? s.value : null)
    }
  }
  return results
}

// ── Endpoint parser ───────────────────────────────────────────────────────────

function parseEndpoints(content, filePath) {
  const endpoints = []

  // ── Express / Fastify / Hono / Koa ──────────────────────────────────────────
  // router.get('/path', ...) | app.post('/path', ...) | fastify.get('/path', ...)
  const expressRe = /(?:router|app|server|fastify|instance|api|hono)\.(get|post|put|patch|delete|use)\s*\(\s*['"`]([^'"`\s]+)['"`]/g
  let m
  while ((m = expressRe.exec(content)) !== null) {
    const method = m[1].toUpperCase()
    const path = m[2]
    if (path.length > 1 || method !== 'USE') {
      endpoints.push({ method, path, file: filePath, framework: 'express' })
    }
  }

  // ── Next.js App Router: export async function GET() / export function POST() ─
  const nextFnRe = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*\(/g
  while ((m = nextFnRe.exec(content)) !== null) {
    const routePath = deriveNextAppPath(filePath)
    endpoints.push({ method: m[1], path: routePath, file: filePath, framework: 'next-app' })
  }

  // ── Next.js App Router: export const GET = async () => {} ──────────────────
  const nextConstRe = /export\s+const\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*=/g
  while ((m = nextConstRe.exec(content)) !== null) {
    if (/\/app\/.*\/route\.(js|ts|jsx|tsx)$/.test(filePath)) {
      const routePath = deriveNextAppPath(filePath)
      endpoints.push({ method: m[1], path: routePath, file: filePath, framework: 'next-app' })
    }
  }

  // ── Next.js Pages Router: files in pages/api/ ────────────────────────────────
  if (/\/pages\/api\/.+\.(js|ts)$/.test(filePath)) {
    const routePath = '/' + filePath
      .replace(/^(src\/)?pages\/api\//, 'api/')
      .replace(/\.(js|ts|jsx|tsx)$/, '')
      .replace(/\/index$/, '')
      .replace(/\[([^\]]+)\]/g, ':$1')
    if (!endpoints.find((e) => e.file === filePath && e.framework === 'next-pages')) {
      endpoints.push({ method: 'ALL', path: '/' + routePath, file: filePath, framework: 'next-pages' })
    }
  }

  // ── NestJS: @Get('/path') @Post('/path') ────────────────────────────────────
  const nestRe = /@(Get|Post|Put|Patch|Delete|All)\s*\(\s*['"`]([^'"`]+)['"`]/g
  while ((m = nestRe.exec(content)) !== null) {
    const method = m[1] === 'All' ? 'ALL' : m[1].toUpperCase()
    endpoints.push({ method, path: m[2], file: filePath, framework: 'nestjs' })
  }

  // ── React Router: <Route path="/foo" element={<Bar />} /> ───────────────────
  // Handles both self-closing and open tags, catches the component name too
  const rrRe = /<Route\b[^>]*\bpath=["']([^"'*][^"']*)["'][^>]*(?:element=\{<(\w+)|>)/g
  while ((m = rrRe.exec(content)) !== null) {
    const path = m[1]
    const component = m[2] || null
    if (path && path !== '*') {
      endpoints.push({ method: 'GET', path, file: filePath, framework: 'react-router', component })
    }
  }

  // Deduplicate within this file
  return endpoints.filter((e, i, arr) =>
    arr.findIndex((x) => x.method === e.method && x.path === e.path) === i
  )
}

function deriveNextAppPath(filePath) {
  return '/' + filePath
    .replace(/^(src\/)?app\/(api\/)?/, '')
    .replace(/\/route\.(js|ts|jsx|tsx)$/, '')
    .replace(/\[([^\]]+)\]/g, ':$1') || '/'
}

// ── DB table parser ───────────────────────────────────────────────────────────

// Ignore tables that are infrastructure/migration tracking, not product tables
const SKIP_TABLES = new Set([
  'migrations', 'schema_migrations', 'pg_stat', 'pg_stat_activity',
  'knex_migrations', 'sequelize_meta', '_prisma_migrations'
])

// Supabase table names to treat as system tables (skip)
const SKIP_SUPABASE = new Set(['auth', 'storage', 'functions', 'realtime', 'extensions', 'graphql'])

function parseDbTables(content, filePath) {
  const tables = []

  // SQL: CREATE TABLE [IF NOT EXISTS] [schema.]tablename (
  if (filePath.endsWith('.sql')) {
    const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:\w+\.)?["']?(\w+)["']?\s*\(/gi
    let m
    while ((m = re.exec(content)) !== null) {
      const name = m[1]
      if (!SKIP_TABLES.has(name.toLowerCase())) {
        tables.push({ name, source_file: filePath, source: 'sql' })
      }
    }
  }

  // Prisma schema: model Foo {
  if (filePath.endsWith('schema.prisma')) {
    const re = /^model\s+(\w+)\s*\{/gm
    let m
    while ((m = re.exec(content)) !== null) {
      tables.push({ name: m[1], source_file: filePath, source: 'prisma' })
    }
  }

  // Supabase JS/TS: .from('tablename') or .from("tablename")
  if (/\.(js|ts|jsx|tsx)$/.test(filePath)) {
    const re = /\.from\s*\(\s*['"`](\w+)['"`]/g
    let m
    while ((m = re.exec(content)) !== null) {
      const name = m[1]
      if (!SKIP_SUPABASE.has(name.toLowerCase())) {
        tables.push({ name, source_file: filePath, source: 'supabase' })
      }
    }
  }

  return tables
}

// ── Component parser ──────────────────────────────────────────────────────────

function parseComponents(content, filePath) {
  const components = []
  const isPage = /\/(pages|app|views|screens)\//.test(filePath) && !/\/api\//.test(filePath)
  const type = isPage ? 'page' : 'component'

  // export default function Foo / export default class Foo
  const defRe = /export\s+default\s+(?:function|class)\s+([A-Z][A-Za-z0-9]*)/g
  let m
  while ((m = defRe.exec(content)) !== null) {
    components.push({ name: m[1], path: filePath, type })
  }

  // export const Foo = () => ... / export default const Foo = ...
  const arrowRe = /export\s+(?:default\s+)?const\s+([A-Z][A-Za-z0-9]*)\s*=/g
  while ((m = arrowRe.exec(content)) !== null) {
    if (!components.find((c) => c.name === m[1])) {
      components.push({ name: m[1], path: filePath, type })
    }
  }

  // Fallback: PascalCase filename
  if (components.length === 0) {
    const fileName = filePath.split('/').pop().replace(/\.(jsx?|tsx?|vue)$/, '')
    if (/^[A-Z]/.test(fileName)) {
      components.push({ name: fileName, path: filePath, type })
    }
  }

  return components
}

// ── Tech stack parser ─────────────────────────────────────────────────────────

function parseTechStack(content, filePath, allPaths) {
  let pkg
  try { pkg = JSON.parse(content) } catch { return {} }

  const deps = { ...pkg.dependencies, ...pkg.devDependencies }
  const keys = Object.keys(deps)
  const has = (...pkgs) => pkgs.some((p) => keys.includes(p))

  const languages = []
  if (allPaths.some((p) => p.endsWith('.ts') || p.endsWith('.tsx'))) languages.push('TypeScript')
  if (allPaths.some((p) => p.endsWith('.js') || p.endsWith('.jsx'))) languages.push('JavaScript')
  if (allPaths.some((p) => p.endsWith('.py'))) languages.push('Python')
  if (allPaths.some((p) => p.endsWith('.go'))) languages.push('Go')
  if (allPaths.some((p) => p.endsWith('.rs'))) languages.push('Rust')

  const framework =
    has('next') ? 'Next.js' :
    has('nuxt', 'nuxt3', '@nuxt/core') ? 'Nuxt' :
    has('remix', '@remix-run/node') ? 'Remix' :
    has('@nestjs/core') ? 'NestJS' :
    has('express') ? 'Express' :
    has('fastify') ? 'Fastify' :
    has('hono') ? 'Hono' :
    has('koa') ? 'Koa' :
    has('sveltekit', '@sveltejs/kit') ? 'SvelteKit' :
    null

  const ui_library =
    has('react', 'react-dom') ? 'React' :
    has('vue') ? 'Vue' :
    has('svelte') ? 'Svelte' :
    has('@angular/core') ? 'Angular' :
    has('solid-js') ? 'SolidJS' :
    null

  const database_orm =
    has('@prisma/client', 'prisma') ? 'Prisma' :
    has('drizzle-orm') ? 'Drizzle' :
    has('typeorm') ? 'TypeORM' :
    has('sequelize') ? 'Sequelize' :
    has('mongoose') ? 'Mongoose' :
    has('knex') ? 'Knex' :
    null

  const styling =
    has('tailwindcss') ? 'Tailwind CSS' :
    has('styled-components') ? 'styled-components' :
    has('@emotion/react', '@emotion/styled') ? 'Emotion' :
    has('sass', 'node-sass') ? 'Sass' :
    null

  const testing =
    has('vitest') ? 'Vitest' :
    has('jest') ? 'Jest' :
    has('cypress') ? 'Cypress' :
    has('playwright') ? 'Playwright' :
    null

  const runtime = pkg.engines?.bun ? 'Bun' : pkg.engines?.deno ? 'Deno' : 'Node.js'

  const skipDeps = new Set(['react', 'react-dom', 'next', 'express', 'prisma', '@prisma/client',
    'typescript', 'vite', 'webpack', 'eslint', 'prettier', 'jest', 'vitest',
    'tailwindcss', 'postcss', 'autoprefixer', 'vue', 'svelte', 'nuxt',
    '@types/node', '@types/react', '@types/react-dom'])
  const key_dependencies = keys.filter((k) => !skipDeps.has(k) && !k.startsWith('@types/')).slice(0, 12)

  return { runtime, framework, ui_library, database_orm, styling, testing, languages, key_dependencies }
}

// ── Feature grouping ──────────────────────────────────────────────────────────

// Directories that mark a "section" of the app — the next path segment is the feature name
const SECTION_DIRS = ['pages', 'app', 'views', 'screens', 'features', 'modules', 'sections']
// Segments to skip when naming features
const SKIP_SEGMENTS = new Set(['api', 'components', 'hooks', 'utils', 'lib', 'styles',
  '_app', '_document', 'layout', 'loading', 'error', 'not-found', 'index'])

function deriveFeatures(components, endpoints) {
  const pageGroups = {}

  for (const c of components) {
    const parts = c.path.split('/')
    let segment = null

    for (const dir of SECTION_DIRS) {
      const idx = parts.lastIndexOf(dir)
      if (idx < 0 || idx >= parts.length - 1) continue
      const next = parts[idx + 1]
      // Use the segment if it's not a file extension and not a skip-listed name
      const clean = next.replace(/\.(jsx?|tsx?|vue)$/, '').toLowerCase()
      if (!SKIP_SEGMENTS.has(clean) && !next.startsWith('[') && !next.startsWith('(')) {
        // For files directly inside a section dir (no subdirectory), group under clean name
        segment = clean
        break
      }
    }

    if (!segment) continue
    const key = segment
    if (!pageGroups[key]) pageGroups[key] = []
    if (!pageGroups[key].includes(c.name)) pageGroups[key].push(c.name)
  }

  return Object.entries(pageGroups).map(([group, comps]) => ({
    name: group.charAt(0).toUpperCase() + group.slice(1).replace(/[-_]/g, ' '),
    pages: comps,
    endpoint_count: endpoints.filter((e) =>
      e.path.toLowerCase().split('/').some((seg) => seg === group || seg.startsWith(group))
    ).length
  }))
}

// ── AI summarisation (opt-in, requires OPENAI_API_KEY) ────────────────────────

async function aiSummarise({ fileTree, routeContents, depsJson, endpoints }) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey || routeContents.length === 0) return null

  try {
    const { default: OpenAI } = await import('openai')
    const client = new OpenAI({ apiKey })

    const treeSample = fileTree.slice(0, 150).join('\n')
    const routeSnippets = routeContents
      .map(({ path, content }) => `// ${path}\n${content.slice(0, 2000)}`)
      .join('\n\n---\n\n')

    const prompt = `Analyze this software repository and extract a structured product map.

## Directory structure (sample)
${treeSample}

## Dependencies
${depsJson || 'not available'}

## Route / API files
${routeSnippets}

## Endpoints found by static analysis
${JSON.stringify(endpoints.slice(0, 40), null, 2)}

Respond with ONLY valid JSON in this exact shape:
{
  "product_summary": "One sentence: what does this product do for end users?",
  "features": [
    {
      "name": "User-facing feature name (e.g. Authentication, Dashboard, Billing)",
      "description": "One sentence describing what this feature enables",
      "pages": ["ComponentName"],
      "endpoint_count": 0
    }
  ],
  "endpoint_descriptions": {
    "POST /api/auth/login": "One-sentence description"
  }
}

Rules:
- features should be user-facing (Auth, Dashboard, Settings — not utils, hooks, lib)
- endpoint_descriptions keys must be "METHOD /path" matching the endpoints list
- product_summary must be a single sentence
- Be concise — no fluff`

    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 1500,
      temperature: 0.1
    })

    const parsed = JSON.parse(response.choices[0].message.content)
    console.log('[scanner] AI summarisation complete')
    return parsed
  } catch (e) {
    console.warn('[scanner] AI summarisation failed (non-fatal):', e.message)
    return null
  }
}

// ── Path filters ──────────────────────────────────────────────────────────────

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '__pycache__',
  'venv', '.venv', 'vendor', 'coverage', '.cache', 'out', '.turbo', '.vercel', 'storybook-static'])

function isSkippedPath(path) {
  return path.split('/').some((seg) => SKIP_DIRS.has(seg))
}

function isRouteFile(path) {
  return (
    // Standard named directories
    /\/(routes?|controllers?|handlers?|endpoints?|resolvers?|actions?)\/.*\.(js|ts)$/.test(path) ||
    // Next.js App Router
    /\/app\/.*\/route\.(js|ts|jsx|tsx)$/.test(path) ||
    // Next.js Pages Router
    /\/pages\/api\/.*\.(js|ts)$/.test(path) ||
    // Server / API entry points at root or in src/
    /^(src\/)?(index|server|app|main)\.(js|ts)$/.test(path) ||
    // React Router: App.tsx / App.jsx (contains <Route> definitions)
    /^(src\/)?App\.(tsx|jsx|ts|js)$/.test(path) ||
    // Files directly in an api/ or server/ directory (one level deep, not nested)
    /^(src\/)?api\/[^/]+\.(js|ts)$/.test(path) ||
    /^(src\/)?server\/[^/]+\.(js|ts)$/.test(path)
  )
}

function isMigrationFile(path) {
  return (
    /\/(migrations?|db|schema)\/.*\.sql$/.test(path) ||
    /\/schema\.prisma$/.test(path) ||
    // Supabase project: supabase/migrations/*.sql
    /^supabase\/migrations\/.*\.sql$/.test(path)
  )
}

function isEdgeFunctionFile(path) {
  // Supabase Edge Functions: supabase/functions/{name}/index.ts
  return /^supabase\/functions\/[^/]+\/index\.(ts|js)$/.test(path)
}

function isComponentFile(path) {
  return (
    /\.(jsx|tsx|vue)$/.test(path) &&
    /\/(components?|pages|views|screens|features|app|modules|sections)\//.test(path) &&
    !/\/api\//.test(path) &&
    !path.includes('.test.') &&
    !path.includes('.spec.') &&
    !path.includes('.stories.')
  )
}

// ── Supabase table files: any TS/JS/TSX/JSX in src/ that's not a test ────────
// Broad: Supabase .from() calls appear in hooks, contexts, components, pages, lib, etc.

function isSupabaseFile(path) {
  return (
    /\.(js|ts|jsx|tsx)$/.test(path) &&
    !path.includes('.test.') &&
    !path.includes('.spec.') &&
    !path.includes('.stories.') &&
    !path.includes('.config.') &&
    !path.endsWith('.d.ts') &&
    !isSkippedPath(path) &&
    // Any file under src/ or the project root TS/JS files
    /^src\//.test(path)
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function scanRepo({ token, repoFullName, branch = 'main' }) {
  const [owner, repo] = repoFullName.split('/')

  // 1. Fetch full file tree
  let treeData
  try {
    treeData = await ghFetch(token, `/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`)
  } catch {
    if (branch === 'main') {
      treeData = await ghFetch(token, `/repos/${owner}/${repo}/git/trees/master?recursive=1`)
    } else {
      throw new Error(`Could not fetch tree for branch '${branch}'`)
    }
  }

  const allFiles = (treeData.tree || [])
    .filter((item) => item.type === 'blob' && !isSkippedPath(item.path))
    .slice(0, 2000)

  const allPaths = allFiles.map((f) => f.path)

  // 2. Categorise files
  const packageJsonFiles = allFiles.filter((f) => f.path === 'package.json' || f.path === 'api/package.json')
  const routeFiles       = allFiles.filter((f) => isRouteFile(f.path)).slice(0, 60)
  const migrationFiles   = allFiles.filter((f) => isMigrationFile(f.path)).slice(0, 40)
  // Pages first so feature grouping works even when shadcn/ui fills the limit
  const componentFiles   = allFiles
    .filter((f) => isComponentFile(f.path))
    .sort((a, b) => {
      const rank = (p) => /\/(pages|views|screens)\//.test(p) ? 0 : /\/(features|modules|sections)\//.test(p) ? 1 : 2
      return rank(a.path) - rank(b.path)
    })
    .slice(0, 80)
  const edgeFunctions    = allFiles.filter((f) => isEdgeFunctionFile(f.path)).slice(0, 20)
  // Supabase .from() table detection: scan src/ files not already in other buckets
  const alreadyIncluded  = new Set([...routeFiles, ...componentFiles].map((f) => f.path))
  const supabaseFiles    = allFiles.filter((f) =>
    isSupabaseFile(f.path) && !alreadyIncluded.has(f.path)
  ).slice(0, 40)

  const relevant = [...new Set([
    ...packageJsonFiles, ...routeFiles, ...migrationFiles, ...componentFiles,
    ...edgeFunctions, ...supabaseFiles
  ])].slice(0, MAX_FILES)

  console.log(`[scanner] ${repoFullName}: tree=${allFiles.length} route=${routeFiles.length} migration=${migrationFiles.length} component=${componentFiles.length} edge=${edgeFunctions.length} supabase=${supabaseFiles.length} → fetching ${relevant.length} files`)

  // 3. Fetch content in batches
  const contents = await fetchBatch(
    relevant.map((f) => () =>
      fetchFileContent(token, owner, repo, f.path).then((c) => ({ path: f.path, content: c }))
    )
  )

  // 4. Parse (Layer 1 — regex)
  const endpoints  = []
  const db_tables  = []
  const components = []
  let tech_stack   = {}

  for (const item of contents) {
    if (!item?.content) continue
    const { path, content } = item

    if (path.endsWith('package.json')) {
      tech_stack = parseTechStack(content, path, allPaths)
      continue
    }
    if (isMigrationFile(path)) {
      db_tables.push(...parseDbTables(content, path))
    }
    if (isRouteFile(path)) {
      endpoints.push(...parseEndpoints(content, path))
      // Next.js page-route files can also be components
      if (/\/pages\/.+\.(jsx|tsx)$/.test(path)) {
        components.push(...parseComponents(content, path))
      }
      // Routes may contain Supabase calls
      db_tables.push(...parseDbTables(content, path))
    }
    if (isEdgeFunctionFile(path)) {
      // Supabase Edge Functions — treat as API endpoints (Deno/TypeScript)
      const fnName = path.split('/').slice(-2)[0] // supabase/functions/{name}/index.ts
      endpoints.push({ method: 'POST', path: `/functions/v1/${fnName}`, file: path, framework: 'supabase-edge' })
      db_tables.push(...parseDbTables(content, path))
    }
    if (isComponentFile(path)) {
      components.push(...parseComponents(content, path))
      db_tables.push(...parseDbTables(content, path))
    }
    if (isSupabaseFile(path) && !isRouteFile(path) && !isComponentFile(path)) {
      db_tables.push(...parseDbTables(content, path))
    }
  }

  // 5. Deduplicate
  const uniqueEndpoints = endpoints.filter((e, i, arr) =>
    arr.findIndex((x) => x.method === e.method && x.path === e.path) === i
  )
  const uniqueTables = db_tables.filter((t, i, arr) =>
    arr.findIndex((x) => x.name === t.name) === i   // fixed: was x.name === x.name
  )
  const uniqueComponents = components.filter((c, i, arr) =>
    arr.findIndex((x) => x.name === c.name && x.path === c.path) === i
  )

  console.log(`[scanner] parsed: endpoints=${uniqueEndpoints.length} tables=${uniqueTables.length} components=${uniqueComponents.length}`)

  // 6. Derive features from regex results (used as fallback if no AI)
  const regexFeatures = deriveFeatures(uniqueComponents, uniqueEndpoints)

  // 7. AI summarisation (Layer 2 — optional)
  let aiResult = null
  if (process.env.OPENAI_API_KEY) {
    const routeContents = contents
      .filter((item) => item?.content && isRouteFile(item.path))
      .map((item) => ({ path: item.path, content: item.content }))
      .slice(0, 20)

    let depsJson = null
    const pkgItem = contents.find((item) => item?.path === 'package.json')
    if (pkgItem?.content) {
      try {
        const pkg = JSON.parse(pkgItem.content)
        depsJson = JSON.stringify({ ...pkg.dependencies, ...pkg.devDependencies }, null, 2)
      } catch { /* ignore */ }
    }

    aiResult = await aiSummarise({
      fileTree: allPaths,
      routeContents,
      depsJson,
      endpoints: uniqueEndpoints
    })
  }

  // 8. Merge AI results over regex results
  const features = (aiResult?.features && aiResult.features.length > 0)
    ? aiResult.features
    : regexFeatures

  const finalEndpoints = aiResult?.endpoint_descriptions
    ? uniqueEndpoints.map((e) => ({
        ...e,
        description: aiResult.endpoint_descriptions[`${e.method} ${e.path}`] || null
      }))
    : uniqueEndpoints

  return {
    features,
    endpoints: finalEndpoints,
    db_tables: uniqueTables,
    tech_stack,
    raw_file_count: allFiles.length,
    ai_summary: aiResult?.product_summary || null
  }
}
