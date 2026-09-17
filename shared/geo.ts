import { DEFAULT_RULE_CONFIG } from './defaultRules.ts'
import type { DistanceTrust, ProfileSource, RuleConfig } from './types.ts'

export const STALE_AFTER_DAYS = 90
/** listsnew values above this cannot be treated as kilometres. */
export const ANOMALOUS_DISTANCE_RAW_KM = 500

function norm(value: string | null | undefined): string {
  return (value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
}

export function countryIsMexico(country: string | null, rules: RuleConfig = DEFAULT_RULE_CONFIG): boolean {
  const c = norm(country)
  if (!c) return false
  return rules.scoring.mexicoCountryMatches.some((m) => {
    const mm = norm(m)
    return c === mm || c.includes(mm)
  })
}

export function locationIsCdmx(location: string | null, rules: RuleConfig = DEFAULT_RULE_CONFIG): boolean {
  const loc = norm(location)
  if (!loc) return false
  return rules.scoring.cdmxLocationMatches.some((m) => loc.includes(norm(m)))
}

export function isLocalMexico(input: {
  location: string | null
  country: string | null
}, rules: RuleConfig = DEFAULT_RULE_CONFIG): boolean {
  return countryIsMexico(input.country, rules) || locationIsCdmx(input.location, rules)
}

export function isStaleActivity(lastActivityAt: string | null, now = Date.now(), days = STALE_AFTER_DAYS): boolean {
  if (!lastActivityAt) return false
  const t = Date.parse(lastActivityAt)
  if (Number.isNaN(t)) return false
  return now - t >= days * 86400000
}

export type DistanceInterpretation = {
  scoringKm: number | null
  displayKm: number | null
  trust: DistanceTrust
  note: string | null
}

function isMatchSource(source: ProfileSource | null | undefined): boolean {
  return source === 'PINALOVE' || source === 'PINALOVE_MATCH'
}

/**
 * PINALOVE_BROWSE distance 13 is kilometres (SPA toDistanceTxt identity + i18n km) → TRUSTED.
 * PINALOVE_MATCH / listsnew distanceRaw ~13,000 remains UNTRUSTED and is never scored as km.
 */
export function interpretDistance(input: {
  distanceRaw: number | null
  distanceKm: number | null
  location: string | null
  country: string | null
  source?: ProfileSource | null
}): DistanceInterpretation {
  const raw = input.distanceRaw
  const stored = input.distanceKm
  const local = isLocalMexico({ location: input.location, country: input.country })

  if (input.source === 'PINALOVE_BROWSE') {
    const km =
      stored != null && stored >= 0 && stored <= ANOMALOUS_DISTANCE_RAW_KM
        ? stored
        : raw != null && raw >= 0 && raw <= ANOMALOUS_DISTANCE_RAW_KM
          ? raw
          : null
    if (km != null) {
      return {
        scoringKm: km,
        displayKm: km,
        trust: 'TRUSTED',
        note: 'browsenew distance is kilometres (toDistanceTxt identity + i18n km)',
      }
    }
    return { scoringKm: null, displayKm: null, trust: 'UNKNOWN', note: null }
  }

  if (isMatchSource(input.source)) {
    if (raw != null && raw > ANOMALOUS_DISTANCE_RAW_KM) {
      const asMetersKm = raw / 1000
      const showApprox = local && asMetersKm >= 1 && asMetersKm <= 80
      return {
        scoringKm: null,
        displayKm: showApprox ? Math.round(asMetersKm) : null,
        trust: 'UNTRUSTED',
        note: showApprox
          ? `~${Math.round(asMetersKm)} km shown from city evidence; distanceRaw=${raw} is not trusted as km`
          : `distanceRaw=${raw} is not trusted as kilometres`,
      }
    }
    return {
      scoringKm: null,
      displayKm: null,
      trust: 'UNTRUSTED',
      note:
        raw != null
          ? `distanceRaw=${raw} is stored but not scored until the unit is demonstrated`
          : 'listsnew distance unit is not demonstrated',
    }
  }

  if (stored != null && stored <= ANOMALOUS_DISTANCE_RAW_KM && stored >= 0) {
    if (raw != null && raw > ANOMALOUS_DISTANCE_RAW_KM) {
      return {
        scoringKm: null,
        displayKm: local && raw / 1000 >= 1 && raw / 1000 <= 80 ? Math.round(raw / 1000) : null,
        trust: 'UNTRUSTED',
        note: 'distanceRaw conflicts with a km-sized value; raw kept, km not scored',
      }
    }
    return {
      scoringKm: stored,
      displayKm: stored,
      trust: 'TRUSTED',
      note: null,
    }
  }

  if (raw == null) {
    return { scoringKm: null, displayKm: null, trust: 'UNKNOWN', note: null }
  }

  if (raw > ANOMALOUS_DISTANCE_RAW_KM) {
    const asMetersKm = raw / 1000
    const showApprox = local && asMetersKm >= 1 && asMetersKm <= 80
    return {
      scoringKm: null,
      displayKm: showApprox ? Math.round(asMetersKm) : null,
      trust: 'UNTRUSTED',
      note: showApprox
        ? `~${Math.round(asMetersKm)} km shown from city evidence; distanceRaw=${raw} is not trusted as km`
        : `distanceRaw=${raw} is not trusted as kilometres`,
    }
  }

  return {
    scoringKm: null,
    displayKm: null,
    trust: 'UNTRUSTED',
    note: `distanceRaw=${raw} is stored but not scored until the unit is demonstrated`,
  }
}
