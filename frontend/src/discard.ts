import type { Profile } from '../../shared/types.ts'

export const DISCARD_CONFIRM = 'Discard this profile from your review queue?'
export const DISCARD_SENT_WARNING =
  'This profile was already marked as sent on PinaLove. Discard it from the review queue anyway? This does not unsend or change anything on PinaLove.'
export const DISCARD_REPLIED_WARNING =
  'This profile already has a recorded reply. Discard it from the review queue anyway? This does not change anything on PinaLove.'

export function confirmDiscard(profile: Profile): boolean {
  if (profile.contactStatus === 'REPLIED') return window.confirm(DISCARD_REPLIED_WARNING)
  if (profile.manuallySentAt) return window.confirm(DISCARD_SENT_WARNING)
  return window.confirm(DISCARD_CONFIRM)
}
