import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
import { assertAllowedReadAction, FORBIDDEN_ACTIONS, ReaderSafetyError } from './allowlist.ts'
import { BROWSER_META_PATH, RUNS_DIR } from './paths.ts'
import type { BrowserMeta } from './paths.ts'
import { conceptualLog, redactPhotoUrl, redactText, stripSensitiveFields } from './sanitize.ts'
import { stopFromBody, stopFromErrorMessage, stopFromHttpStatus } from './stopConditions.ts'

/** ONE-SHOT diagnostic. Do not loop. Do not import to SQLite. */
const MATERIALIZE = 5
const LOOK_FOR: string[] = []

const REPORT_FIELDS = [
  'id',
  'name',
  'username',
  'age',
  'gender',
  'city',
  'country',
  'area',
  'distance',
  'lastactivity',
  'headline',
  'description',
  'haschildren',
  'wantschildren',
  'faceverified',
  'education',
  'photos',
  'lookingfor',
  'occupation',
  'status',
  'bg',
] as const

type InPageApiResult =
  | { ok: true; status: number; body: string; via: string; searchParamKeys: string[]; searchParamSafe: Record<string, unknown> }
  | { ok: false; status: number | null; error: string; searchParamKeys?: string[]; searchParamSafe?: Record<string, unknown> }

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function photoMeta(photos: unknown): unknown {
  if (photos == null) return '(absent)'
  if (typeof photos !== 'object') return { type: typeof photos }
  const list = Array.isArray(photos) ? photos : Object.values(photos)
  return {
    shape: Array.isArray(photos) ? 'array' : 'object',
    count: list.length,
    uriPatterns: list
      .filter((p): p is Record<string, unknown> => Boolean(p) && typeof p === 'object')
      .map((p) => redactPhotoUrl(typeof p.Uri === 'string' ? p.Uri : typeof p.uri === 'string' ? p.uri : null)),
  }
}

function fieldReport(original: Record<string, unknown>, name: string): Record<string, unknown> {
  const present = Object.prototype.hasOwnProperty.call(original, name)
  let raw: unknown = present ? original[name] : '(absent)'
  if (name === 'headline' || name === 'description' || name === 'occupation') {
    raw = present ? redactText(original[name], 80) : '(absent)'
  }
  if (name === 'photos') raw = photoMeta(present ? original[name] : null)
  return { field: name, present, raw }
}

async function main(): Promise<void> {
  assertAllowedReadAction('browsenew')
  const meta = JSON.parse(await readFile(BROWSER_META_PATH, 'utf8')) as BrowserMeta
  if (!meta.cdpUrl) throw new Error('STOP: dedicated Chrome has no debugger.')
  const browser = await chromium.connectOverCDP(meta.cdpUrl)
  const context = browser.contexts()[0]
  if (!context) throw new Error('STOP: no browser context on CDP.')
  const page =
    context.pages().find((p) => p.url().includes('pinalove.com')) ?? context.pages()[0]
  if (!page) throw new Error('STOP: no PinaLove tab.')

  const shell = await page.evaluate(`({
    path: location.pathname,
    hash: location.hash,
    hasApi: typeof apiRequest === 'function',
    loggedin: Boolean(window.myData && window.myData.loggedin),
    google: /Sign in with Google/i.test(document.body.innerText || ''),
    captcha: /captcha|unusual traffic|are you a robot/i.test(document.body.innerText || ''),
    insecure: /may not be secure/i.test(document.body.innerText || '')
  })`) as {
    path: string
    hash: string
    hasApi: boolean
    loggedin: boolean
    google: boolean
    captcha: boolean
    insecure: boolean
  }
  if (shell.insecure) throw new Error('STOP: Google/browser-not-secure challenge is showing.')
  if (shell.captcha) throw new Error('STOP: CAPTCHA/challenge detected.')
  if (shell.google || !shell.loggedin || !shell.hasApi) {
    throw new Error('STOP: PinaLove session is not authenticated in this Chrome.')
  }

  const observed: { method: string; action: string | null; status: number }[] = []
  const onResponse = (response: {
    url: () => string
    status: () => number
    request: () => { method: () => string }
  }): void => {
    const url = response.url()
    if (!url.includes('/nt/app.php')) return
    let action: string | null = null
    try {
      action = new URL(url).searchParams.get('i')
    } catch {
      action = '(unparseable)'
    }
    observed.push({ method: response.request().method(), action, status: response.status() })
    if (action && (FORBIDDEN_ACTIONS as readonly string[]).includes(action)) {
      throw new ReaderSafetyError(`STOP: observed forbidden action ${action}`)
    }
  }
  page.on('response', onResponse)

  const inPage = (await page.evaluate(
    `(async () => {
      if (typeof apiRequest !== 'function') {
        return { ok: false, status: null, error: 'apiRequest missing' };
      }
      var searchParams = {};
      try {
        if (typeof getSearchParams === 'function') searchParams = getSearchParams() || {};
        else if (window.searchParams) searchParams = window.searchParams;
      } catch (err) {
        return { ok: false, status: null, error: String(err && err.message ? err.message : err) };
      }
      var GEO = /lat|lng|long|token|tgz|uid|key|userid/i;
      var keys = Object.keys(searchParams).sort();
      var safe = {};
      keys.forEach(function (k) {
        if (GEO.test(k)) safe[k] = searchParams[k] == null || searchParams[k] === '' ? null : 'PRESENT';
        else safe[k] = searchParams[k];
      });
      var payload = { searchparams: searchParams, offsetLastActivity: 0, type: 'browseAll' };
      if (window.supportsAv1Video) payload.av = 1;
      return await new Promise(function (resolve) {
        try {
          apiRequest('browsenew', payload, {
            parseResponse: false,
            silent: true,
            success: function (body) {
              resolve({
                ok: true,
                status: 200,
                via: 'apiRequest',
                body: String(body == null ? '' : body),
                searchParamKeys: keys,
                searchParamSafe: safe
              });
            },
            error: function (_xhr, _kind, message) {
              resolve({
                ok: false,
                status: null,
                error: String(message == null ? 'apiRequest error' : message),
                searchParamKeys: keys,
                searchParamSafe: safe
              });
            }
          });
        } catch (err) {
          resolve({ ok: false, status: null, error: String(err && err.message ? err.message : err) });
        }
      });
    })()`,
  )) as InPageApiResult

  page.off('response', onResponse)

  if (!inPage.ok) {
    const stop = stopFromErrorMessage(inPage.error) ?? new ReaderSafetyError(`STOP: browsenew failed (${inPage.error})`)
    throw stop
  }
  const httpStop = stopFromHttpStatus(inPage.status)
  if (httpStop) throw httpStop
  const bodyStop = stopFromBody(inPage.body)
  if (bodyStop) throw bodyStop
  if (inPage.body.trim() === 'upgrademe') throw new Error('STOP: browsenew returned upgrademe (premium wall).')
  if (inPage.body.trim().startsWith('<')) throw new Error('STOP: browsenew returned HTML, not JSON.')

  let parsed: unknown
  try {
    parsed = JSON.parse(inPage.body)
  } catch {
    throw new Error('STOP: browsenew did not return JSON.')
  }
  const top = isRecord(parsed) ? parsed : { _nonObject: parsed }
  if (top.error === 'badorigin') throw new Error('STOP: browsenew badorigin.')
  const results = Array.isArray(top.results) ? top.results : []
  const slice = results.slice(0, MATERIALIZE).filter(isRecord)
  const fieldUnion = new Set<string>()
  for (const row of slice) Object.keys(row).forEach((k) => fieldUnion.add(k))

  const mexicoCount = results.filter((row) => {
    if (!isRecord(row)) return false
    const blob = `${row.city ?? ''} ${row.country ?? ''} ${row.area ?? ''}`.toLowerCase()
    return /mexico|méxico|\bmx\b|cdmx|mexico city|ciudad de/.test(blob)
  }).length

  const lookHits: Record<string, boolean> = {}
  for (const name of LOOK_FOR) {
    lookHits[name] = results.some((row) => {
      if (!isRecord(row)) return false
      const n = String(row.name ?? row.username ?? '')
      return n.toLowerCase() === name.toLowerCase()
    })
  }

  const firstFive = slice.map((row, index) => {
    const cleaned = stripSensitiveFields(row) as Record<string, unknown>
    return {
      alias: `Browse-${index + 1}`,
      name: typeof cleaned.name === 'string' ? cleaned.name : null,
      username: typeof cleaned.username === 'string' ? cleaned.username : null,
      fields: REPORT_FIELDS.map((f) => fieldReport(cleaned, f)),
      extraKeys: Object.keys(cleaned)
        .filter((k) => !(REPORT_FIELDS as readonly string[]).includes(k))
        .toSorted(),
    }
  })

  const lastactivity = slice.map((row) => row.lastactivity)
  const distances = slice.map((row) => row.distance)
  const nowSec = Math.floor(Date.now() / 1000)
  const lastactivityInterp = lastactivity.map((raw) => {
    const n = typeof raw === 'number' ? raw : Number(raw)
    if (!Number.isFinite(n)) return { raw, parseable: false }
    const asUnixSec = nowSec - n
    return {
      raw: n,
      asUnixSecondsIso: new Date(n * 1000).toISOString(),
      secondsAgoIfUnix: asUnixSec,
      daysAgoIfUnix: Math.round(asUnixSec / 86400),
    }
  })

  const report = {
    extractedAt: new Date().toISOString(),
    action: 'browsenew',
    method: 'GET',
    via: inPage.via,
    httpStatus: inPage.status,
    spaPath: shell.path,
    spaHash: shell.hash,
    sqliteImport: false,
    materialized: MATERIALIZE,
    resultCount: results.length,
    topLevelKeys: Object.keys(top).toSorted(),
    hasD: Object.prototype.hasOwnProperty.call(top, 'd'),
    searchParamKeys: inPage.searchParamKeys,
    searchParamsSanitized: inPage.searchParamSafe,
    observedAppPhp: observed,
    fieldUnion: [...fieldUnion].toSorted(),
    firstFive,
    mexicoOrCdmxInFullResponse: mexicoCount,
    lookForInFullResponse: lookHits,
    childrenInFirstFive: slice.map((row) => ({ name: row.name, haschildren: row.haschildren, wantschildren: row.wantschildren })),
    verificationInFirstFive: slice.map((row) => ({ name: row.name, faceverified: row.faceverified })),
    photosInFirstFive: slice.map((row) => ({ name: row.name, photos: photoMeta(row.photos) })),
    lastactivityInFirstFive: lastactivityInterp,
    distanceInFirstFive: distances,
    toDistanceTxtEvidence:
      'function toDistanceTxt(v){return locache.get("imperialunits")?toMiles(v):v} — metric display uses the raw value with i18n("km"); no /1000.',
    lastactivityEvidence:
      'time2TimeAgo(v){return timeago.format(new Date(1e3*v),activeLanguage)} and (Date.now()/1e3 - lastactivity) comparisons (300/1200). lastactivity is Unix seconds.',
    paginationEvidence:
      'Next page is GET browsenew with searchparams.offsetLastActivity = last result lastactivity. Exhausted when results.length < 15. THIS RUN did not paginate.',
    pinaloveApiRequestsThisScript: observed.filter((e) => e.action === 'browsenew').length,
  }

  await mkdir(RUNS_DIR, { recursive: true, mode: 0o700 })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outPath = path.join(RUNS_DIR, `${stamp}-browsenew-sanitized.json`)
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
  conceptualLog('GET browsenew', `results=${results.length} materialized=${slice.length}`)
  conceptualLog('SANITIZED_REPORT', outPath)
  console.log(JSON.stringify(report, null, 2))
  process.exit(0)
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
