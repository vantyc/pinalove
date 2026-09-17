export const BASE_PATH = '/pinalove'

export const REVIEW_STATUSES = [
  'UNREVIEWED',
  'PRESELECTED',
  'NEEDS_DETAIL',
  'POTENTIAL',
  'SHORTLISTED',
  'DISCARDED',
  'MANUAL_REVIEW',
  'CONTACTED',
] as const
export type ReviewStatus = (typeof REVIEW_STATUSES)[number]

/** Contact workflow is separate from classification. */
export const CONTACT_STATUSES = [
  'NONE',
  'STALE_LOCAL_PROBE',
  'READY_TO_CONTACT',
  'PROBE_SENT',
  'REPLIED',
  'NO_RESPONSE',
] as const
export type ContactStatus = (typeof CONTACT_STATUSES)[number]

export const DISTANCE_TRUSTS = ['TRUSTED', 'UNTRUSTED', 'UNKNOWN'] as const
export type DistanceTrust = (typeof DISTANCE_TRUSTS)[number]

export const LOGISTIC_PRIORITIES = ['HIGH_LOCAL', 'LOCAL', 'NONE'] as const
export type LogisticPriority = (typeof LOGISTIC_PRIORITIES)[number]

/**
 * Account-activity buckets. Independent from reviewStatus.
 * Not a quality or compatibility score.
 */
export const ACTIVITY_CATEGORIES = [
  'ACTIVE_7D',
  'ACTIVE_30D',
  'ACTIVE_90D',
  'STALE_180D',
  'STALE_365D',
  'STALE_OVER_365D',
] as const
export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number]

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

export const PROFILE_SOURCES = [
  'IMPORT',
  'MANUAL',
  'SCRAPER',
  /** Legacy listsnew matches ingest. Prefer PINALOVE_MATCH for new rows. */
  'PINALOVE',
  'PINALOVE_MATCH',
  'PINALOVE_BROWSE',
  'MOCK',
] as const
export type ProfileSource = (typeof PROFILE_SOURCES)[number]

export type FieldFact = {
  rawValue: unknown
  normalizedValue: unknown
  source?: FactSource
  evidence?: string | null
  confidence?: FactConfidence
}

export type FieldFactMap = Record<string, FieldFact>

export const FACT_SOURCES = [
  'LISTSNEW_STRUCTURED_FIELD',
  'BROWSENEW_STRUCTURED_FIELD',
  'HEADLINE',
  'DESCRIPTION',
  'CONFLICT',
] as const
export type FactSource = (typeof FACT_SOURCES)[number]

export const FACT_CONFIDENCES = ['STRUCTURED', 'EXPLICIT', 'NONE'] as const
export type FactConfidence = (typeof FACT_CONFIDENCES)[number]

export type ProvenanceRecord = {
  field: string
  value: unknown
  source: FactSource
  evidence: string | null
  confidence: FactConfidence
}

export type TextSignal = {
  code: 'FAMILY_ORIENTED' | 'GOD_FEARING' | 'CHRISTIAN_UNSPECIFIED' | 'SINGLE_DECLARED'
  evidence: string
  source: 'HEADLINE' | 'DESCRIPTION'
}

export type DataConflict = {
  field: string
  structuredValue: unknown
  textValue: unknown
  structuredEvidence: string | null
  textEvidence: string | null
}

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
  'DATA_CONFLICT',
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
  /** Stable identity when present. MATCH + BROWSE must not duplicate this. */
  externalId: string | null
  username: string
  profileUrl: string
  primaryPhotoUrl: string | null
  localPhotoPath: string | null
  age: number | null
  location: string | null
  country: string | null
  distanceKm: number | null
  distanceRaw: number | null
  distanceDisplayKm: number | null
  distanceTrust: DistanceTrust
  heightCm: number | null
  weightKg: number | null
  relationshipStatus: RelationshipStatus
  maritalHistory: MaritalHistory
  hasChildren: Tristate
  wantsChildren: Tristate
  religion: string | null
  religionPracticeLevel: ReligionPracticeLevel
  occupation: string | null
  education: string | null
  gender: string | null
  lastActivityAt: string | null
  headline: string | null
  bio: string | null
  photoVerified: boolean
  faceVerified: Tristate
  profileVerified: boolean
  fieldFacts: FieldFactMap
  facts: ProvenanceRecord[]
  textSignals: TextSignal[]
  dataConflicts: DataConflict[]
  classificationReasons: string[]
  missingDetail: string[]
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
  contactStatus: ContactStatus
  draftMessage: string | null
  draftCreatedAt: string | null
  manuallySentAt: string | null
  repliedAt: string | null
  lastHumanActionAt: string | null
  contactNotes: string | null
  logisticPriority: LogisticPriority
  priorityReasons: string[]
  uncertaintyReasons: string[]
  sources: ProfileSource[]
  activityCategory: ActivityCategory | null
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
  contactStatus?: ContactStatus | ContactStatus[]
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

export type UnknownFieldCounts = {
  children: number
  maritalHistory: number
  religion: number
  occupation: number
  gender: number
  photoVerified: number
  education: number
}

export type DashboardStats = {
  total: number
  byStatus: Record<ReviewStatus, number>
  unreviewed: number
  preselected: number
  needsDetail: number
  shortlisted: number
  discarded: number
  manualReview: number
  highScore: number
  flagged: number
  unknownCritical: number
  unknownByField: UnknownFieldCounts
  staleLocalProbe: number
  readyToContact: number
  probeSent: number
  actionRequired: number
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
  distanceRaw?: number | null
  heightCm?: number | null
  weightKg?: number | null
  relationshipStatus?: RelationshipStatus
  maritalHistory?: MaritalHistory
  hasChildren?: Tristate
  wantsChildren?: Tristate
  religion?: string | null
  religionPracticeLevel?: ReligionPracticeLevel
  occupation?: string | null
  education?: string | null
  gender?: string | null
  lastActivityAt?: string | null
  headline?: string | null
  bio?: string | null
  photoVerified?: boolean
  faceVerified?: Tristate
  profileVerified?: boolean
  fieldFacts?: FieldFactMap
  facts?: ProvenanceRecord[]
  textSignals?: TextSignal[]
  dataConflicts?: DataConflict[]
  classificationReasons?: string[]
  missingDetail?: string[]
  source?: ProfileSource
  sources?: ProfileSource[]
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
  DATA_CONFLICT: 'Structured field conflicts with an explicit bio statement',
}
