import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { chromium } from 'playwright'
import { FORBIDDEN_ACTIONS } from './allowlist.ts'
import { BROWSER_META_PATH, RUNS_DIR } from './paths.ts'
import type { BrowserMeta } from './paths.ts'
import { PinaLoveReader } from './pinaloveReader.ts'
import {
  conceptualLog,
  redactId,
  redactPhotoUrl,
  redactText,
  stripSensitiveFields,
} from './sanitize.ts'

/**
 * ONE-SHOT diagnostic. Do not loop.
 * profilenew is an approved read-only diagnostic/enrichment capability,
 * not a bulk ingestion strategy.
 */

const TARGET = process.env.PINALOVE_PROFILE_USERNAME
if (!TARGET) {
  throw new Error('STOP: PINALOVE_PROFILE_USERNAME is required. Do not hardcode a live username.')
}
const SQLITE_PATH = process.env.SQLITE_PATH ?? path.join(process.cwd(), 'data/pinalove.sqlite')

const LISTSNEW_FIELD_UNION = new Set([
  'age',
  'area',
  'avatar',
  'bg',
  'city',
  'country',
  'description',
  'distance',
  'education',
  'faceverified',
  'haschildren',
  'headline',
  'height',
  'id',
  'jointime',
  'lastactivity',
  'likesme',
  'likethem',
  'lookingfor',
  'maxage',
  'minage',
  'name',
  'note',
  'photos',
  'wantschildren',
  'weight',
])

const REPORT_FIELDS = [
  'id',
  'name',
  'age',
  'gender',
  'city',
  'country',
  'status',
  'relationship',
  'marital',
  'haschildren',
  'wantschildren',
  'religion',
  'occupation',
  'education',
  'lookingfor',
  'minage',
  'maxage',
  'headline',
  'description',
  'faceverified',
  'photos',
] as const

type Presence = 'PRESENT' | 'ABSENT' | 'NULL/EMPTY'

type Observed = {
  method: string
  pathname: string
  action: string | null
  box: string | null
  status: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function presenceOf(record: Record<string, unknown> | null, key: string): Presence {
  if (!record || !Object.prototype.hasOwnProperty.call(record, key)) return 'ABSENT'
  const value = record[key]
  if (value == null || value === '' || value === 'No answer') return 'NULL/EMPTY'
  if (Array.isArray(value) && value.length === 0) return 'NULL/EMPTY'
  return 'PRESENT'
}

function rawDisplay(value: unknown): unknown {
  if (value == null) return value
  if (typeof value === 'string') {
    if (value.includes('/p/')) return redactPhotoUrl(value)
    if (value.length > 160) return redactText(value, 160)
    return value
  }
  if (Array.isArray(value)) {
    return {
      count: value.length,
      sample: value.slice(0, 3).map((item) => {
        if (isRecord(item)) {
          return {
            keys: Object.keys(item).toSorted(),
            ID: redactId(item.ID ?? item.id),
            Uri: redactPhotoUrl(typeof item.Uri === 'string' ? item.Uri : null),
          }
        }
        return item
      }),
    }
  }
  if (isRecord(value)) return { keys: Object.keys(value).toSorted() }
  return value
}

function listsNewValue(facts: Record<string, { rawValue?: unknown }>, key: string, fallback: unknown): unknown {
  if (Object.prototype.hasOwnProperty.call(facts, key) && facts[key] && 'rawValue' in facts[key]) {
    return facts[key].rawValue
  }
  return fallback
}

function loadListsNewSnapshot(): {
  username: string
  facts: Record<string, { rawValue?: unknown }>
  columns: Record<string, unknown>
} {
  const db = new DatabaseSync(SQLITE_PATH, { readOnly: true })
  try {
    const row = db
      .prepare(
        `SELECT username, age, location, country, headline, bio, gender, occupation, religion,
                education, has_children, marital_history, field_facts, external_id
         FROM profiles WHERE username = ?`,
      )
      .get(TARGET) as Record<string, unknown> | undefined
    if (!row) throw new Error(`STOP: ${TARGET} is not in local SQLite.`)
    const facts = JSON.parse(String(row.field_facts ?? '{}')) as Record<string, { rawValue?: unknown }>
    return {
      username: String(row.username),
      facts,
      columns: row,
    }
  } finally {
    db.close()
  }
}

async function main(): Promise<void> {
  const meta = JSON.parse(await readFile(BROWSER_META_PATH, 'utf8')) as BrowserMeta
  if (!meta.cdpUrl) {
    throw new Error('STOP: dedicated Chrome has no CDP. Reopen with port 9333 after SPA login.')
  }

  const listsNew = loadListsNewSnapshot()
  const browser = await chromium.connectOverCDP(meta.cdpUrl)
  const context = browser.contexts()[0]
  if (!context) throw new Error('STOP: no browser context on CDP.')
  const page =
    context.pages().find((p) => p.url().includes('pinalove.com')) ?? context.pages()[0]
  if (!page) throw new Error('STOP: no PinaLove tab in the dedicated browser.')

  const autoRequests: Observed[] = []
  const onResponse = (response: {
    url: () => string
    status: () => number
    request: () => { method: () => string }
  }): void => {
    const url = response.url()
    if (!url.includes('pinalove.com')) return
    let pathname = '(unparseable)'
    let action: string | null = null
    let box: string | null = null
    try {
      const parsed = new URL(url)
      pathname = parsed.pathname
      action = parsed.searchParams.get('i')
      box = parsed.searchParams.get('box')
    } catch {
      pathname = '(unparseable)'
    }
    autoRequests.push({
      method: response.request().method(),
      pathname,
      action,
      box,
      status: response.status(),
    })
    const label = action
      ? `${response.request().method()} ${pathname} i=${action}${box ? ` box=${box}` : ''} -> ${response.status()}`
      : `${response.request().method()} ${pathname} -> ${response.status()}`
    conceptualLog('AUTO', label)
  }
  page.on('response', onResponse)

  const reader = new PinaLoveReader(page)
  const spa = await reader.assertSpaReady()
  conceptualLog(
    'SPA',
    `path=${spa.path} hash=${spa.hash} apiRequest=${String(spa.hasApi)} loggedin=${String(spa.loggedin)}`,
  )

  const beforeCount = autoRequests.length
  const read = await reader.getProfileNew(TARGET)
  page.off('response', onResponse)
  const during = autoRequests.slice(beforeCount)

  const appCalls = during.filter((r) => r.pathname.includes('/nt/app.php'))
  const profilenewCalls = appCalls.filter((r) => r.action === 'profilenew')
  const listsnewCalls = appCalls.filter((r) => r.action === 'listsnew')
  const mutating = during.filter((r) => !['GET', 'HEAD', 'OPTIONS'].includes(r.method))
  const forbidden = appCalls.filter(
    (r) => r.action != null && (FORBIDDEN_ACTIONS as readonly string[]).includes(r.action),
  )
  const unexpectedReads = appCalls.filter(
    (r) => r.action != null && r.action !== 'profilenew' && r.action !== 'listsnew',
  )

  const stopReasons: string[] = []
  if (listsnewCalls.length > 0) stopReasons.push('listsnew ran during the profilenew probe')
  if (profilenewCalls.length !== 1) {
    stopReasons.push(`expected exactly one profilenew, observed ${profilenewCalls.length}`)
  }
  if (forbidden.length > 0) {
    stopReasons.push(`forbidden actions: ${forbidden.map((f) => f.action).join(',')}`)
  }
  if (mutating.length > 0) {
    stopReasons.push(`non-GET traffic: ${mutating.map((m) => `${m.method} ${m.action ?? m.pathname}`).join(',')}`)
  }
  const visitActions = appCalls.filter((r) => r.action === 'revealvisit' || r.action === 'feedprofileview')
  if (visitActions.length > 0) {
    stopReasons.push(`client visit actions: ${visitActions.map((v) => v.action).join(',')}`)
  }

  const profile = isRecord(read.profile) ? (stripSensitiveFields(read.profile) as Record<string, unknown>) : null
  const topLevel = stripSensitiveFields(read.topLevel) as Record<string, unknown>
  const httpStatus = profilenewCalls[0]?.status ?? read.httpStatus

  const relevant: Record<string, { presence: Presence; raw: unknown; meaning: string }> = {}
  for (const field of REPORT_FIELDS) {
    const presence = presenceOf(profile, field)
    const raw = profile && Object.prototype.hasOwnProperty.call(profile, field) ? profile[field] : undefined
    relevant[field] = {
      presence,
      raw: rawDisplay(raw),
      meaning: presence === 'ABSENT' ? 'ABSENT' : 'UNKNOWN (no mapping assumed)',
    }
  }

  const extraKeys = (read.profileObjectKeys ?? []).filter(
    (key) => !(REPORT_FIELDS as readonly string[]).includes(key) && !['a', 'u', 'tgz', 'authToken', 'PHPSESSID'].includes(key),
  )

  const comparison = REPORT_FIELDS.map((field) => {
    const listsPresent = LISTSNEW_FIELD_UNION.has(field)
    const listsRaw = listsPresent
      ? field === 'name'
        ? TARGET
        : field === 'id'
          ? listsNew.columns.external_id
          : field === 'age'
            ? listsNew.columns.age
            : field === 'city'
              ? listsNew.columns.location
              : field === 'country'
                ? listsNew.columns.country
                : field === 'headline'
                  ? redactText(listsNew.columns.headline, 80)
                  : field === 'description'
                    ? redactText(listsNew.columns.bio, 80)
                    : listsNewValue(listsNew.facts, field, undefined)
      : '(absent from listsnew union)'
    return {
      field,
      listsnew: listsPresent ? 'PRESENT' : 'ABSENT',
      listsnewRaw: listsRaw ?? '(null/empty or not stored)',
      profilenew: relevant[field].presence,
      profilenewRaw: relevant[field].raw,
      meaning: relevant[field].meaning,
    }
  })

  const report = {
    extractedAt: new Date().toISOString(),
    target: TARGET,
    persistedToSqlite: false,
    profilePageOpened: false,
    pinaloveRequestsExact: profilenewCalls.length,
    httpStatus,
    via: read.via,
    spaPath: spa.path,
    spaHash: spa.hash,
    spaAuthenticated: spa.loggedin && spa.hasApi,
    observedDuringProbe: during.map((e) => ({
      method: e.method,
      pathname: e.pathname,
      action: e.action,
      box: e.box,
      status: e.status,
    })),
    unexpectedReads: unexpectedReads.map((e) => e.action),
    clientSideVisitActionsObserved: visitActions.map((r) => r.action),
    sideEffectStop: stopReasons,
    topLevelKeys: read.topLevelKeys
      .filter((k) => k !== TARGET)
      .concat(read.topLevelKeys.includes(TARGET) ? ['{username}'] : []),
    profileObjectKeys: read.profileObjectKeys,
    extraKeysNotInRequestedSet: extraKeys,
    relevant,
    comparison,
    photoSummary:
      profile && Object.prototype.hasOwnProperty.call(profile, 'photos')
        ? rawDisplay(profile.photos)
        : '(absent)',
    sqliteUntouched: true,
  }

  await mkdir(RUNS_DIR, { recursive: true, mode: 0o700 })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outPath = path.join(RUNS_DIR, `${stamp}-profilenew-${TARGET}-sanitized.json`)
  await writeFile(outPath, `${JSON.stringify({ ...report, topLevelSanitizedKeys: Object.keys(topLevel) }, null, 2)}\n`, {
    mode: 0o600,
  })
  conceptualLog('SANITIZED_REPORT', outPath)
  console.log(JSON.stringify(report, null, 2))
  if (stopReasons.length > 0) {
    throw new Error(`STOP: ${stopReasons.join(' | ')}`)
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err)
  if (/https?:\/\/[^\s]+[?&](a|u|uid|tgz|authToken)=/i.test(message)) {
    console.error('STOP: error contained a sensitive URL and was redacted.')
  } else {
    console.error(message)
  }
  process.exit(1)
})
