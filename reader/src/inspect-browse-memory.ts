import { readFile } from 'node:fs/promises'
import { chromium } from 'playwright'
import { BROWSER_META_PATH } from './paths.ts'
import type { BrowserMeta } from './paths.ts'

async function main(): Promise<void> {
  const meta = JSON.parse(await readFile(BROWSER_META_PATH, 'utf8')) as BrowserMeta
  const browser = await chromium.connectOverCDP(meta.cdpUrl!)
  const page = browser.contexts()[0].pages().find((p) => p.url().includes('pinalove.com'))
  if (!page) throw new Error('STOP: no PinaLove tab')
  const out = await page.evaluate(`(function () {
    function typeOf(name) { return typeof window[name]; }
    function len(v) {
      if (!v) return 0;
      if (Array.isArray(v)) return v.length;
      if (typeof v === 'object') return Object.keys(v).length;
      return -1;
    }
    var users = window.users;
    var browseResultsArr = window.browseResultsArr;
    var first = null;
    if (Array.isArray(users) && users[0] && typeof users[0] === 'object') {
      var u = users[0];
      first = {
        keys: Object.keys(u).sort(),
        name: u.name || null,
        age: u.age,
        city: u.city,
        country: u.country,
        distance: u.distance,
        lastactivity: u.lastactivity,
        haschildren: u.haschildren,
        faceverified: u.faceverified,
        gender: u.gender
      };
    }
    var names = [];
    if (Array.isArray(users)) {
      for (var i = 0; i < users.length; i++) {
        if (users[i] && users[i].name) names.push(String(users[i].name));
      }
    }
    var mexico = 0;
    if (Array.isArray(users)) {
      for (var i = 0; i < users.length; i++) {
        var blob = String((users[i] && users[i].city) || '') + ' ' + String((users[i] && users[i].country) || '');
        if (/mexico|cdmx|méxico/i.test(blob)) mexico++;
      }
    }
    return {
      typeofGetSearchParams: typeOf('getSearchParams'),
      typeofSearchParams: typeOf('searchParams'),
      typeofApiRequest: typeOf('apiRequest'),
      typeofUsers: typeOf('users'),
      typeofBrowseResultsArr: typeOf('browseResultsArr'),
      usersLen: len(users),
      browseResultsArrLen: len(browseResultsArr),
      first,
      mexicoInUsers: mexico,
      firstFiveNames: names.slice(0, 5)
    };
  })()`)
  console.log(JSON.stringify(out, null, 2))
  process.exit(0)
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
