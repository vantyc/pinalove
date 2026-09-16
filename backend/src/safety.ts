/**
 * Human-in-the-loop invariants for PinaLove Review.
 *
 * The system may propose a classification or a message.
 * It must never send messages, like, unmatch, block, or otherwise
 * act on PinaLove without an explicit human action outside this app.
 *
 * Forbidden in this phase (and as a default architecture):
 * - POST /send-message or any auto-send endpoint
 * - Playwright/Puppeteer against PinaLove
 * - storing PinaLove credentials
 */
export const FORBIDDEN_PATH_FRAGMENTS = [
  'send-message',
  'auto-send',
  'autosend',
  'unmatch',
  'auto-like',
] as const

export function isForbiddenApiPath(pathname: string): boolean {
  const lower = pathname.toLowerCase()
  return FORBIDDEN_PATH_FRAGMENTS.some((frag) => lower.includes(frag))
}
