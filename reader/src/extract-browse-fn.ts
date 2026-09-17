import { readFile } from 'node:fs/promises'
import { chromium } from 'playwright'
import { BROWSER_META_PATH } from './paths.ts'
import type { BrowserMeta } from './paths.ts'

async function main(): Promise<void> {
  const meta = JSON.parse(await readFile(BROWSER_META_PATH, 'utf8')) as BrowserMeta
  const browser = await chromium.connectOverCDP(meta.cdpUrl!)
  const page = browser.contexts()[0].pages().find((p) => p.url().includes('pinalove.com'))
  if (!page) throw new Error('STOP: no PinaLove tab')
  const out = await page.evaluate(
    `(async () => {
      var srcs = [];
      document.querySelectorAll('script[src]').forEach(function (el) { srcs.push(el.src); });
      var src = srcs.find(function (s) { return s.indexOf('41a6d6b71fd94e9daf2049c5fc915652.js') !== -1; });
      if (!src) return { error: 'bundle missing' };
      var text = await (await fetch(src, { credentials: 'same-origin' })).text();
      function grab(name, n) {
        n = n || 700;
        var i = text.indexOf(name);
        if (i < 0) return null;
        return text.slice(i, i + n).replace(/\\s+/g, ' ');
      }
      var liveSearchParams = null;
      try {
        if (typeof window.getSearchParams === 'function') liveSearchParams = window.getSearchParams();
        else liveSearchParams = window.searchParams || null;
      } catch (err) {
        liveSearchParams = 'threw';
      }
      return {
        toDistanceTxt: grab('function toDistanceTxt'),
        getSearchParams: grab('function getSearchParams'),
        buildBrowseRequestSearchParams: grab('function buildBrowseRequestSearchParams'),
        formatBrowseResultItem: grab('function formatBrowseResultItem(', 500),
        apiRequestDef: grab('function apiRequest', 500),
        liveSearchParams: liveSearchParams
      };
    })()`,
  )
  console.log(JSON.stringify(out, null, 2))
  process.exit(0)
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
