import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
import { MAX_PROFILES } from './maxProfiles.ts'
import { BROWSER_META_PATH, RUNS_DIR } from './paths.ts'
import type { BrowserMeta } from './paths.ts'
import { PinaLoveReader } from './pinaloveReader.ts'
import {
  conceptualLog,
  redactId,
  redactPhotoUrl,
  redactText,
  redactUsername,
} from './sanitize.ts'

type SanitizedField = {
  rawFieldName: string
  rawPresent: boolean
  rawValue: unknown
  normalizedValue: unknown
  confidence: string
}

function rawOf(item: Record<string, unknown>, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(item, key) ? item[key] : undefined
}

function field(
  rawFieldName: string,
  original: Record<string, unknown>,
  normalized: { value: unknown; sourceValue: string | null; confidence: string },
  transformRaw: (value: unknown) => unknown = (v) => v,
): SanitizedField {
  const present = Object.prototype.hasOwnProperty.call(original, rawFieldName)
  const raw = present ? transformRaw(rawOf(original, rawFieldName)) : '(absent)'
  return {
    rawFieldName,
    rawPresent: present,
    rawValue: present ? raw : '(absent)',
    normalizedValue: normalized.value,
    confidence: normalized.confidence,
  }
}

async function main(): Promise<void> {
  const meta = JSON.parse(await readFile(BROWSER_META_PATH, 'utf8')) as BrowserMeta
  if (!meta.cdpUrl) {
    throw new Error(
      'STOP: dedicated Chrome is in login mode (no debugger). After you confirm Matches, I will attach without repeating Google OAuth.',
    )
  }
  const browser = await chromium.connectOverCDP(meta.cdpUrl)
  const context = browser.contexts()[0]
  if (!context) {
    throw new Error('STOP: no browser context on CDP. Is reader:login still running?')
  }
  const page =
    context.pages().find((p) => p.url().includes('pinalove.com')) ?? context.pages()[0]
  if (!page) {
    throw new Error('STOP: no PinaLove tab in the dedicated browser.')
  }

  type Observed = {
    method: string
    pathname: string
    action: string | null
    box: string | null
    status: number
  }
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
    const method = response.request().method()
    const status = response.status()
    autoRequests.push({ method, pathname, action, box, status })
    const label = action
      ? `${method} ${pathname} i=${action}${box ? ` box=${box}` : ''} -> ${status}`
      : `${method} ${pathname} -> ${status}`
    conceptualLog('AUTO', label)
  }
  page.on('response', onResponse)

  const reader = new PinaLoveReader(page)
  let spa: { path: string; hash: string; hasApi: boolean; loggedin: boolean }
  try {
    spa = await reader.assertSpaReady()
  } catch (err) {
    page.off('response', onResponse)
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(message)
  }
  conceptualLog(
    'SPA',
    `path=${spa.path} hash=${spa.hash} apiRequest=${String(spa.hasApi)} loggedin=${String(spa.loggedin)}`,
  )

  const read = await reader.getMatches({ requireApiRequest: true })
  page.off('response', onResponse)

  const sanitizedMatches = read.matches.map((match, index) => {
    const original = match.raw.original
    const n = match.normalized
    const photos = original.photos
    let photoMeta: unknown = '(absent)'
    if (photos && typeof photos === 'object') {
      const list = Array.isArray(photos) ? photos : Object.values(photos)
      photoMeta = {
        count: list.length,
        ids: list
          .filter((p): p is Record<string, unknown> => Boolean(p) && typeof p === 'object')
          .map((p) => redactId(p.ID)),
        uriPatterns: list
          .filter((p): p is Record<string, unknown> => Boolean(p) && typeof p === 'object')
          .map((p) => redactPhotoUrl(typeof p.Uri === 'string' ? p.Uri : null)),
      }
    }
    return {
      alias: `Match-${index + 1}`,
      presentFields: match.presentFields,
      fields: [
        field('id', original, n.externalId, redactId),
        field('name', original, n.username, redactUsername),
        {
          rawFieldName: 'username',
          rawPresent: Object.prototype.hasOwnProperty.call(original, 'username'),
          rawValue: Object.prototype.hasOwnProperty.call(original, 'username')
            ? redactUsername(original.username)
            : '(absent)',
          normalizedValue: n.username.value ? redactUsername(n.username.value) : null,
          confidence: n.username.confidence,
        },
        field('age', original, n.age),
        field('city', original, n.city),
        field('country', original, n.country),
        field('distance', original, n.distance),
        field('headline', original, n.headline, (v) => redactText(v)),
        field('description', original, n.description, (v) => redactText(v)),
        field('haschildren', original, n.hasChildren),
        field('wantschildren', original, n.wantsChildren),
        field('faceverified', original, n.faceVerified),
        field('education', original, n.education),
        field('occupation', original, n.occupation, (v) => redactText(v, 40)),
        field('jointime', original, n.joinTime),
        field('lookingfor', original, n.lookingFor),
        field('lastactivity', original, n.lastActivity),
        {
          rawFieldName: 'photos',
          rawPresent: Object.prototype.hasOwnProperty.call(original, 'photos'),
          rawValue: photoMeta,
          normalizedValue: {
            photoCount: n.photoCount.value,
            primaryPhotoUrl: redactPhotoUrl(n.primaryPhotoUrl.value),
          },
          confidence: n.primaryPhotoUrl.confidence,
        },
        field('avatar', original, n.primaryPhotoUrl, (v) => redactPhotoUrl(v) ?? redactText(v, 40)),
        field('thumb', original, n.primaryPhotoUrl, (v) => redactPhotoUrl(v) ?? redactText(v, 40)),
      ],
      alwaysUnknownFromListsNew: {
        relationshipStatus: n.relationshipStatus,
        maritalHistory: n.maritalHistory,
        religion: n.religion,
      },
    }
  })

  const report = {
    extractedAt: new Date().toISOString(),
    action: 'listsnew',
    box: 'matches',
    maxProfiles: MAX_PROFILES,
    foundrows: read.foundrows,
    resultCount: read.resultCount,
    materializedCount: read.materializedCount,
    via: read.via,
    spaPath: spa.path,
    spaHash: spa.hash,
    spaAuthenticated: spa.loggedin && spa.hasApi,
    etLoadRequests: autoRequests.map((e) => ({
      method: e.method,
      pathname: e.pathname,
      action: e.action,
      box: e.box,
      status: e.status,
    })),
    fieldUnion: read.fieldUnion,
    haschildrenInUnion: read.fieldUnion.includes('haschildren'),
    wantschildrenInUnion: read.fieldUnion.includes('wantschildren'),
    faceverifiedInUnion: read.fieldUnion.includes('faceverified'),
    matches: sanitizedMatches,
  }

  await mkdir(RUNS_DIR, { recursive: true, mode: 0o700 })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outPath = path.join(RUNS_DIR, `${stamp}-listsnew-sanitized.json`)
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })

  conceptualLog('GET listsnew', `box=matches -> ${read.resultCount} results`)
  conceptualLog('MATERIALIZE', `${read.materializedCount}/${MAX_PROFILES} (foundrows=${String(read.foundrows)})`)
  conceptualLog('SANITIZED_REPORT', outPath)
  console.log(JSON.stringify(report, null, 2))
  // Do not browser.close(): this CDP connection shares the headed login profile.
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
