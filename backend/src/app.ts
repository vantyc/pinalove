import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFileSync, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { DEFAULT_RULE_CONFIG } from '../../shared/defaultRules.ts'
import { BASE_PATH, CONTACT_STATUSES, FLAG_CODES, REVIEW_STATUSES } from '../../shared/types.ts'
import type { ContactStatus, FlagCode, ImportProfileInput, ReviewStatus, RuleConfig } from '../../shared/types.ts'
import { openDatabase } from './db.ts'
import { isForbiddenApiPath } from './safety.ts'
import {
  decisionPatchSchema,
  contactPatchSchema,
  importPayloadSchema,
  profileListQuerySchema,
  statusPatchSchema,
} from './schema.ts'
import { ProfileStore } from './store.ts'

const rootDir = process.env.APP_ROOT ?? process.cwd()

export type ServerOptions = {
  listenAddr?: string
  sqlitePath?: string
  staticDir?: string
  seedOnEmpty?: boolean
  fixturesPath?: string
  /** When set, every non-healthz request must carry this proxy header (ForwardAuth). */
  authProxyHeader?: string
  loginRedirect?: string
}

function envFlag(name: string, fallback: boolean): boolean {
  const v = process.env[name]
  if (v == null || v === '') return fallback
  return v === '1' || v.toLowerCase() === 'true'
}

export function createApp(opts: ServerOptions = {}) {
  const sqlitePath = opts.sqlitePath ?? process.env.SQLITE_PATH ?? path.join(rootDir, 'data/pinalove.sqlite')
  const staticDir =
    opts.staticDir ?? process.env.STATIC_DIR ?? path.join(rootDir, 'dist/frontend')
  const seedOnEmpty = opts.seedOnEmpty ?? envFlag('SEED_ON_EMPTY', true)
  const fixturesPath =
    opts.fixturesPath ??
    process.env.FIXTURES_PATH ??
    path.join(rootDir, 'fixtures/sample-profiles.json')
  const authProxyHeader = (opts.authProxyHeader ?? process.env.AUTH_PROXY_HEADER ?? '').trim()
  const loginRedirect = opts.loginRedirect ?? process.env.LOGIN_REDIRECT ?? '/login'

  const db = openDatabase(sqlitePath)
  const store = new ProfileStore(db)
  if (!db.prepare('SELECT 1 FROM app_config WHERE key = ?').get('rules')) {
    store.saveRules(structuredClone(DEFAULT_RULE_CONFIG))
  }
  if (seedOnEmpty && store.count() === 0 && existsSync(fixturesPath)) {
    const raw = JSON.parse(readFileSync(fixturesPath, 'utf8')) as unknown
    const parsed = importPayloadSchema.safeParse(raw)
    if (parsed.success) {
      const profiles = Array.isArray(parsed.data) ? parsed.data : parsed.data.profiles
      store.importProfiles(profiles as ImportProfileInput[])
    }
  }
  store.applyLocalWorkflow()

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const host = req.headers.host ?? 'localhost'
    const url = new URL(req.url ?? '/', `http://${host}`)
    const method = req.method ?? 'GET'
    const pathname = decodeURIComponent(url.pathname)

    if (isForbiddenApiPath(pathname)) {
      sendJson(res, 404, { error: 'not found' })
      return
    }

    if (method === 'GET' && (pathname === `${BASE_PATH}/healthz` || pathname === '/healthz')) {
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      })
      res.end('ok\n')
      return
    }

    let sessionUser: string | null = null
    if (authProxyHeader) {
      const raw = req.headers[authProxyHeader.toLowerCase()]
      const value = Array.isArray(raw) ? raw[0] : raw
      if (!value || !String(value).trim()) {
        if (pathname.startsWith(`${BASE_PATH}/api/`)) {
          sendJson(res, 401, { error: 'unauthorized' })
          return
        }
        res.writeHead(302, {
          Location: loginRedirect,
          'Cache-Control': 'private, no-store, no-cache, must-revalidate',
        })
        res.end()
        return
      }
      sessionUser = String(value).trim()
    }

    if (pathname === BASE_PATH || pathname === `${BASE_PATH}/`) {
      if (method === 'GET' || method === 'HEAD') {
        serveSpa(res, staticDir)
        return
      }
    }

    if (pathname.startsWith(`${BASE_PATH}/api/`)) {
      await handleApi(req, res, method, pathname, url, store, sessionUser)
      return
    }

    if (pathname.startsWith(`${BASE_PATH}/`)) {
      const rel = pathname.slice(BASE_PATH.length)
      if (serveStatic(res, staticDir, rel)) return
      serveSpa(res, staticDir)
      return
    }

    sendJson(res, 404, { error: 'not found' })
  }

  const server = createServer((req, res) => {
    handle(req, res).catch((err) => {
      console.error(err)
      if (!res.headersSent) sendJson(res, 500, { error: 'internal error' })
    })
  })

  return { server, store, sqlitePath, close: () => { server.close(); db.close() } }
}

async function handleApi(
  req: IncomingMessage,
  res: ServerResponse,
  method: string,
  pathname: string,
  url: URL,
  store: ProfileStore,
  sessionUser: string | null,
): Promise<void> {
  const apiPath = pathname.slice(`${BASE_PATH}/api`.length)

  if (method === 'GET' && apiPath === '/session') {
    sendJson(res, 200, { user: sessionUser })
    return
  }

  if (method === 'GET' && apiPath === '/dashboard/stats') {
    sendJson(res, 200, store.stats())
    return
  }

  if (method === 'GET' && apiPath === '/config/rules') {
    sendJson(res, 200, store.getRules())
    return
  }

  if (method === 'PUT' && apiPath === '/config/rules') {
    const body = await readJson(req)
    const rules = body as RuleConfig
    if (!rules || typeof rules !== 'object' || !rules.scoring) {
      sendJson(res, 400, { error: 'invalid rules payload' })
      return
    }
    sendJson(res, 200, store.saveRules(rules))
    return
  }

  if (method === 'GET' && apiPath === '/profiles') {
    const parsed = profileListQuerySchema.safeParse(Object.fromEntries(url.searchParams))
    if (!parsed.success) {
      sendJson(res, 400, { error: 'invalid query', details: parsed.error.flatten() })
      return
    }
    const q = parsed.data
    const status = parseStatusParam(q.status)
    const contactStatus = parseContactStatusParam(q.contactStatus)
    const flags = parseFlagsParam(q.flags)
    const profiles = store.list({
      ...q,
      status,
      contactStatus,
      flags,
    })
    sendJson(res, 200, { profiles, total: profiles.length })
    return
  }

  if (method === 'POST' && apiPath === '/profiles/import') {
    const body = await readJson(req)
    const parsed = importPayloadSchema.safeParse(body)
    if (!parsed.success) {
      sendJson(res, 400, { error: 'invalid import payload', details: parsed.error.flatten() })
      return
    }
    const profiles = Array.isArray(parsed.data) ? parsed.data : parsed.data.profiles
    sendJson(res, 200, store.importProfiles(profiles as ImportProfileInput[]))
    return
  }

  const profileMatch = apiPath.match(/^\/profiles\/([^/]+)(?:\/(status|decision|history|rescore|contact))?$/)
  if (profileMatch) {
    const id = decodeURIComponent(profileMatch[1])
    const action = profileMatch[2]
    if (method === 'GET' && !action) {
      const profile = store.getById(id)
      if (!profile) {
        sendJson(res, 404, { error: 'profile not found' })
        return
      }
      sendJson(res, 200, profile)
      return
    }
    if (method === 'GET' && action === 'history') {
      if (!store.getById(id)) {
        sendJson(res, 404, { error: 'profile not found' })
        return
      }
      sendJson(res, 200, { history: store.history(id) })
      return
    }
    if (method === 'PATCH' && action === 'status') {
      const parsed = statusPatchSchema.safeParse(await readJson(req))
      if (!parsed.success) {
        sendJson(res, 400, { error: 'invalid status payload', details: parsed.error.flatten() })
        return
      }
      const profile = store.setStatus(
        id,
        parsed.data.status,
        parsed.data.reason ?? null,
        parsed.data.source ?? 'USER',
      )
      if (!profile) {
        sendJson(res, 404, { error: 'profile not found' })
        return
      }
      sendJson(res, 200, profile)
      return
    }
    if (method === 'PATCH' && action === 'decision') {
      const parsed = decisionPatchSchema.safeParse(await readJson(req))
      if (!parsed.success) {
        sendJson(res, 400, { error: 'invalid decision payload', details: parsed.error.flatten() })
        return
      }
      const profile = store.setDecision(id, parsed.data.decision, parsed.data.reason ?? null)
      if (!profile) {
        sendJson(res, 404, { error: 'profile not found' })
        return
      }
      sendJson(res, 200, profile)
      return
    }
    if (method === 'POST' && action === 'rescore') {
      const current = store.getById(id)
      if (!current) {
        sendJson(res, 404, { error: 'profile not found' })
        return
      }
      store.rescoreAll()
      sendJson(res, 200, store.getById(id))
      return
    }
    if (method === 'PATCH' && action === 'contact') {
      const parsed = contactPatchSchema.safeParse(await readJson(req))
      if (!parsed.success) {
        sendJson(res, 400, { error: 'invalid contact payload', details: parsed.error.flatten() })
        return
      }
      if (parsed.data.action === 'mark-sent') {
        const profile = store.markContactSent(id)
        if (!profile) {
          sendJson(res, 404, { error: 'profile not found' })
          return
        }
        sendJson(res, 200, profile)
        return
      }
      if (parsed.data.action === 'discard') {
        const profile = store.discardManual(id, parsed.data.notes ?? null)
        if (!profile) {
          sendJson(res, 404, { error: 'profile not found' })
          return
        }
        sendJson(res, 200, profile)
        return
      }
      if (parsed.data.action === 'restore') {
        const profile = store.restoreFromDiscard(id)
        if (!profile) {
          sendJson(res, 404, { error: 'profile not found' })
          return
        }
        sendJson(res, 200, profile)
        return
      }
      if (parsed.data.action === 'archive') {
        const profile = store.archiveInbox(id)
        if (!profile) {
          sendJson(res, 404, { error: 'profile not found' })
          return
        }
        sendJson(res, 200, profile)
        return
      }
      if (parsed.data.action === 'interested') {
        const profile = store.markInboundInterested(id)
        if (!profile) {
          sendJson(res, 404, { error: 'profile not found' })
          return
        }
        sendJson(res, 200, profile)
        return
      }
      if (parsed.data.action === 'replied' || parsed.data.action === 'no-response') {
        const profile = store.markContactOutcome(
          id,
          parsed.data.action === 'replied' ? 'REPLIED' : 'NO_RESPONSE',
        )
        if (!profile) {
          sendJson(res, 404, { error: 'profile not found' })
          return
        }
        sendJson(res, 200, profile)
        return
      }
      const profile = store.updateContactNotes(id, parsed.data.notes ?? null)
      if (!profile) {
        sendJson(res, 404, { error: 'profile not found' })
        return
      }
      sendJson(res, 200, profile)
      return
    }
  }

  sendJson(res, 404, { error: 'not found' })
}

function parseStatusParam(raw?: string): ReviewStatus | ReviewStatus[] | undefined {
  if (!raw) return undefined
  const parts = raw.split(',').filter(Boolean) as ReviewStatus[]
  const valid = parts.filter((p): p is ReviewStatus =>
    (REVIEW_STATUSES as readonly string[]).includes(p),
  )
  if (valid.length === 0) return undefined
  return valid.length === 1 ? valid[0] : valid
}

function parseContactStatusParam(raw?: string): ContactStatus | ContactStatus[] | undefined {
  if (!raw) return undefined
  const parts = raw.split(',').filter(Boolean) as ContactStatus[]
  const valid = parts.filter((p): p is ContactStatus =>
    (CONTACT_STATUSES as readonly string[]).includes(p),
  )
  if (valid.length === 0) return undefined
  return valid.length === 1 ? valid[0] : valid
}

function parseFlagsParam(raw?: string): FlagCode[] | undefined {
  if (!raw) return undefined
  const parts = raw.split(',').filter(Boolean) as FlagCode[]
  const valid = parts.filter((p): p is FlagCode => (FLAG_CODES as readonly string[]).includes(p))
  return valid.length ? valid : undefined
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const raw = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store, no-cache, must-revalidate',
  })
  res.end(raw)
}

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (!raw.trim()) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(raw))
      } catch {
        reject(new Error('invalid JSON'))
      }
    })
    req.on('error', reject)
  })
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
}

function serveStatic(res: ServerResponse, staticDir: string, urlPath: string): boolean {
  const decoded = decodeURIComponent(urlPath.split('?')[0])
  const rel = decoded.replace(/^\/+/, '')
  if (!rel || rel.endsWith('/')) return false
  const abs = path.normalize(path.join(staticDir, rel))
  if (!abs.startsWith(path.normalize(staticDir))) return false
  if (!existsSync(abs) || !statSync(abs).isFile()) return false
  const ext = path.extname(abs).toLowerCase()
  const immutable = rel.startsWith('assets/')
  res.writeHead(200, {
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    'Cache-Control': immutable
      ? 'private, max-age=31536000, immutable'
      : 'private, no-store, no-cache, must-revalidate',
  })
  res.end(readFileSync(abs))
  return true
}

function serveSpa(res: ServerResponse, staticDir: string): void {
  const index = path.join(staticDir, 'index.html')
  if (!existsSync(index)) {
    sendJson(res, 503, { error: 'frontend not built', hint: 'npm run build' })
    return
  }
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'private, no-store, no-cache, must-revalidate',
  })
  res.end(readFileSync(index))
}

export function parseListenAddr(addr: string): { host?: string; port: number } {
  if (addr.startsWith(':')) return { port: Number(addr.slice(1)) }
  const idx = addr.lastIndexOf(':')
  return { host: addr.slice(0, idx), port: Number(addr.slice(idx + 1)) }
}
