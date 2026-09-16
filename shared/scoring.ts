import { DEFAULT_RULE_CONFIG } from './defaultRules.ts'
import { FLAG_LABELS } from './types.ts'
import type {
  FlagCode,
  ImportProfileInput,
  Profile,
  RuleConfig,
  ScoreReason,
} from './types.ts'

export type Evaluation = {
  score: number
  reasons: ScoreReason[]
  flags: FlagCode[]
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function norm(value: string | null | undefined): string {
  return (value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
}

function includesAny(haystack: string, needles: string[]): string | null {
  const h = norm(haystack)
  if (!h) return null
  for (const n of needles) {
    const needle = norm(n)
    if (needle && h.includes(needle)) return n
  }
  return null
}

function countryIsMexico(country: string | null, rules: RuleConfig): boolean {
  const c = norm(country)
  if (!c) return false
  return rules.scoring.mexicoCountryMatches.some((m) => {
    const mm = norm(m)
    return c === mm || c.includes(mm)
  })
}

function locationIsCdmx(location: string | null, rules: RuleConfig): boolean {
  const loc = norm(location)
  if (!loc) return false
  return rules.scoring.cdmxLocationMatches.some((m) => loc.includes(norm(m)))
}

function add(
  reasons: ScoreReason[],
  score: { value: number },
  reason: ScoreReason,
): void {
  score.value += reason.points
  reasons.push(reason)
}

function uniqueFlags(flags: FlagCode[]): FlagCode[] {
  return [...new Set(flags)]
}

/**
 * Explainable scoring. Unknown facts are never treated as NO/false.
 * Flags are review indicators, not accusations.
 */
export function evaluateProfile(
  profile: Pick<
    Profile,
    | 'age'
    | 'location'
    | 'country'
    | 'distanceKm'
    | 'relationshipStatus'
    | 'maritalHistory'
    | 'hasChildren'
    | 'religion'
    | 'religionPracticeLevel'
    | 'headline'
    | 'bio'
    | 'photoVerified'
    | 'profileVerified'
    | 'primaryPhotoUrl'
  >,
  rules: RuleConfig = DEFAULT_RULE_CONFIG,
): Evaluation {
  const w = rules.scoring.weights
  const reasons: ScoreReason[] = []
  const flags: FlagCode[] = []
  const score = { value: rules.scoring.baseScore }
  const text = `${profile.headline ?? ''}\n${profile.bio ?? ''}`

  if (profile.age == null) {
    add(reasons, score, {
      code: 'incompleteCriticalInformation',
      direction: 'minus',
      points: -Math.round(w.incompleteCriticalInformationPenalty / 2),
      message: 'Age not declared',
      kind: 'declared',
    })
  } else if (profile.age < rules.scoring.age.adultMin) {
    add(reasons, score, {
      code: 'agePreference',
      direction: 'minus',
      points: -w.agePreference - 40,
      message: 'Below adult minimum — must be excluded from contact',
      kind: 'declared',
    })
    flags.push('NEEDS_MANUAL_REVIEW')
  } else if (
    profile.age >= rules.scoring.age.preferredMin &&
    profile.age <= rules.scoring.age.preferredMax
  ) {
    add(reasons, score, {
      code: 'agePreference',
      direction: 'plus',
      points: w.agePreference,
      message: `Age ${profile.age} is inside the preferred range`,
      kind: 'declared',
    })
  } else if (
    profile.age >= rules.scoring.age.acceptableMin &&
    profile.age <= rules.scoring.age.acceptableMax
  ) {
    add(reasons, score, {
      code: 'agePreference',
      direction: 'plus',
      points: Math.round(w.agePreference / 2),
      message: `Age ${profile.age} is acceptable but outside the preferred range`,
      kind: 'declared',
    })
  } else {
    add(reasons, score, {
      code: 'agePreference',
      direction: 'minus',
      points: -Math.round(w.agePreference / 2),
      message: `Age ${profile.age} is outside the configured range`,
      kind: 'declared',
    })
  }

  if (profile.distanceKm != null) {
    if (profile.distanceKm <= rules.scoring.proximity.preferredMaxKm) {
      add(reasons, score, {
        code: 'proximity',
        direction: 'plus',
        points: w.proximity,
        message: `Distance ${Math.round(profile.distanceKm)} km is nearby`,
        kind: 'declared',
      })
    } else if (profile.distanceKm <= rules.scoring.proximity.acceptableMaxKm) {
      add(reasons, score, {
        code: 'proximity',
        direction: 'plus',
        points: Math.round(w.proximity / 3),
        message: `Distance ${Math.round(profile.distanceKm)} km is moderate`,
        kind: 'declared',
      })
    } else {
      add(reasons, score, {
        code: 'proximity',
        direction: 'minus',
        points: -Math.round(w.proximity / 2),
        message: `Distance ${Math.round(profile.distanceKm)} km is far from the preferred area`,
        kind: 'declared',
      })
    }
  }

  if (countryIsMexico(profile.country, rules)) {
    add(reasons, score, {
      code: 'mexicoBonus',
      direction: 'plus',
      points: w.mexicoBonus,
      message: `Country declared as ${profile.country}`,
      kind: 'declared',
    })
  }

  if (locationIsCdmx(profile.location, rules)) {
    add(reasons, score, {
      code: 'cdmxBonus',
      direction: 'plus',
      points: w.cdmxBonus,
      message: `Location looks like CDMX / metro: ${profile.location}`,
      kind: 'inferred',
    })
  }

  if (profile.relationshipStatus === 'SINGLE') {
    add(reasons, score, {
      code: 'singleDeclaredBonus',
      direction: 'plus',
      points: w.singleDeclaredBonus,
      message: 'Relationship status declared as single',
      kind: 'declared',
    })
  } else if (profile.relationshipStatus === 'SEPARATED') {
    add(reasons, score, {
      code: 'separated',
      direction: 'minus',
      points: -w.separatedPenalty,
      message: 'Relationship status declared as separated',
      kind: 'declared',
    })
    flags.push('SEPARATED')
  }

  if (profile.maritalHistory === 'NEVER_MARRIED') {
    add(reasons, score, {
      code: 'neverMarried',
      direction: 'plus',
      points: w.neverMarriedBonus,
      message: 'Marital history declared as never married',
      kind: 'declared',
    })
  } else if (profile.maritalHistory === 'SEPARATED') {
    add(reasons, score, {
      code: 'separated',
      direction: 'minus',
      points: -w.separatedPenalty,
      message: 'Marital history declared as separated',
      kind: 'declared',
    })
    flags.push('SEPARATED')
  } else if (profile.maritalHistory === 'UNKNOWN') {
    flags.push('MISSING_MARITAL_STATUS')
    add(reasons, score, {
      code: 'incompleteCriticalInformation',
      direction: 'minus',
      points: -w.incompleteCriticalInformationPenalty,
      message: 'Marital history not declared',
      kind: 'declared',
    })
  }

  if (
    profile.relationshipStatus === 'SINGLE' &&
    profile.maritalHistory === 'UNKNOWN'
  ) {
    add(reasons, score, {
      code: 'incompleteCriticalInformation',
      direction: 'minus',
      points: 0,
      message:
        'Declared single, but never-married was not assumed (marital history unknown)',
      kind: 'inferred',
    })
  }

  if (
    profile.relationshipStatus === 'SINGLE' &&
    (profile.maritalHistory === 'DIVORCED' ||
      profile.maritalHistory === 'SEPARATED' ||
      profile.maritalHistory === 'WIDOWED')
  ) {
    add(reasons, score, {
      code: 'contradictoryProfile',
      direction: 'minus',
      points: 0,
      message:
        'Single and a prior marriage/separation can both be true; they are tracked separately',
      kind: 'inferred',
    })
  }

  if (profile.hasChildren === 'NO') {
    add(reasons, score, {
      code: 'noChildren',
      direction: 'plus',
      points: w.noChildrenBonus,
      message: 'Declared no children',
      kind: 'declared',
    })
  } else if (profile.hasChildren === 'YES') {
    add(reasons, score, {
      code: 'children',
      direction: 'minus',
      points: -w.childrenPenalty,
      message: 'Declared as having children',
      kind: 'declared',
    })
    flags.push('HAS_CHILDREN')
  } else {
    flags.push('MISSING_CHILDREN_INFO')
    add(reasons, score, {
      code: 'incompleteCriticalInformation',
      direction: 'minus',
      points: -w.incompleteCriticalInformationPenalty,
      message: 'Children information not declared',
      kind: 'declared',
    })
  }

  const catholicHit = includesAny(profile.religion ?? '', rules.scoring.catholicMatches)
  if (catholicHit) {
    add(reasons, score, {
      code: 'catholicBonus',
      direction: 'plus',
      points: w.catholicBonus,
      message: `Religion declared as ${profile.religion}`,
      kind: 'declared',
    })
  }

  const practicingFromLevel = profile.religionPracticeLevel === 'PRACTICING'
  const practicingFromText = includesAny(text, rules.scoring.practicingMatches)
  if (catholicHit && (practicingFromLevel || practicingFromText)) {
    add(reasons, score, {
      code: 'practicingCatholicBonus',
      direction: 'plus',
      points: w.practicingCatholicBonus,
      message: practicingFromLevel
        ? 'Declared as practicing'
        : 'Bio/headline mentions practicing faith (inferred)',
      kind: practicingFromLevel ? 'declared' : 'inferred',
    })
  }

  const traditional = includesAny(text, rules.scoring.traditionalValuesMatches)
  if (traditional) {
    add(reasons, score, {
      code: 'traditionalValuesBonus',
      direction: 'plus',
      points: w.traditionalValuesBonus,
      message: `Possible traditional/family-values phrasing: “${traditional}”`,
      kind: 'inferred',
    })
  }

  const serious = includesAny(text, rules.scoring.seriousRelationshipMatches)
  if (serious) {
    add(reasons, score, {
      code: 'seriousRelationshipBonus',
      direction: 'plus',
      points: w.seriousRelationshipBonus,
      message: `Possible serious-relationship phrasing: “${serious}”`,
      kind: 'inferred',
    })
  }

  if (profile.photoVerified || profile.profileVerified) {
    add(reasons, score, {
      code: 'verifiedBonus',
      direction: 'plus',
      points: w.verifiedBonus,
      message: profile.profileVerified
        ? 'Profile marked verified'
        : 'Photos marked verified',
      kind: 'declared',
    })
  }

  if (!profile.primaryPhotoUrl) {
    flags.push('NEEDS_MANUAL_REVIEW')
    add(reasons, score, {
      code: 'incompleteCriticalInformation',
      direction: 'minus',
      points: -Math.round(w.incompleteCriticalInformationPenalty / 2),
      message: 'No primary photo available for authenticity review',
      kind: 'declared',
    })
  }

  const scam = includesAny(text, rules.scoring.scamSignalMatches)
  if (scam) {
    flags.push('POSSIBLE_SCAM')
    flags.push('NEEDS_MANUAL_REVIEW')
    add(reasons, score, {
      code: 'scamSignals',
      direction: 'minus',
      points: -w.scamSignalsPenalty,
      message: `Possible scam indicators detected (phrasing: “${scam}”)`,
      kind: 'inferred',
    })
  }

  const agency = includesAny(text, rules.scoring.agencySignalMatches)
  if (agency) {
    flags.push('POSSIBLE_AGENCY')
    flags.push('NEEDS_MANUAL_REVIEW')
    add(reasons, score, {
      code: 'suspiciousProfile',
      direction: 'minus',
      points: -w.suspiciousProfilePenalty,
      message: `Possible agency indicators detected (phrasing: “${agency}”)`,
      kind: 'inferred',
    })
  }

  const bot = includesAny(text, rules.scoring.botSignalMatches)
  if (bot) {
    flags.push('POSSIBLE_BOT')
    add(reasons, score, {
      code: 'suspiciousProfile',
      direction: 'minus',
      points: -Math.round(w.suspiciousProfilePenalty / 2),
      message: `Possible bot indicators detected (phrasing: “${bot}”)`,
      kind: 'inferred',
    })
  }

  const suspicious = includesAny(text, rules.scoring.suspiciousBioMatches)
  if (suspicious) {
    flags.push('SUSPICIOUS_BIO')
    flags.push('NEEDS_MANUAL_REVIEW')
    add(reasons, score, {
      code: 'suspiciousProfile',
      direction: 'minus',
      points: -w.suspiciousProfilePenalty,
      message: `Possible suspicious phrasing in bio: “${suspicious}”`,
      kind: 'inferred',
    })
  }

  if (
    profile.relationshipStatus === 'IN_RELATIONSHIP' &&
    profile.maritalHistory === 'NEVER_MARRIED'
  ) {
    flags.push('INCONSISTENT_PROFILE')
    add(reasons, score, {
      code: 'contradictoryProfile',
      direction: 'minus',
      points: -w.contradictoryProfilePenalty,
      message: 'In-relationship together with never-married may need a closer look',
      kind: 'inferred',
    })
  }

  const missingCritical =
    profile.maritalHistory === 'UNKNOWN' && profile.hasChildren === 'UNKNOWN'
  if (missingCritical) {
    flags.push('NEEDS_MANUAL_REVIEW')
  }

  return {
    score: clamp(
      Math.round(score.value),
      rules.scoring.minScore,
      rules.scoring.maxScore,
    ),
    reasons,
    flags: uniqueFlags(flags),
  }
}

export function evaluationFromImport(
  input: ImportProfileInput,
  rules: RuleConfig,
): Evaluation {
  const auto = evaluateProfile(
    {
      age: input.age ?? null,
      location: input.location ?? null,
      country: input.country ?? null,
      distanceKm: input.distanceKm ?? null,
      relationshipStatus: input.relationshipStatus ?? 'UNKNOWN',
      maritalHistory: input.maritalHistory ?? 'UNKNOWN',
      hasChildren: input.hasChildren ?? 'UNKNOWN',
      religion: input.religion ?? null,
      religionPracticeLevel: input.religionPracticeLevel ?? 'UNKNOWN',
      headline: input.headline ?? null,
      bio: input.bio ?? null,
      photoVerified: input.photoVerified ?? false,
      profileVerified: input.profileVerified ?? false,
      primaryPhotoUrl: input.primaryPhotoUrl ?? null,
    },
    rules,
  )
  const extra = input.flags ?? []
  return {
    ...auto,
    flags: uniqueFlags([...auto.flags, ...extra]),
  }
}

export function formatScoreSummary(reasons: ScoreReason[]): string {
  return reasons
    .filter((r) => r.points !== 0)
    .map((r) => {
      const sign = r.direction === 'plus' ? '+' : '-'
      return `${sign} ${r.message}`
    })
    .join('\n')
}

export function flagLabel(code: FlagCode): string {
  return FLAG_LABELS[code]
}
