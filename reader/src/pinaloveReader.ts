import type { Page } from 'playwright'
import { assertAllowedReadAction, FORBIDDEN_ACTIONS, ReaderSafetyError } from './allowlist.ts'
import { assertMaterializeLimit, MAX_PROFILES, takeMaxProfiles } from './maxProfiles.ts'
import { collectFieldNames, normalizeListsNewItem } from './normalizer.ts'
import type { ListsNewNormalized } from './normalizer.ts'
import { PINALOVE_APP, PINALOVE_HOME, PINALOVE_ORIGIN } from './paths.ts'
import type { ListsNewPayload, RawSnapshot } from './rawTypes.ts'
import { conceptualLog, sanitizeUrlForLog } from './sanitize.ts'
import { stopFromBody, stopFromErrorMessage, stopFromHttpStatus } from './stopConditions.ts'

export type MaterializedMatch = {
  raw: RawSnapshot
  presentFields: string[]
  normalized: ListsNewNormalized
}

export type MatchesRead = {
  action: 'listsnew'
  box: 'matches'
  foundrows: number | null
  resultCount: number
  materializedCount: number
  maxProfiles: number
  fieldUnion: string[]
  via: 'apiRequest' | 'inPageCache' | 'fetch'
  matches: MaterializedMatch[]
}

export type GetMatchesOptions = {
  /** Use only in-page apiRequest. Do not read locache or invent tokens. */
  requireApiRequest?: boolean
}

type InPageApiResult =
  | { ok: true; status: number; body: string; via: 'apiRequest' | 'inPageCache' | 'fetch' }
  | { ok: false; status: number | null; error: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function attachNetworkGuards(
  page: Page,
  extraAllowed: ReadonlySet<string> = new Set(),
): {
  detach: () => void
  lastStop: () => ReaderSafetyError | null
} {
  let lastStop: ReaderSafetyError | null = null
  const onResponse = (response: { url: () => string; status: () => number }): void => {
    const url = response.url()
    if (!url.includes('/nt/app.php')) return
    const status = response.status()
    let action = '(none)'
    try {
      action = new URL(url).searchParams.get('i') ?? '(none)'
    } catch {
      action = '(unparseable)'
    }
    if (action !== '(none)' && action !== '(unparseable)') {
      const forbidden = (FORBIDDEN_ACTIONS as readonly string[]).includes(action)
      const unexpectedProfileNew = action === 'profilenew' && !extraAllowed.has('profilenew')
      if (forbidden || unexpectedProfileNew) {
        lastStop = new ReaderSafetyError(`STOP: observed forbidden action ${action} -> ${status}`)
        conceptualLog('STOP', `observed forbidden action ${action} -> ${status}`)
        return
      }
    }
    conceptualLog('GET', `${sanitizeUrlForLog(url)} -> ${status}`)
    const stop = stopFromHttpStatus(status)
    if (stop) lastStop = stop
  }
  page.on('response', onResponse)
  return {
    detach: () => page.off('response', onResponse),
    lastStop: () => lastStop,
  }
}

function materialize(parsed: ListsNewPayload, extractedAt: string): MatchesRead {
  const results = Array.isArray(parsed.results) ? parsed.results : []
  const foundrows =
    typeof parsed.foundrows === 'number' && Number.isFinite(parsed.foundrows)
      ? parsed.foundrows
      : null
  const slice = takeMaxProfiles(results, MAX_PROFILES)
  assertMaterializeLimit(slice.length, MAX_PROFILES)

  const matches: MaterializedMatch[] = []
  const union = new Set<string>()
  for (const entry of slice) {
    if (!isRecord(entry)) continue
    const presentFields = collectFieldNames(entry)
    presentFields.forEach((k) => union.add(k))
    const username = typeof entry.name === 'string' ? entry.name : null
    matches.push({
      raw: {
        sourceUrl: username ? `${PINALOVE_ORIGIN}/${username}` : null,
        externalId: entry.id != null ? String(entry.id) : null,
        extractedAt,
        sourceAction: 'listsnew',
        original: entry,
      },
      presentFields,
      normalized: normalizeListsNewItem(entry),
    })
  }

  return {
    action: 'listsnew',
    box: 'matches',
    foundrows,
    resultCount: results.length,
    materializedCount: matches.length,
    maxProfiles: MAX_PROFILES,
    fieldUnion: [...union].toSorted(),
    via: 'apiRequest',
    matches,
  }
}

export type ProfileNewRead = {
  action: 'profilenew'
  username: string
  httpStatus: number
  via: 'apiRequest'
  topLevelKeys: string[]
  profileObjectKeys: string[]
  /** Secret keys stripped. Not persisted to SQLite. */
  profile: Record<string, unknown> | null
  topLevel: Record<string, unknown>
}

const PROFILE_USERNAME_RE = /^[A-Za-z0-9_]+$/

export class PinaLoveReader {
  constructor(private readonly page: Page) {}

  async getMatches(options: GetMatchesOptions = {}): Promise<MatchesRead> {
    assertAllowedReadAction('listsnew')
    await this.assertAuthenticatedShell()
    const guards = attachNetworkGuards(this.page)
    try {
      const requireApiRequest = options.requireApiRequest === true
      const inPage = (await this.page.evaluate(
        `(async (requireApiRequest) => {
          var action = 'listsnew';
          var w = window;
          if (typeof w.apiRequest !== 'function') {
            return { ok: false, status: null, error: 'apiRequest missing after SPA load' };
          }
          return await new Promise(function (resolve) {
            try {
              w.apiRequest(action, {
                box: 'matches',
                listsorder: 'event',
                filternew: 0,
                filternear: 0,
                filterverified: 0,
                filtermessaged: 0
              }, {
                parseResponse: false,
                silent: true,
                success: function (body) {
                  resolve({ ok: true, status: 200, via: 'apiRequest', body: String(body == null ? '' : body) });
                },
                error: function (_xhr, _kind, message) {
                  resolve({ ok: false, status: null, error: String(message == null ? 'apiRequest error' : message) });
                }
              });
            } catch (err) {
              resolve({ ok: false, status: null, error: String(err && err.message ? err.message : err) });
            }
          });
        })(${requireApiRequest ? 'true' : 'false'})`,
      )) as InPageApiResult

      const networkStop = guards.lastStop()
      if (networkStop) throw networkStop

      if (!inPage.ok && inPage.status != null) {
        const httpStop = stopFromHttpStatus(inPage.status)
        if (httpStop) throw httpStop
      }

      if (!inPage.ok) {
        const stop =
          stopFromErrorMessage(inPage.error) ??
          new ReaderSafetyError(`STOP: listsnew failed (${inPage.error})`)
        throw stop
      }

      const bodyStop = stopFromBody(inPage.body)
      if (bodyStop) throw bodyStop
      if (inPage.body.trim().startsWith('<')) {
        throw new ReaderSafetyError('STOP: listsnew returned HTML, not JSON.')
      }

      let parsed: ListsNewPayload
      try {
        parsed = JSON.parse(inPage.body) as ListsNewPayload
      } catch {
        throw new ReaderSafetyError('STOP: listsnew did not return JSON.')
      }

      const extractedAt = new Date().toISOString()
      const read = materialize(parsed, extractedAt)
      read.via = inPage.via
      conceptualLog(
        'GET listsnew',
        `box=matches -> ${read.resultCount} results (${inPage.via})`,
      )
      return read
    } finally {
      guards.detach()
    }
  }

  /**
   * ONE profilenew for a username already known from listsnew.
   * Does not open the profile page. No retry.
   *
   * profilenew is an approved read-only diagnostic/enrichment capability,
   * not a bulk ingestion strategy.
   */
  async getProfileNew(username: string): Promise<ProfileNewRead> {
    assertAllowedReadAction('profilenew')
    if (!PROFILE_USERNAME_RE.test(username)) {
      throw new ReaderSafetyError('STOP: profilenew username failed the conservative allow pattern.')
    }
    await this.assertAuthenticatedShell()
    const guards = attachNetworkGuards(this.page, new Set(['profilenew']))
    try {
      const inPage = (await this.page.evaluate(
        `(async (username) => {
          var w = window;
          if (typeof w.apiRequest !== 'function') {
            return { ok: false, status: null, error: 'apiRequest missing after SPA load' };
          }
          var payload = { newapp: 1, up: username };
          if (typeof w.myAppVersion !== 'undefined') payload.vx = w.myAppVersion;
          if (w.supportsAv1Video) payload.av = 1;
          return await new Promise(function (resolve) {
            try {
              w.apiRequest('profilenew', payload, {
                parseResponse: false,
                silent: true,
                success: function (body) {
                  resolve({ ok: true, status: 200, via: 'apiRequest', body: String(body == null ? '' : body) });
                },
                error: function (_xhr, _kind, message) {
                  resolve({ ok: false, status: null, error: String(message == null ? 'apiRequest error' : message) });
                }
              });
            } catch (err) {
              resolve({ ok: false, status: null, error: String(err && err.message ? err.message : err) });
            }
          });
        })(${JSON.stringify(username)})`,
      )) as InPageApiResult

      const networkStop = guards.lastStop()
      if (networkStop) throw networkStop

      if (!inPage.ok && inPage.status != null) {
        const httpStop = stopFromHttpStatus(inPage.status)
        if (httpStop) throw httpStop
      }
      if (!inPage.ok) {
        const stop =
          stopFromErrorMessage(inPage.error) ??
          new ReaderSafetyError(`STOP: profilenew failed (${inPage.error})`)
        throw stop
      }

      const bodyStop = stopFromBody(inPage.body)
      if (bodyStop) throw bodyStop
      if (inPage.body.trim().startsWith('<')) {
        throw new ReaderSafetyError('STOP: profilenew returned HTML, not JSON.')
      }

      let parsed: unknown
      try {
        parsed = JSON.parse(inPage.body)
      } catch {
        throw new ReaderSafetyError('STOP: profilenew did not return JSON.')
      }

      const topLevel = isRecord(parsed) ? parsed : { _nonObject: parsed }
      const topLevelKeys = Object.keys(topLevel).toSorted()
      const keyed = isRecord(parsed) && isRecord(parsed[username]) ? parsed[username] : null
      const profile = keyed ?? (isRecord(parsed) ? parsed : null)
      const profileObjectKeys = profile ? Object.keys(profile).toSorted() : []

      conceptualLog('GET profilenew', `up=${username} -> ${inPage.status}`)
      return {
        action: 'profilenew',
        username,
        httpStatus: inPage.status,
        via: 'apiRequest',
        topLevelKeys,
        profileObjectKeys,
        profile,
        topLevel,
      }
    } finally {
      guards.detach()
    }
  }

  private async assertAuthenticatedShell(): Promise<void> {
    if (!this.page.url().includes('pinalove.com')) {
      await this.page.goto(PINALOVE_HOME, { waitUntil: 'domcontentloaded' })
    }

    const state = await this.page.evaluate(() => {
      const w = window as unknown as {
        apiRequest?: unknown
        myData?: { loggedin?: unknown }
      }
      const body = document.body?.innerText?.slice(0, 2500) ?? ''
      return {
        path: location.pathname,
        hasApi: typeof w.apiRequest === 'function',
        loggedinFlag: Boolean(w.myData?.loggedin),
        hasListsNav: /Lists/i.test(body),
        hasMailNav: /Mail/i.test(body),
        hasGoogleSignIn: /Sign in with Google/i.test(body),
        insecureBrowser: /may not be secure/i.test(body),
        captcha: /captcha|unusual traffic|are you a robot/i.test(body),
        body,
        hrefHost: location.host,
      }
    })

    if (state.insecureBrowser) {
      throw new ReaderSafetyError('STOP: Google/browser-not-secure challenge is showing.')
    }
    if (state.captcha) {
      throw new ReaderSafetyError('STOP: CAPTCHA/challenge detected.')
    }
    const bodyStop = stopFromBody(state.body)
    if (bodyStop) throw bodyStop

    const visuallyLoggedIn =
      state.loggedinFlag ||
      (state.hasListsNav && state.hasMailNav && !state.hasGoogleSignIn)
    if (!visuallyLoggedIn || state.hasGoogleSignIn) {
      throw new ReaderSafetyError('STOP: PinaLove session is not authenticated in this Chrome.')
    }
  }

  async assertSpaReady(): Promise<{ path: string; hash: string; hasApi: boolean; loggedin: boolean }> {
    const state = await this.page.evaluate(() => {
      const w = window as unknown as {
        apiRequest?: unknown
        myData?: { loggedin?: unknown }
      }
      const body = document.body?.innerText?.slice(0, 2500) ?? ''
      return {
        path: location.pathname,
        hash: location.hash,
        title: document.title,
        hasApi: typeof w.apiRequest === 'function',
        loggedin: Boolean(w.myData?.loggedin),
        hasGoogleSignIn: /Sign in with Google/i.test(body),
        insecureBrowser: /may not be secure/i.test(body),
        captcha: /captcha|unusual traffic|are you a robot/i.test(body),
        offline: /No Internet Connection/i.test(body),
        body,
      }
    })
    if (state.insecureBrowser) {
      throw new ReaderSafetyError('STOP: Google/browser-not-secure challenge is showing.')
    }
    if (state.captcha) {
      throw new ReaderSafetyError('STOP: CAPTCHA/challenge detected.')
    }
    if (state.hasGoogleSignIn) {
      throw new ReaderSafetyError('STOP: /et/ is showing Google login.')
    }
    if (state.offline) {
      throw new ReaderSafetyError('STOP: /et/ is showing the offline/unauthenticated shell.')
    }
    const bodyStop = stopFromBody(state.body)
    if (bodyStop) throw bodyStop
    if (!state.hasApi || !state.loggedin) {
      throw new ReaderSafetyError('STOP: SPA apiRequest/session flag not ready after /et/ load.')
    }
    return {
      path: state.path,
      hash: state.hash,
      hasApi: state.hasApi,
      loggedin: state.loggedin,
    }
  }

  async openSpaAndWait(): Promise<void> {
    await this.page.goto(PINALOVE_APP, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await this.page.waitForFunction(
      () => {
        const w = window as unknown as { apiRequest?: unknown; myData?: { loggedin?: unknown } }
        const body = document.body?.innerText ?? ''
        if (/may not be secure|Sign in with Google|captcha|unusual traffic/i.test(body)) {
          return true
        }
        return typeof w.apiRequest === 'function' && Boolean(w.myData?.loggedin)
      },
      { timeout: 25000 },
    )
  }
}
