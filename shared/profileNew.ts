import type { MaritalHistory } from './types.ts'

/**
 * listsnew vs profilenew (FASE 2A, one MATCH diagnostic, 2026-09-16).
 *
 * profilenew is an approved read-only diagnostic/enrichment capability,
 * not a bulk ingestion strategy.
 *
 * profilenew does not resolve:
 * - maritalHistory / never married
 * - religion
 * - occupation
 * children/education codes may remain UNKNOWN.
 * It can add gender (raw "female" on the probe) and lookingfor/minage/maxage.
 *
 * Do not run profilenew in a loop over matches.
 */
export const PROFILENEW_BULK_STRATEGY = 'not-used' as const

const ONLINE_STATUS = new Set(['active', 'online', 'offline', 'idle'])

/**
 * profilenew `status` on the FASE 2A diagnostic was "Active".
 * That is presence/activity, not marital history.
 */
export function maritalFromProfileNewStatus(raw: unknown): MaritalHistory {
  if (raw == null || raw === '') return 'UNKNOWN'
  const text = String(raw).trim()
  if (ONLINE_STATUS.has(text.toLowerCase())) return 'UNKNOWN'
  if (/never\s+married/i.test(text)) return 'NEVER_MARRIED'
  return 'UNKNOWN'
}

export const LISTSNEW_VS_PROFILENEW = {
  maritalHistory: { listsnew: 'ABSENT', profilenew: 'ABSENT (status=Active is not marital)' },
  religion: { listsnew: 'ABSENT', profilenew: 'ABSENT' },
  occupation: { listsnew: 'ABSENT', profilenew: 'ABSENT' },
  gender: { listsnew: 'ABSENT', profilenew: 'PRESENT (raw female on the diagnostic probe)' },
  haschildren: { listsnew: 'PRESENT (0=UNKNOWN, 2=NO)', profilenew: 'same codes; 0 stays UNKNOWN' },
} as const
