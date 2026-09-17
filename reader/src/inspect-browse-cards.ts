import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
import { BROWSER_META_PATH, RUNS_DIR } from './paths.ts'
import type { BrowserMeta } from './paths.ts'
import { redactPhotoUrl, redactText, stripSensitiveFields } from './sanitize.ts'

function photoMeta(photos: unknown): unknown {
  if (photos == null) return '(absent)'
  if (typeof photos !== 'object') return { type: typeof photos }
  const list = Array.isArray(photos) ? photos : Object.values(photos)
  return {
    shape: Array.isArray(photos) ? 'array' : 'object',
    count: list.length,
    uriPatterns: list
      .filter((p): p is Record<string, unknown> => Boolean(p) && typeof p === 'object')
      .map((p) =>
        redactPhotoUrl(
          typeof p.Uri === 'string' ? p.Uri : typeof p.uri === 'string' ? p.uri : null,
        ),
      ),
  }
}

async function main(): Promise<void> {
  const meta = JSON.parse(await readFile(BROWSER_META_PATH, 'utf8')) as BrowserMeta
  const browser = await chromium.connectOverCDP(meta.cdpUrl!)
  const page = browser.contexts()[0].pages().find((p) => p.url().includes('pinalove.com'))
  if (!page) throw new Error('STOP: no PinaLove tab')
  const raw = await page.evaluate(`(function () {
    function safeParams(obj) {
      if (!obj || typeof obj !== 'object') return { type: typeof obj, keys: [] };
      var keys = Object.keys(obj).sort();
      var safe = {};
      keys.forEach(function (k) {
        if (/lat|lng|long|token|tgz|uid|key|userid/i.test(k)) {
          safe[k] = obj[k] == null || obj[k] === '' ? null : 'PRESENT';
        } else {
          safe[k] = obj[k];
        }
      });
      return { keys: keys, safe: safe };
    }
    var sp = null;
    try { sp = typeof getSearchParams === 'function' ? getSearchParams() : window.searchParams; } catch (e) { sp = String(e); }
    var users = Array.isArray(window.users) ? window.users : [];
    var slice = users.slice(0, 5).map(function (u) {
      return {
        name: u.name,
        age: u.age,
        city: u.city,
        country: u.country,
        area: u.area,
        distance: u.distance,
        lastactivity: u.lastactivity,
        haschildren: u.haschildren,
        wantschildren: u.wantschildren,
        faceverified: u.faceverified,
        gender: Object.prototype.hasOwnProperty.call(u, 'gender') ? u.gender : '(absent)',
        education: u.education,
        lookingfor: u.lookingfor,
        headline: u.headline,
        description: u.description,
        photos: u.photos,
        id: u.id,
        bg: u.bg,
        asltxt: u.asltxt,
        agostr: u.agostr,
        keys: Object.keys(u).sort()
      };
    });
    return {
      searchParams: safeParams(sp),
      windowSearchParams: safeParams(window.searchParams),
      usersLen: users.length,
      slice: slice
    };
  })()`) as {
    searchParams: { keys: string[]; safe: Record<string, unknown> }
    windowSearchParams: { keys: string[]; safe: Record<string, unknown> }
    usersLen: number
    slice: Array<Record<string, unknown>>
  }

  const nowSec = Math.floor(Date.now() / 1000)
  const profiles = raw.slice.map((row) => {
    const cleaned = stripSensitiveFields(row) as Record<string, unknown>
    const la = Number(cleaned.lastactivity)
    return {
      name: cleaned.name,
      id: cleaned.id,
      age: cleaned.age,
      city: cleaned.city,
      country: cleaned.country,
      area: cleaned.area,
      distance: cleaned.distance,
      asltxt: cleaned.asltxt,
      agostr: cleaned.agostr,
      lastactivity: cleaned.lastactivity,
      lastactivityIsoIfUnix: Number.isFinite(la) ? new Date(la * 1000).toISOString() : null,
      lastactivityDaysAgoIfUnix: Number.isFinite(la) ? Math.round((nowSec - la) / 86400) : null,
      haschildren: cleaned.haschildren,
      wantschildren: cleaned.wantschildren,
      faceverified: cleaned.faceverified,
      gender: cleaned.gender,
      education: cleaned.education,
      lookingfor: cleaned.lookingfor,
      headline: redactText(cleaned.headline, 80),
      description: redactText(cleaned.description, 80),
      photos: photoMeta(cleaned.photos),
      keys: cleaned.keys,
    }
  })

  const report = {
    source: 'SPA in-memory users[] from earlier /et/ browsenew. No extra API call.',
    pinaloveApiRequestsThisScript: 0,
    usersLen: raw.usersLen,
    getSearchParams: raw.searchParams,
    windowSearchParams: raw.windowSearchParams,
    profiles,
  }
  const outPath = path.join(RUNS_DIR, 'browse-memory-sanitized.json')
  await mkdir(RUNS_DIR, { recursive: true, mode: 0o700 })
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
  console.log(JSON.stringify(report, null, 2))
  process.exit(0)
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
