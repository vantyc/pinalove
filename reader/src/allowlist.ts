/**
 * Hard allowlist of PinaLove API actions this Reader may invoke.
 * Anything not listed here is a stop condition, including every known mutator.
 * profilenew is an approved read-only diagnostic/enrichment capability,
 * not a bulk ingestion strategy. Keep it allowlisted; do not loop it.
 * browsenew is an approved read-only diagnostic/enrichment capability,
 * not a bulk ingestion strategy. Keep it allowlisted; do not loop it.
 */
export const ALLOWED_READ_ACTIONS = ['listsnew', 'profilenew', 'browsenew'] as const
export type AllowedReadAction = (typeof ALLOWED_READ_ACTIONS)[number]

export const FORBIDDEN_ACTIONS = [
  'sendmessage',
  'sendfeedmessage',
  'sendreaction',
  'unsendmessage',
  'playlikeuser',
  'showinterest',
  'likefeedpost',
  'blockuser',
  'hideuser',
  'playhideuser',
  'hidefeeduser',
  'reportphoto',
  'reportmessage',
  'reportfeedpost',
  'editmyprofilenew',
  'updatemyprofile',
  'updategeonew',
  'updatenote',
  'revealvisit',
  'revealphoto',
  'revealcontact',
  'markasread',
  'markasunread',
  'markasdeleted',
  'listmarkhide',
  'logoutsession',
  'boostbuy',
  'booststart',
  'boostpause',
] as const
export type ForbiddenAction = (typeof FORBIDDEN_ACTIONS)[number]

export function isAllowedReadAction(action: string): action is AllowedReadAction {
  return (ALLOWED_READ_ACTIONS as readonly string[]).includes(action)
}

export function assertAllowedReadAction(action: string): asserts action is AllowedReadAction {
  if (isAllowedReadAction(action)) return
  throw new ReaderSafetyError(
    `Blocked PinaLove action "${action}". Reader allowlist is read-only (listsnew, profilenew, browsenew).`,
  )
}

export function assertNotForbiddenAction(action: string): void {
  if ((FORBIDDEN_ACTIONS as readonly string[]).includes(action)) {
    throw new ReaderSafetyError(`Refusing forbidden PinaLove action "${action}".`)
  }
}

export class ReaderSafetyError extends Error {
  readonly stop = true
  constructor(message: string) {
    super(message)
    this.name = 'ReaderSafetyError'
  }
}
