import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
import { openDatabase } from '../../backend/src/db.ts'
import { ProfileStore } from '../../backend/src/store.ts'
import { FORBIDDEN_ACTIONS } from './allowlist.ts'
import { MAX_PROFILES } from './maxProfiles.ts'
import { BROWSER_META_PATH, RUNS_DIR } from './paths.ts'
import type { BrowserMeta } from './paths.ts'
import { PinaLoveReader } from './pinaloveReader.ts'
import { conceptualLog, redactUsername } from './sanitize.ts'
import { collectMatchAnomalies, listsNewMatchToImport } from './toImport.ts'
import type { DataAnomaly } from './toImport.ts'

const SQLITE_PATH =
  process.env.SQLITE_PATH ?? path.join(process.cwd(), 'data/pinalove.sqlite')

type Observed = {
  method: string
  pathname: string
  action: string | null
  box: string | null
  status: number
}

function sqlitePathIsLocal(sqlitePath: string): void {
  const resolved = path.resolve(sqlitePath)
  if (resolved.includes('/var/lib/pinalove') || resolved.includes('k8s')) {
    throw new Error('Refusing to write the Kubernetes hostPath SQLite from this ingest')
  }
}

async function main(): Promise<void> {
  sqlitePathIsLocal(SQLITE_PATH)
  const meta = JSON.parse(await readFile(BROWSER_META_PATH, 'utf8')) as BrowserMeta
  if (!meta.cdpUrl) {
    throw new Error('STOP: dedicated Chrome has no CDP. Reopen with port 9333 after SPA login.')
  }

  const browser = await chromium.connectOverCDP(meta.cdpUrl)
  const context = browser.contexts()[0]
  if (!context) {
    throw new Error('STOP: no browser context on CDP.')
  }
  const page =
    context.pages().find((p) => p.url().includes('pinalove.com')) ?? context.pages()[0]
  if (!page) {
    throw new Error('STOP: no PinaLove tab in the dedicated browser.')
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
    autoRequests.push({
      method: response.request().method(),
      pathname,
      action,
      box,
      status: response.status(),
    })
  }
  page.on('response', onResponse)

  try {
    const reader = new PinaLoveReader(page)
    const spa = await reader.assertSpaReady()
    conceptualLog(
      'SPA',
      `path=${spa.path} hash=${spa.hash} apiRequest=${String(spa.hasApi)} loggedin=${String(spa.loggedin)}`,
    )

    const read = await reader.getMatches({ requireApiRequest: true })
    page.off('response', onResponse)

    const forbiddenHit = autoRequests.filter(
      (r) =>
        r.action != null &&
        ((FORBIDDEN_ACTIONS as readonly string[]).includes(r.action) || r.action === 'profilenew'),
    )
    if (forbiddenHit.length > 0) {
      throw new Error(
        `STOP: observed forbidden action(s): ${forbiddenHit.map((r) => r.action).join(', ')}`,
      )
    }

    const listsnewCalls = autoRequests.filter(
      (r) => r.action === 'listsnew' && r.box === 'matches',
    )
    if (listsnewCalls.length > 1) {
      throw new Error(`STOP: more than one listsnew call (${listsnewCalls.length})`)
    }

    const inputs = read.matches.map((match) => listsNewMatchToImport(match))
    const anomalies: DataAnomaly[] = read.matches.flatMap(collectMatchAnomalies)
    if (read.foundrows == null) {
      anomalies.push({
        username: '(list)',
        code: 'foundrows-absent',
        detail: 'foundrows omitted; using results.length',
      })
    }

    const db = openDatabase(SQLITE_PATH)
    const store = new ProfileStore(db)
    const result = store.importProfiles(inputs)
    const persisted = store.list({}).filter((p) => p.source === 'PINALOVE')
    const byStatus: Record<string, number> = {}
    const unknownByField = {
      children: 0,
      maritalHistory: 0,
      religion: 0,
      occupation: 0,
      gender: 0,
      photoVerified: 0,
      education: 0,
    }
    for (const p of persisted) {
      byStatus[p.reviewStatus] = (byStatus[p.reviewStatus] ?? 0) + 1
      if (p.hasChildren === 'UNKNOWN') unknownByField.children += 1
      if (p.maritalHistory === 'UNKNOWN') unknownByField.maritalHistory += 1
      if (!p.religion) unknownByField.religion += 1
      if (!p.occupation) unknownByField.occupation += 1
      if (!p.gender) unknownByField.gender += 1
      if (p.faceVerified === 'UNKNOWN') unknownByField.photoVerified += 1
      if (!p.education) unknownByField.education += 1
    }

    const summary = {
      extractedAt: new Date().toISOString(),
      sqlitePath: SQLITE_PATH,
      action: 'listsnew',
      box: 'matches',
      maxProfiles: MAX_PROFILES,
      foundrows: read.foundrows,
      obtained: read.resultCount,
      materialized: read.materializedCount,
      persisted: result.imported + result.updated,
      importResult: result,
      classification: byStatus,
      unknownByField,
      pinaloveRequests: autoRequests.map((e) => ({
        method: e.method,
        pathname: e.pathname,
        action: e.action,
        box: e.box,
        status: e.status,
      })),
      forbiddenObserved: forbiddenHit,
      anomalies: anomalies.map((a) => ({
        ...a,
        username: redactUsername(a.username),
      })),
    }

    await mkdir(RUNS_DIR, { recursive: true, mode: 0o700 })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const outPath = path.join(RUNS_DIR, `${stamp}-ingest-summary.json`)
    await writeFile(outPath, `${JSON.stringify(summary, null, 2)}\n`, { mode: 0o600 })
    db.close()

    conceptualLog('GET listsnew', `box=matches -> ${read.resultCount} results (${read.via})`)
    conceptualLog('PERSIST', `${result.imported} imported / ${result.updated} updated`)
    conceptualLog('SUMMARY', outPath)
    console.log(JSON.stringify(summary, null, 2))
  } finally {
    page.off('response', onResponse)
    await browser.close()
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
