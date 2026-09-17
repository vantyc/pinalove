import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
import { assertAllowedReadAction, FORBIDDEN_ACTIONS, ReaderSafetyError } from './allowlist.ts'
import { normalizeMailboxItem, type MailboxIngestPayload } from '../../shared/inbox.ts'
import { BROWSER_META_PATH, RUNS_DIR } from './paths.ts'
import type { BrowserMeta } from './paths.ts'
import { conceptualLog } from './sanitize.ts'
import { stopFromBody, stopFromErrorMessage, stopFromHttpStatus } from './stopConditions.ts'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
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
    hasApi: typeof apiRequest === 'function',
    loggedin: Boolean(window.myData && window.myData.loggedin),
    google: /Sign in with Google/i.test(document.body.innerText || ''),
    captcha: /captcha|unusual traffic|are you a robot/i.test(document.body.innerText || ''),
    insecure: /may not be secure/i.test(document.body.innerText || '')
  })`)) as {
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
      return await new Promise(function (resolve) {
        try {
          apiRequest('mailboxnew', { type: 'newunread', pagenumber: 1 }, {
            parseResponse: false,
            silent: true,
            success: function (body) {
              resolve({ ok: true, status: 200, body: String(body == null ? '' : body) });
            },
            error: function (_xhr, _kind, message) {
              resolve({ ok: false, status: null, error: String(message == null ? 'apiRequest error' : message) });
            }
          });
        } catch (err) {
          resolve({ ok: false, status: null, error: String(err && err.message ? err.message : err) });
        }
      });
    })()`,
  )) as { ok: boolean; status: number | null; body?: string; error?: string }

  page.off('response', onResponse)

  if (!inPage.ok || inPage.body == null) {
    throw stopFromErrorMessage(inPage.error ?? 'mailboxnew failed') ?? new ReaderSafetyError('STOP: mailboxnew failed')
  }
  const httpStop = stopFromHttpStatus(inPage.status ?? 200)
  if (httpStop) throw httpStop
  const bodyStop = stopFromBody(inPage.body)
  if (bodyStop) throw bodyStop
  if (inPage.body.trim() === 'upgrademe') throw new Error('STOP: mailboxnew returned upgrademe.')
  if (inPage.body.trim().startsWith('<')) throw new Error('STOP: mailboxnew returned HTML.')

  let parsed: unknown
  try {
    parsed = JSON.parse(inPage.body)
  } catch {
    throw new Error('STOP: mailboxnew did not return JSON.')
  }
  const top = isRecord(parsed) ? parsed : {}
  const rawMessages = Array.isArray(top.messages) ? top.messages.filter(isRecord) : []
  const messages = rawMessages.map(normalizeMailboxItem).filter((row) => row != null)
  const mailboxCalls = observed.filter((e) => e.action === 'mailboxnew')
  const forbidden = observed.filter(
    (e) => e.action != null && (FORBIDDEN_ACTIONS as readonly string[]).includes(e.action),
  )
  if (forbidden.length > 0) {
    throw new ReaderSafetyError(`STOP: forbidden action during ingest: ${forbidden.map((e) => e.action).join(',')}`)
  }
  if (mailboxCalls.length !== 1) {
    throw new Error(`STOP: expected exactly 1 mailboxnew, observed ${mailboxCalls.length}`)
  }

  const payload: MailboxIngestPayload = {
    extractedAt: new Date().toISOString(),
    action: 'mailboxnew',
    type: 'newunread',
    pagenumber: 1,
    unreadcount: typeof top.unreadcount === 'number' ? top.unreadcount : null,
    messages,
  }

  await mkdir(RUNS_DIR, { recursive: true, mode: 0o700 })
  const outPath = path.join(RUNS_DIR, 'inbox-unread-ingest.json')
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 })
  conceptualLog(
    'GET mailboxnew',
    `type=newunread messages=${messages.length} requests=${mailboxCalls.length}`,
  )
  console.log(
    JSON.stringify(
      {
        outPath,
        pinaloveApiRequestsThisScript: mailboxCalls.length,
        messageCount: messages.length,
        usernames: messages.map((m) => m.username),
        observed: mailboxCalls,
      },
      null,
      2,
    ),
  )
  process.exit(0)
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
