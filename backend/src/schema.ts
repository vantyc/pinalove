import { z } from 'zod'
import {
  DECISIONS,
  DECISION_SOURCES,
  FACT_CONFIDENCES,
  FACT_SOURCES,
  FLAG_CODES,
  FILTER_SHORTCUTS,
  MARITAL_HISTORIES,
  PROFILE_SOURCES,
  RELATIONSHIP_STATUSES,
  RELIGION_PRACTICE_LEVELS,
  REVIEW_STATUSES,
  TRISTATES,
} from '../../shared/types.ts'

const fieldFactSchema = z.object({
  rawValue: z.unknown(),
  normalizedValue: z.unknown(),
})

const provenanceSchema = z.object({
  field: z.string(),
  value: z.unknown(),
  source: z.enum(FACT_SOURCES),
  evidence: z.string().nullable(),
  confidence: z.enum(FACT_CONFIDENCES),
})

export const importProfileSchema = z.object({
  externalId: z.string().min(1).nullable().optional(),
  username: z.string().min(1),
  profileUrl: z.string().url(),
  primaryPhotoUrl: z.string().url().nullable().optional(),
  localPhotoPath: z.string().nullable().optional(),
  age: z.number().int().positive().nullable().optional(),
  location: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  distanceKm: z.number().nonnegative().nullable().optional(),
  distanceRaw: z.number().nullable().optional(),
  heightCm: z.number().int().positive().nullable().optional(),
  weightKg: z.number().positive().nullable().optional(),
  relationshipStatus: z.enum(RELATIONSHIP_STATUSES).optional(),
  maritalHistory: z.enum(MARITAL_HISTORIES).optional(),
  hasChildren: z.enum(TRISTATES).optional(),
  wantsChildren: z.enum(TRISTATES).optional(),
  religion: z.string().nullable().optional(),
  religionPracticeLevel: z.enum(RELIGION_PRACTICE_LEVELS).optional(),
  occupation: z.string().nullable().optional(),
  education: z.string().nullable().optional(),
  gender: z.string().nullable().optional(),
  lastActivityAt: z.string().nullable().optional(),
  headline: z.string().nullable().optional(),
  bio: z.string().nullable().optional(),
  photoVerified: z.boolean().optional(),
  faceVerified: z.enum(TRISTATES).optional(),
  profileVerified: z.boolean().optional(),
  fieldFacts: z.record(fieldFactSchema).optional(),
  facts: z.array(provenanceSchema).optional(),
  classificationReasons: z.array(z.string()).optional(),
  missingDetail: z.array(z.string()).optional(),
  source: z.enum(PROFILE_SOURCES).optional(),
  scrapedAt: z.string().nullable().optional(),
  lastSeenAt: z.string().nullable().optional(),
  reviewStatus: z.enum(REVIEW_STATUSES).optional(),
  decision: z.enum(DECISIONS).optional(),
  decisionReason: z.string().nullable().optional(),
  proposedMessage: z.string().nullable().optional(),
  flags: z.array(z.enum(FLAG_CODES)).optional(),
})

export const importPayloadSchema = z.union([
  z.array(importProfileSchema),
  z.object({ profiles: z.array(importProfileSchema) }),
])

export const statusPatchSchema = z.object({
  status: z.enum(REVIEW_STATUSES),
  reason: z.string().min(1).optional(),
  source: z.enum(DECISION_SOURCES).optional(),
})

export const decisionPatchSchema = z.object({
  decision: z.enum(DECISIONS),
  reason: z.string().nullable().optional(),
})

export const contactPatchSchema = z.object({
  action: z.enum(['mark-sent', 'notes', 'replied', 'no-response']),
  notes: z.string().nullable().optional(),
})

export const profileListQuerySchema = z.object({
  ageMin: z.coerce.number().int().optional(),
  ageMax: z.coerce.number().int().optional(),
  country: z.string().optional(),
  location: z.string().optional(),
  distanceMax: z.coerce.number().optional(),
  hasChildren: z.enum(TRISTATES).optional(),
  relationshipStatus: z.enum(RELATIONSHIP_STATUSES).optional(),
  maritalHistory: z.enum(MARITAL_HISTORIES).optional(),
  religion: z.string().optional(),
  verified: z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((v) => (v == null ? undefined : v === 'true' || v === '1')),
  scoreMin: z.coerce.number().int().optional(),
  scoreMax: z.coerce.number().int().optional(),
  status: z.string().optional(),
  contactStatus: z.string().optional(),
  flags: z.string().optional(),
  shortcut: z.enum(FILTER_SHORTCUTS).optional(),
  search: z.string().optional(),
})
