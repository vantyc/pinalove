import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
import { FORBIDDEN_ACTIONS } from './allowlist.ts'
import { BROWSER_META_PATH, RUNS_DIR } from './paths.ts'
import type { BrowserMeta } from './paths.ts'
import { conceptualLog } from './sanitize.ts'

const FORBIDDEN = FORBIDDEN_ACTIONS as readonly string[]
const INTERESTING =
  /browse|listsnew|playmeet|meetnew|searchnew|playlike|hideuser|feedprofile|revealvisit|markasread|distance|lastactivity|km\b|meter/i

type Hit = { file: string; snippet: string }

function snippetsAround(source: string, file: string): Hit[] {
  const hits: Hit[] = []
  const re = /apiRequest\s*\(\s*['"][^'"]+['"][\s\S]{0,240}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(source))) {
    const snippet = m[0].replace(/\s+/g, ' ').slice(0, 280)
    if (INTERESTING.test(snippet) || /box\s*:/.test(snippet)) {
      hits.push({ file, snippet })
    }
  }
  const extra = [
    /box\s*:\s*['"]browse['"]/gi,
    /['"]browsenew['"]/gi,
    /['"]playmeet['"]/gi,
    /distance\s*[/=].{0,80}/gi,
    /lastactivity.{0,80}/gi,
  ]
  for (const pattern of extra) {
    const copy = new RegExp(pattern.source, pattern.flags)
    let e: RegExpExecArray | null
    while ((e = copy.exec(source))) {
      hits.push({ file, snippet: e[0].replace(/\s+/g, ' ').slice(0, 220) })
    }
  }
  return hits
}

async function main(): Promise<void> {
  const meta = JSON.parse(await readFile(BROWSER_META_PATH, 'utf8')) as BrowserMeta
  if (!meta.cdpUrl) {
    throw new Error('STOP: dedicated Chrome has no debugger. Do not start a new login.')
  }
  const browser = await chromium.connectOverCDP(meta.cdpUrl)
  const context = browser.contexts()[0]
  if (!context) throw new Error('STOP: no browser context on CDP.')
  const page =
    context.pages().find((p) => p.url().includes('pinalove.com')) ?? context.pages()[0]
  if (!page) throw new Error('STOP: no PinaLove tab in the dedicated browser.')

  const shell = await page.evaluate(() => {
    const w = window as unknown as {
      apiRequest?: unknown
      myData?: { loggedin?: unknown }
    }
    const body = document.body?.innerText?.slice(0, 2500) ?? ''
    return {
      hrefPath: location.pathname,
      hash: location.hash,
      title: document.title,
      hasApi: typeof w.apiRequest === 'function',
      loggedin: Boolean(w.myData?.loggedin),
      hasGoogleSignIn: /Sign in with Google/i.test(body),
      insecureBrowser: /may not be secure/i.test(body),
      captcha: /captcha|unusual traffic|are you a robot/i.test(body),
      hasBrowseNav: /\bBrowse\b/i.test(body),
      hasListsNav: /\bLists\b/i.test(body),
      hasMailNav: /\bMail\b/i.test(body),
    }
  })
  if (shell.insecureBrowser) throw new Error('STOP: Google/browser-not-secure challenge is showing.')
  if (shell.captcha) throw new Error('STOP: CAPTCHA/challenge detected.')
  if (shell.hasGoogleSignIn || !shell.loggedin || !shell.hasApi) {
    throw new Error('STOP: PinaLove session is not authenticated in this Chrome.')
  }
  conceptualLog('SPA', `path=${shell.hrefPath} hash=${shell.hash} browseNav=${String(shell.hasBrowseNav)}`)

  const inspect = await page.evaluate(async () => {
    const w = window as unknown as {
      apiRequest?: unknown
      myData?: Record<string, unknown>
      locache?: { data?: Record<string, unknown> }
    }
    const scriptSrcs = [...document.querySelectorAll('script[src]')]
      .map((el) => (el as HTMLScriptElement).src)
      .filter((src) => src.includes('pinalove.com'))
    const resources = performance
      .getEntriesByType('resource')
      .map((e) => e.name)
      .filter((n) => n.includes('/nt/app.php') || n.includes('.js'))
    const appPhp = resources
      .filter((n) => n.includes('/nt/app.php'))
      .map((n) => {
        try {
          const u = new URL(n)
          return { i: u.searchParams.get('i'), box: u.searchParams.get('box'), path: u.pathname }
        } catch {
          return { i: null, box: null, path: '(unparseable)' }
        }
      })
    const locacheKeys = w.locache?.data ? Object.keys(w.locache.data) : []
    const myDataKeys = w.myData ? Object.keys(w.myData) : []
    const texts: { file: string; text: string }[] = []
    for (const src of scriptSrcs.slice(0, 30)) {
      try {
        const res = await fetch(src, { credentials: 'same-origin' })
        const text = await res.text()
        texts.push({ file: src.replace(/^https:\/\/www\.pinalove\.com/, ''), text })
      } catch {
        texts.push({ file: src, text: '' })
      }
    }
    return {
      scriptSrcs: scriptSrcs.map((s) => s.replace(/^https:\/\/www\.pinalove\.com/, '')),
      observedAppPhp: appPhp,
      locacheKeys,
      myDataKeys,
      texts,
    }
  })

  const hits: Hit[] = []
  const distanceHits: Hit[] = []
  const lastActivityHits: Hit[] = []
  const mutatorHits: Hit[] = []
  for (const file of inspect.texts) {
    hits.push(...snippetsAround(file.text, file.file))
    const distRe = /function[^{]{0,80}distance[\s\S]{0,400}|distance\s*[/=]\s*1000[\s\S]{0,80}|\/\s*1000[\s\S]{0,60}distance/gi
    let d: RegExpExecArray | null
    while ((d = distRe.exec(file.text))) {
      distanceHits.push({ file: file.file, snippet: d[0].replace(/\s+/g, ' ').slice(0, 280) })
    }
    const laRe = /lastactivity[\s\S]{0,180}/gi
    let l: RegExpExecArray | null
    while ((l = laRe.exec(file.text))) {
      lastActivityHits.push({ file: file.file, snippet: l[0].replace(/\s+/g, ' ').slice(0, 220) })
    }
    for (const action of FORBIDDEN) {
      if (file.text.includes(`'${action}'`) || file.text.includes(`"${action}"`)) {
        mutatorHits.push({ file: file.file, snippet: `mentions ${action}` })
      }
    }
  }

  const unique = (items: Hit[]) => {
    const seen = new Set<string>()
    const out: Hit[] = []
    for (const item of items) {
      const k = `${item.file}|${item.snippet}`
      if (seen.has(k)) continue
      seen.add(k)
      out.push(item)
    }
    return out.slice(0, 80)
  }

  const report = {
    pinaloveApiRequestsThisScript: 0,
    navigated: false,
    spa: shell,
    scriptSrcs: inspect.scriptSrcs,
    observedAppPhpInPerformance: inspect.observedAppPhp,
    locacheKeys: inspect.locacheKeys.filter((k) => /browse|list|meet|search|play/i.test(k)),
    myDataKeys: inspect.myDataKeys.filter((k) => !/token|sess|pass|cookie|email/i.test(k)),
    apiRequestHits: unique(hits),
    distanceHits: unique(distanceHits),
    lastActivityHits: unique(lastActivityHits),
    forbiddenMentions: unique(mutatorHits),
  }

  await mkdir(RUNS_DIR, { recursive: true, mode: 0o700 })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outPath = path.join(RUNS_DIR, `${stamp}-browse-discover.json`)
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
  conceptualLog('DISCOVER', outPath)
  console.log(JSON.stringify(report, null, 2))
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err)
  console.error(message)
  process.exit(1)
})
