import type { ActivityCategory } from './types.ts'

/** Seconds in a day. */
const DAY_MS = 86400000

/**
 * Mutually exclusive activity buckets from last activity age.
 *
 * [0, 7)     ACTIVE_7D
 * [7, 30)    ACTIVE_30D
 * [30, 90)   ACTIVE_90D
 * [90, 180)  STALE_180D
 * [180, 365) STALE_365D
 * [365, inf) STALE_OVER_365D
 *
 * Local probe eligibility uses age >= 180 days (STALE_365D and STALE_OVER_365D).
 */
export const STALE_LOCAL_PROBE_AFTER_DAYS = 180

export function parseUnixSeconds(raw: unknown): number | null {
  if (raw == null || raw === '') return null
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return null
  if (n > 1e12) return Math.floor(n / 1000)
  if (n > 1e9) return Math.floor(n)
  return null
}

export function lastActivityToIso(raw: unknown): string | null {
  const sec = parseUnixSeconds(raw)
  if (sec == null) return null
  const d = new Date(sec * 1000)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

export function activityAgeDays(lastActivityAt: string | null, now = Date.now()): number | null {
  if (!lastActivityAt) return null
  const t = Date.parse(lastActivityAt)
  if (Number.isNaN(t)) return null
  return (now - t) / DAY_MS
}

export function activityCategory(
  lastActivityAt: string | null,
  now = Date.now(),
): ActivityCategory | null {
  const days = activityAgeDays(lastActivityAt, now)
  if (days == null) return null
  if (days < 7) return 'ACTIVE_7D'
  if (days < 30) return 'ACTIVE_30D'
  if (days < 90) return 'ACTIVE_90D'
  if (days < 180) return 'STALE_180D'
  if (days < 365) return 'STALE_365D'
  return 'STALE_OVER_365D'
}

export function isStaleForLocalProbe(lastActivityAt: string | null, now = Date.now()): boolean {
  const days = activityAgeDays(lastActivityAt, now)
  return days != null && days >= STALE_LOCAL_PROBE_AFTER_DAYS
}
