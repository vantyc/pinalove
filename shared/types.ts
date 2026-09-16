export const BASE_PATH = '/pinalove'

export const REVIEW_STATUSES = [
  'UNREVIEWED',
  'POTENTIAL',
  'SHORTLISTED',
  'DISCARDED',
  'MANUAL_REVIEW',
  'CONTACTED',
] as const
export type ReviewStatus = (typeof REVIEW_STATUSES)[number]

/** Current declared relationship status. SINGLE ≠ NEVER_MARRIED. */
export const RELATIONSHIP_STATUSES = [
  'SINGLE',
  'IN_RELATIONSHIP',
  'SEPARATED',
  'UNKNOWN',
] as const
export type RelationshipStatus = (typeof RELATIONSHIP_STATUSES)[number]

/** Marital history. Never inferred from SINGLE. */
export const MARITAL_HISTORIES = [
  'NEVER_MARRIED',
  'SEPARATED',
  'DIVORCED',
  'WIDOWED',
  'UNKNOWN',
] as const
export type MaritalHistory = (typeof MARITAL_HISTORIES)[number]

/** Tri-state facts. Unknown data must be UNKNOWN, never false/NO. */
export const TRISTATES = ['YES', 'NO', 'UNKNOWN'] as const
export type Tristate = (typeof TRISTATES)[number]

export const RELIGION_PRACTICE_LEVELS = [
  'PRACTICING',
  'NOMINAL',
  'NONE',
  'UNKNOWN',
] as const
export type ReligionPracticeLevel = (typeof RELIGION_PRACTICE_LEVELS)[number]

export const DECISIONS = ['NONE', 'INTERESTED', 'MAYBE', 'PASS', 'DEFER'] as const
export type Decision = (typeof DECISIONS)[number]

export const DECISION_SOURCES = [
  'USER',
  'RULE_ENGINE',
  'IMPORT',
  'FUTURE_AI_ANALYSIS',
] as const
export type DecisionSource = (typeof DECISION_SOURCES)[number]

export const PROFILE_SOURCES = ['IMPORT', 'MANUAL', 'SCRAPER'] as const
export type ProfileSource = (typeof PROFILE_SOURCES)[number]

export const FLAG_CODES = [
  'POSSIBLE_SCAM',
  'POSSIBLE_BOT',
  'POSSIBLE_AGENCY',
  'INCONSISTENT_PROFILE',
  'MISSING_MARITAL_STATUS',
  'MISSING_CHILDREN_INFO',
  'SEPARATED',
  'HAS_CHILDREN',
  'SUSPICIOUS_BIO',
  'NEEDS_MANUAL_REVIEW',
] as const
export type FlagCode = (typeof FLAG_CODES)[number]

export type ScoreDirection = 'plus' | 'minus'

export type EvidenceKind = 'declared' | 'inferred'

export type ScoreReason = {
  code: string
  direction: ScoreDirection
  points: number
  message: string
  /** declared = taken from profile fields; inferred = system interpretation */
  kind: EvidenceKind
}

export type Profile = {
  id: string
  externalId: string | null
  username: string
  profileUrl: string
  primaryPhotoUrl: string | null
  localPhotoPath: string | null
  age: number | null
  location: string | null
  country: string | null
  distanceKm: number | null
  heightCm: number | null
  weightKg: number | null
  relationshipStatus: RelationshipStatus
  maritalHistory: MaritalHistory
  hasChildren: Tristate
  wantsChildren: Tristate
  religion: string | null
  religionPracticeLevel: ReligionPracticeLevel
  headline: string | null
  bio: string | null
  photoVerified: boolean
  profileVerified: boolean
  source: ProfileSource
  scrapedAt: string | null
  lastSeenAt: string | null
  reviewStatus: ReviewStatus
  decision: Decision
  decisionReason: string | null
  score: number | null
  scoreReasons: ScoreReason[]
  flags: FlagCode[]
  proposedMessage: string | null
  createdAt: string
  updatedAt: string
}

export type DecisionLog = {
  id: string
  profileId: string
  previousStatus: ReviewStatus | null
  newStatus: ReviewStatus
  reason: string | null
  source: DecisionSource
  createdAt: string
}

export type ProfileFilters = {
  ageMin?: number
  ageMax?: number
  country?: string
  location?: string
  distanceMax?: number
  hasChildren?: Tristate
  relationshipStatus?: RelationshipStatus
  maritalHistory?: MaritalHistory
  religion?: string
  verified?: boolean
  scoreMin?: number
  scoreMax?: number
  status?: ReviewStatus | ReviewStatus[]
  flags?: FlagCode[]
  shortcut?: FilterShortcut
  search?: string
}

export const FILTER_SHORTCUTS = [
  'mexico',
  'cdmx',
  'no-children',
  'never-married',
  'verified',
  'needs-review',
  'high-score',
] as const
export type FilterShortcut = (typeof FILTER_SHORTCUTS)[number]

export type DashboardStats = {
  total: number
  byStatus: Record<ReviewStatus, number>
  unreviewed: number
  shortlisted: number
  discarded: number
  manualReview: number
  highScore: number
  flagged: number
}

export type ImportPayload = {
  profiles: ImportProfileInput[]
}

export type ImportProfileInput = {
  externalId?: string | null
  username: string
  profileUrl: string
  primaryPhotoUrl?: string | null
  localPhotoPath?: string | null
  age?: number | null
  location?: string | null
  country?: string | null
  distanceKm?: number | null
  heightCm?: number | null
  weightKg?: number | null
  relationshipStatus?: RelationshipStatus
  maritalHistory?: MaritalHistory
  hasChildren?: Tristate
  wantsChildren?: Tristate
  religion?: string | null
  religionPracticeLevel?: ReligionPracticeLevel
  headline?: string | null
  bio?: string | null
  photoVerified?: boolean
  profileVerified?: boolean
  source?: ProfileSource
  scrapedAt?: string | null
  lastSeenAt?: string | null
  reviewStatus?: ReviewStatus
  decision?: Decision
  decisionReason?: string | null
  proposedMessage?: string | null
  flags?: FlagCode[]
}

export type ImportResult = {
  imported: number
  updated: number
  errors: { index: number; message: string }[]
}

export type ScoringWeights = {
  agePreference: number
  proximity: number
  mexicoBonus: number
  cdmxBonus: number
  catholicBonus: number
  practicingCatholicBonus: number
  traditionalValuesBonus: number
  seriousRelationshipBonus: number
  neverMarriedBonus: number
  singleDeclaredBonus: number
  noChildrenBonus: number
  verifiedBonus: number
  childrenPenalty: number
  separatedPenalty: number
  contradictoryProfilePenalty: number
  suspiciousProfilePenalty: number
  scamSignalsPenalty: number
  incompleteCriticalInformationPenalty: number
}

export type RuleConfig = {
  version: number
  notes: string
  scoring: {
    baseScore: number
    minScore: number
    maxScore: number
    highScoreThreshold: number
    weights: ScoringWeights
    age: {
      adultMin: number
      preferredMin: number
      preferredMax: number
      acceptableMin: number
      acceptableMax: number
    }
    proximity: {
      preferredMaxKm: number
      acceptableMaxKm: number
    }
    mexicoCountryMatches: string[]
    cdmxLocationMatches: string[]
    catholicMatches: string[]
    practicingMatches: string[]
    traditionalValuesMatches: string[]
    seriousRelationshipMatches: string[]
    scamSignalMatches: string[]
    agencySignalMatches: string[]
    botSignalMatches: string[]
    suspiciousBioMatches: string[]
  }
}

export const FLAG_LABELS: Record<FlagCode, string> = {
  POSSIBLE_SCAM: 'Possible scam indicators detected',
  POSSIBLE_BOT: 'Possible bot indicators detected',
  POSSIBLE_AGENCY: 'Possible agency indicators detected',
  INCONSISTENT_PROFILE: 'Profile information looks inconsistent',
  MISSING_MARITAL_STATUS: 'Marital history not declared',
  MISSING_CHILDREN_INFO: 'Children information not declared',
  SEPARATED: 'Declared as separated',
  HAS_CHILDREN: 'Declared as having children',
  SUSPICIOUS_BIO: 'Possible suspicious phrasing in bio',
  NEEDS_MANUAL_REVIEW: 'Needs manual review',
}
