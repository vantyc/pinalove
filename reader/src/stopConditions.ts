import { ReaderSafetyError } from './allowlist.ts'

const STOP_STATUS = new Set([401, 403, 429, 407])

const STOP_BODY_PATTERNS = [
  /captcha/i,
  /recaptcha/i,
  /unusual traffic/i,
  /are you a robot/i,
  /access denied/i,
  /temporarily (?:blocked|banned)/i,
  /\bbadtoken\b/i,
  /\bchecklogin\b/i,
]

export function stopFromHttpStatus(status: number): ReaderSafetyError | null {
  if (status === 429) {
    return new ReaderSafetyError('STOP: HTTP 429 rate limit. Not retrying.')
  }
  if (status === 401 || status === 403) {
    return new ReaderSafetyError(`STOP: HTTP ${status} unexpected. Session may be invalid.`)
  }
  if (STOP_STATUS.has(status)) {
    return new ReaderSafetyError(`STOP: HTTP ${status}.`)
  }
  return null
}

export function stopFromBody(body: string): ReaderSafetyError | null {
  const snippet = body.slice(0, 4000)
  for (const pattern of STOP_BODY_PATTERNS) {
    if (pattern.test(snippet)) {
      return new ReaderSafetyError(`STOP: challenge/anti-bot/session marker matched (${pattern}).`)
    }
  }
  return null
}

export function stopFromErrorMessage(message: string): ReaderSafetyError | null {
  const statusMatch = message.match(/Network response was not ok: (\d+)/)
  if (statusMatch) {
    return stopFromHttpStatus(Number(statusMatch[1]))
  }
  if (/timeout/i.test(message) && /aborted/i.test(message)) {
    return new ReaderSafetyError('STOP: request timeout.')
  }
  return stopFromBody(message)
}
