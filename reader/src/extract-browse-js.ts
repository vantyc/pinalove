import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
import { BROWSER_META_PATH, RUNS_DIR } from './paths.ts'
import type { BrowserMeta } from './paths.ts'

function windows(hay: string, needle: string, before = 400, after = 900): string[] {
  const out: string[] = []
  let from = 0
  while (out.length < 8) {
    const i = hay.indexOf(needle, from)
    if (i < 0) break
    out.push(hay.slice(Math.max(0, i - before), Math.min(hay.length, i + needle.length + after)).replace(/\s+/g, ' '))
    from = i + needle.length
  }
  return out
}

async function main(): Promise<void> {
  const meta = JSON.parse(await readFile(BROWSER_META_PATH, 'utf8')) as BrowserMeta
  if (!meta.cdpUrl) throw new Error('STOP: no CDP')
  const browser = await chromium.connectOverCDP(meta.cdpUrl)
  const context = browser.contexts()[0]
  const page = context.pages().find((p) => p.url().includes('pinalove.com'))
  if (!page) throw new Error('STOP: no PinaLove tab')

  const extracted = await page.evaluate(async () => {
    const src = [...document.querySelectorAll('script[src]')]
      .map((el) => (el as HTMLScriptElement).src)
      .find((s) => s.includes('41a6d6b71fd94e9daf2049c5fc915652.js'))
    if (!src) return { error: 'bundle missing' }
    const text = await (await fetch(src, { credentials: 'same-origin' })).text()
    return { len: text.length, text }
  })
  if ('error' in extracted || !extracted.text) {
    throw new Error(extracted.error ?? 'no bundle')
  }
  const text = extracted.text
  const report = {
    bundleBytes: extracted.len,
    browsenewCall: windows(text, 'apiRequest("browsenew"', 500, 1400),
    searchAndAppend: windows(text, 'function searchAndAppend', 80, 1200),
    offsetLastActivity: windows(text, 'offsetLastActivity', 80, 250),
    distanceKmHints: windows(text, '/1000', 60, 80).concat(windows(text, ' km', 40, 60)).concat(windows(text, 'NEAR_ME_DISTANCE_KM', 40, 120)),
    asltxt: windows(text, 'asltxt', 80, 280),
    time2TimeAgo: windows(text, 'function time2TimeAgo', 40, 500),
    lastactivity1200: windows(text, 'lastactivity>1200', 80, 80),
    lastactivity300: windows(text, 'lastactivity>300', 80, 80),
    lastactivityUnix: windows(text, 'getTime()/1e3)-', 40, 80),
  }
  const outPath = path.join(RUNS_DIR, 'browse-js-extract.json')
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
  console.log(JSON.stringify(report, null, 2))
  process.exit(0)
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
