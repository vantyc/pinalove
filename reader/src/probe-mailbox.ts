import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
import { assertAllowedReadAction, FORBIDDEN_ACTIONS, ReaderSafetyError } from './allowlist.ts'
import { BROWSER_META_PATH, RUNS_DIR } from './paths.ts'
import type { BrowserMeta } from './paths.ts'
import { conceptualLog, redactId, redactPhotoUrl, redactText, redactUsername, stripSensitiveFields } from './sanitize.ts'
import { stopFromBody, stopFromErrorMessage, stopFromHttpStatus } from './stopConditions.ts'

/** ONE-SHOT diagnostic. Do not loop. Do not open chat. Do not persist to SQLite. */
const MAILBOX_TYPE = 'newunread'
const PAGE_NUMBER = 1
const MATERIALIZE = 8

type InPageApiResult =
  | { ok: true; status: number; body: string; via: string; payloadKeys: string[] }
  | { ok: false; status: number | null; error: string; payloadKeys?: string[] }

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function unixToIso(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  const ms = value > 1e12 ? value : value * 1000
  const d = new Date(ms)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function ageFromUnix(iso: string | null, now = Date.now()): string | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  const sec = Math.round((now - t) / 1000)
  if (sec < 90) return `${sec}s`
  if (sec < 3600) return `${Math.round(sec / 60)}m`
  if (sec < 86400) return `${Math.round(sec / 3600)}h`
  return `${Math.round(sec / 86400)}d`
}

function itemReport(item: Record<string, unknown>): Record<string, unknown> {
  const fieldUnion = Object.keys(item).toSorted()
  const timeIso = unixToIso(item.time)
  const lastActivityIso = unixToIso(item.lastactivity)
  return {
    fieldUnion,
    username: redactUsername(item.username ?? item.name),
    userid: redactId(item.userid ?? item.id),
    hasUsername: typeof item.username === 'string' && item.username.length > 0,
    hasUserid: item.userid != null && String(item.userid) !== '',
    unreadRaw: item.new ?? '(absent)',
    unread: item.new === 1 || item.new === '1' || item.new === true,
    timeUnix: typeof item.time === 'number' ? 'PRESENT' : item.time == null ? '(absent)' : typeof item.time,
    timeIso,
    age: ageFromUnix(timeIso),
    lastactivityIso: lastActivityIso,
    lastactivityAge: ageFromUnix(lastActivityIso),
    cityPresent: typeof item.city === 'string' && item.city.length > 0,
    agePresent: item.age != null,
    genderPresent: item.gender != null,
    preview: redactText(item.text, 80),
    thumb: redactPhotoUrl(item.thumb),
    boostbump: item.boostbump ?? '(absent)',
  }
}

async function main(): Promise<void> {
  assertAllowedReadAction('mailboxnew')
  const meta = JSON.parse(await readFile(BROWSER_META_PATH, 'utf8')) as BrowserMeta
  if (!meta.cdpUrl) throw new Error('STOP: dedicated Chrome has no debugger.')
  const browser = await chromium.connectOverCDP(meta.cdpUrl)
  const context = browser.contexts()[0]
  if (!context) throw new Error('STOP: no browser context on CDP.')
  const page =
    context.pages().find((p) => p.url().includes('pinalove.com')) ?? context.pages()[0]
  if (!page) throw new Error('STOP: no PinaLove tab.')

  const shell = (await page.evaluate(`({
    path: location.pathname,
    hash: location.hash,
    hasApi: typeof apiRequest === 'function',
    loggedin: Boolean(window.myData && window.myData.loggedin),
    google: /Sign in with Google/i.test(document.body.innerText || ''),
    captcha: /captcha|unusual traffic|are you a robot/i.test(document.body.innerText || ''),
    insecure: /may not be secure/i.test(document.body.innerText || ''),
    activePage: typeof myActivePage === 'string' ? myActivePage : null
  })`)) as {
    path: string
    hash: string
    hasApi: boolean
    loggedin: boolean
    google: boolean
    captcha: boolean
    insecure: boolean
    activePage: string | null
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
      var payload = { type: ${JSON.stringify(MAILBOX_TYPE)}, pagenumber: ${PAGE_NUMBER} };
      var keys = Object.keys(payload);
      return await new Promise(function (resolve) {
        try {
          apiRequest('mailboxnew', payload, {
            parseResponse: false,
            silent: true,
            success: function (body) {
              resolve({
                ok: true,
                status: 200,
                via: 'apiRequest',
                body: String(body == null ? '' : body),
                payloadKeys: keys
              });
            },
            error: function (_xhr, _kind, message) {
              resolve({
                ok: false,
                status: null,
                error: String(message == null ? 'apiRequest error' : message),
                payloadKeys: keys
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
    const stop = stopFromErrorMessage(inPage.error) ?? new ReaderSafetyError(`STOP: mailboxnew failed (${inPage.error})`)
    throw stop
  }
  const httpStop = stopFromHttpStatus(inPage.status)
  if (httpStop) throw httpStop
  const bodyStop = stopFromBody(inPage.body)
  if (bodyStop) throw bodyStop
  if (inPage.body.trim() === 'upgrademe') throw new Error('STOP: mailboxnew returned upgrademe (premium wall).')
  if (inPage.body.trim().startsWith('<')) throw new Error('STOP: mailboxnew returned HTML, not JSON.')

  let parsed: unknown
  try {
    parsed = JSON.parse(inPage.body)
  } catch {
    throw new Error('STOP: mailboxnew did not return JSON.')
  }
  const top = isRecord(parsed) ? parsed : { _nonObject: parsed }
  if (top.error === 'badorigin') throw new Error('STOP: mailboxnew badorigin.')
  const messages = Array.isArray(top.messages) ? top.messages.filter(isRecord) : []
  const slice = messages.slice(0, MATERIALIZE)
  const fieldUnion = new Set<string>()
  for (const item of slice) Object.keys(item).forEach((k) => fieldUnion.add(k))

  const unreadBefore = typeof top.unreadcount === 'number' ? top.unreadcount : null
  const mailboxCalls = observed.filter((e) => e.action === 'mailboxnew')
  const otherCalls = observed.filter((e) => e.action !== 'mailboxnew')
  const forbiddenDuring = observed.filter(
    (e) => e.action != null && (FORBIDDEN_ACTIONS as readonly string[]).includes(e.action),
  )
  if (forbiddenDuring.length > 0) {
    throw new ReaderSafetyError(`STOP: forbidden action during mailbox probe: ${forbiddenDuring.map((e) => e.action).join(',')}`)
  }

  const report = {
    pinaloveApiRequestsThisScript: mailboxCalls.length,
    navigated: false,
    openedConversation: false,
    markedAsRead: false,
    persistedToSqlite: false,
    action: 'mailboxnew',
    method: mailboxCalls[0]?.method ?? 'GET',
    payload: { type: MAILBOX_TYPE, pagenumber: PAGE_NUMBER },
    spa: shell,
    topKeys: Object.keys(top).toSorted(),
    unreadcount: unreadBefore,
    messageCount: messages.length,
    materialized: slice.length,
    fieldUnion: [...fieldUnion].toSorted(),
    items: slice.map(itemReport),
    premiummessages: Array.isArray(top.premiummessages) ? top.premiummessages.length : '(absent)',
    boostedmessages: Array.isArray(top.boostedmessages) ? top.boostedmessages.length : '(absent)',
    observedAppPhp: observed,
    otherActionsDuringProbe: otherCalls,
    notes: [
      'Static JS: loadMail() calls mailboxnew only. markasread/convonew/broadcastinchat are separate.',
      'This probe called mailboxnew once via in-page apiRequest. It did not click Mail, open a thread, or send.',
      'Conversation body is convonew; SPA then markAsRead + broadcastinchat. Not called.',
      'Send is POST sendmessage. Not called. Added to FORBIDDEN already.',
    ],
    sanitizedTop: stripSensitiveFields({
      unreadcount: top.unreadcount ?? null,
      messageCount: messages.length,
      premiummessages: Array.isArray(top.premiummessages) ? top.premiummessages.length : null,
      boostedmessages: Array.isArray(top.boostedmessages) ? top.boostedmessages.length : null,
    }),
  }

  await mkdir(RUNS_DIR, { recursive: true, mode: 0o700 })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outPath = path.join(RUNS_DIR, `${stamp}-mailboxnew-sanitized.json`)
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
  conceptualLog('GET mailboxnew', `type=${MAILBOX_TYPE} messages=${messages.length} unreadcount=${String(unreadBefore)}`)
  console.log(JSON.stringify(report, null, 2))
  process.exit(0)
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
