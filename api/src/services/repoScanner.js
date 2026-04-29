/**
 * GitHub repo scanner — builds a product map from a repo's file tree.
 * Uses the GitHub REST API (no npm client needed; fetch is native in Node 20).
 *
 * Returns: { features[], endpoints[], db_tables[], tech_stack, raw_file_count }
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

// ── File content fetch (returns decoded text or null if too large / error) ──

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

// ── Parsers ───────────────────────────────────────────────────────────────────

function parseEndpoints(content, filePath) {
  const endpoints = []
  const lines = content.split('\n')

  // Express: router.get('/path', ...) or app.post('/path', ...)
  const expressRe = /(?:router|app)\.(get|post|put|patch|delete|use)\s*\(\s*['"`]([^'"`\s]+)['"`]/g
  for (const line of lines) {
    let m
    expressRe.lastIndex = 0
    while ((m = expressRe.exec(line)) !== null) {
      const p = m[2]
      if (p.length > 1 || m[1] !== 'use') { // skip bare app.use('/')
        endpoints.push({ method: m[1].toUpperCase(), path: p, file: filePath, framework: 'express' })
      }
    }
  }

  // Next.js App Router: export async function GET/POST/... (route handlers)
  const nextAppRe = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*\(/g
  let m2
  while ((m2 = nextAppRe.exec(content)) !== null) {
    const routePath = '/' + filePath
      .replace(/^(src\/)?app\/api\//, '')
      .replace(/\/route\.(js|ts|jsx|tsx)$/, '')
      .replace(/\[([^\]]+)\]/g, ':$1')
    endpoints.push({ method: m2[1], path: routePath || '/', file: filePath, framework: 'next-app' })
  }

  // Next.js Pages Router: pages/api/**
  if (filePath.match(/pages\/api\/.+\.(js|ts)$/)) {
    const routePath = '/' + filePath
      .replace(/^(src\/)?pages\/api\//, 'api/')
      .replace(/\.(js|ts|jsx|tsx)$/, '')
      .replace(/\/index$/, '')
      .replace(/\[([^\]]+)\]/g, ':$1')
    if (!endpoints.find((e) => e.file === filePath && e.framework === 'next-pages')) {
      endpoints.push({ method: 'ALL', path: '/' + routePath, file: filePath, framework: 'next-pages' })
    }
  }

  return endpoints
}

function parseDbTables(content, filePath) {
  const tables = []

  if (filePath.endsWith('.sql')) {
    const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?["']?(\w+)["']?\s*\(/gi
    let m
    while ((m = re.exec(content)) !== null) {
      const name = m[1]
      if (!['migrations', 'schema_migrations', 'pg_stat'].includes(name.toLowerCase())) {
        tables.push({ name, source_file: filePath, source: 'sql' })
      }
    }
  }

  if (filePath.endsWith('schema.prisma')) {
    const re = /^model\s+(\w+)\s*\{/gm
    let m
    while ((m = re.exec(content)) !== null) {
      tables.push({ name: m[1], source_file: filePath, source: 'prisma' })
    }
  }

  return tables
}

function parseComponents(content, filePath) {
  const components = []
  const isPage = /\/(pages|app|views)\//.test(filePath) && !filePath.includes('/api/')
  const type = isPage ? 'page' : 'component'

  // export default function Foo / export default class Foo
  const defRe = /export\s+default\s+(?:function|class)\s+([A-Z][A-Za-z0-9]*)/g
  let m
  while ((m = defRe.exec(content)) !== null) {
    components.push({ name: m[1], path: filePath, type })
  }

  // const Foo = () => ... / const Foo = React.memo(...)
  const arrowRe = /export\s+(?:default\s+)?const\s+([A-Z][A-Za-z0-9]*)\s*=/g
  while ((m = arrowRe.exec(content)) !== null) {
    if (!components.find((c) => c.name === m[1])) {
      components.push({ name: m[1], path: filePath, type })
    }
  }

  // Fallback: derive name from filename (PascalCase files)
  if (components.length === 0) {
    const fileName = filePath.split('/').pop().replace(/\.(jsx?|tsx?|vue)$/, '')
    if (/^[A-Z]/.test(fileName)) {
      components.push({ name: fileName, path: filePath, type })
    }
  }

  return components
}

function parseTechStack(content, filePath, allPaths) {
  let pkg
  try { pkg = JSON.parse(content) } catch { return {} }

  const deps = { ...pkg.dependencies, ...pkg.devDependencies }
  const keys = Object.keys(deps)

  const has = (...pkgs) => pkgs.some((p) => keys.includes(p))

  const languages = []
  const hasTs = allPaths.some((p) => p.endsWith('.ts') || p.endsWith('.tsx'))
  if (hasTs) languages.push('TypeScript')
  if (allPaths.some((p) => p.endsWith('.js') || p.endsWith('.jsx'))) languages.push('JavaScript')
  if (allPaths.some((p) => p.endsWith('.py'))) languages.push('Python')
  if (allPaths.some((p) => p.endsWith('.go'))) languages.push('Go')
  if (allPaths.some((p) => p.endsWith('.rs'))) languages.push('Rust')

  const framework =
    has('next') ? 'Next.js' :
    has('nuxt', 'nuxt3', '@nuxt/core') ? 'Nuxt' :
    has('remix', '@remix-run/node') ? 'Remix' :
    has('express') ? 'Express' :
    has('fastify') ? 'Fastify' :
    has('hono') ? 'Hono' :
    has('@nestjs/core') ? 'NestJS' :
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

  // Key deps: filter out framework/ui/orm (already extracted), take interesting ones
  const skipDeps = new Set(['react', 'react-dom', 'next', 'express', 'prisma', '@prisma/client',
    'typescript', 'vite', 'webpack', 'eslint', 'prettier', 'jest', 'vitest',
    'tailwindcss', 'postcss', 'autoprefixer', 'vue', 'svelte', 'nuxt'])
  const key_dependencies = keys.filter((k) => !skipDeps.has(k)).slice(0, 12)

  return { runtime, framework, ui_library, database_orm, styling, testing, languages, key_dependencies }
}

function deriveFeatures(components, endpoints) {
  // Group pages by top-level path segment
  const pageGroups = {}
  for (const c of components) {
    if (c.type !== 'page') continue
    const parts = c.path.split('/')
    const pagesIdx = parts.findIndex((p) => p === 'pages' || p === 'app' || p === 'views')
    const segment = pagesIdx >= 0 ? parts[pagesIdx + 1] : null
    if (!segment || segment === 'api' || segment === '_app.tsx' || !segment) continue
    const group = segment.replace(/\.(jsx?|tsx?|vue)$/, '')
    if (!pageGroups[group]) pageGroups[group] = []
    pageGroups[group].push(c.name)
  }

  const features = Object.entries(pageGroups).map(([group, comps]) => ({
    name: group.charAt(0).toUpperCase() + group.slice(1).replace(/[-_]/g, ' '),
    pages: comps,
    endpoint_count: endpoints.filter((e) => e.path.toLowerCase().includes(group.toLowerCase())).length
  }))

  return features
}

// ── Path filters ──────────────────────────────────────────────────────────────

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '__pycache__',
  'venv', '.venv', 'vendor', 'coverage', '.cache', 'out', '.turbo'])

function isSkippedPath(path) {
  return path.split('/').some((seg) => SKIP_DIRS.has(seg))
}

function isRouteFile(path) {
  return (
    /\/(routes|controllers|handlers)\/.*\.(js|ts)$/.test(path) ||
    /\/pages\/api\/.*\.(js|ts)$/.test(path) ||
    /\/app\/.*\/route\.(js|ts)$/.test(path) ||
    /\/(src\/)?index\.(js|ts)$/.test(path)
  )
}

function isMigrationFile(path) {
  return /\/(migrations?|db)\/.*\.sql$/.test(path) || /\/schema\.prisma$/.test(path)
}

function isComponentFile(path) {
  return (
    /\.(jsx|tsx|vue)$/.test(path) &&
    /\/(components?|pages|views|screens|features|app)\//.test(path) &&
    !/\/api\//.test(path) &&
    !path.includes('.test.') &&
    !path.includes('.spec.')
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
    // Try 'master' if 'main' fails
    if (branch === 'main') {
      treeData = await ghFetch(token, `/repos/${owner}/${repo}/git/trees/master?recursive=1`)
    } else {
      throw new Error(`Could not fetch tree for branch '${branch}'`)
    }
  }

  const allFiles = (treeData.tree || [])
    .filter((item) => item.type === 'blob' && !isSkippedPath(item.path))
    .slice(0, 2000) // cap total tree size

  const allPaths = allFiles.map((f) => f.path)

  // 2. Categorize files
  const packageJsonFiles = allFiles.filter((f) => f.path === 'package.json' || f.path === 'api/package.json')
  const routeFiles = allFiles.filter((f) => isRouteFile(f.path)).slice(0, 60)
  const migrationFiles = allFiles.filter((f) => isMigrationFile(f.path)).slice(0, 40)
  const componentFiles = allFiles.filter((f) => isComponentFile(f.path)).slice(0, 80)

  const relevant = [...new Set([...packageJsonFiles, ...routeFiles, ...migrationFiles, ...componentFiles])]
    .slice(0, MAX_FILES)

  // 3. Fetch content in batches
  const contents = await fetchBatch(
    relevant.map((f) => () => fetchFileContent(token, owner, repo, f.path).then((c) => ({ path: f.path, content: c })))
  )

  // 4. Parse
  const endpoints = []
  const db_tables = []
  const components = []
  let tech_stack = {}

  for (const item of contents) {
    if (!item?.content) continue
    const { path, content } = item

    if (path.endsWith('package.json')) {
      tech_stack = parseTechStack(content, path, allPaths)
    } else if (isRouteFile(path)) {
      endpoints.push(...parseEndpoints(content, path))
    } else if (isMigrationFile(path)) {
      db_tables.push(...parseDbTables(content, path))
    } else if (isComponentFile(path)) {
      components.push(...parseComponents(content, path))
    }

    // Route files may also contain component definitions (Next.js pages)
    if (isComponentFile(path) || isRouteFile(path)) {
      if (isRouteFile(path) && /\/(pages)\/.+\.(jsx|tsx)$/.test(path)) {
        components.push(...parseComponents(content, path))
      }
    }
  }

  // Deduplicate
  const uniqueEndpoints = endpoints.filter((e, i, arr) =>
    arr.findIndex((x) => x.method === e.method && x.path === e.path) === i
  )
  const uniqueTables = db_tables.filter((t, i, arr) =>
    arr.findIndex((x) => x.name === x.name) === i // dedupe by name
  )
  const uniqueComponents = components.filter((c, i, arr) =>
    arr.findIndex((x) => x.name === c.name && x.path === c.path) === i
  )

  const features = deriveFeatures(uniqueComponents, uniqueEndpoints)

  return {
    features,
    endpoints: uniqueEndpoints,
    db_tables: uniqueTables,
    tech_stack,
    raw_file_count: allFiles.length
  }
}
