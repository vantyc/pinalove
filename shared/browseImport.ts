import { classifyListsNewMatch } from './classify.ts'
import { lastActivityToIso } from './activity.ts'
import type { FieldFactMap, ImportProfileInput, ProvenanceRecord, Tristate } from './types.ts'

const PINALOVE_ORIGIN = 'https://www.pinalove.com'

export type BrowseDeckRecord = {
  externalId: string
  username: string
  age: number
  city: string
  country: string
  area?: string | null
  distance: number
  lastactivity: string
  headline: string | null
  description: string | null
  haschildren: string
  wantschildren: string
  faceverified: number
  education: string | null
  lookingfor: string | null
  primaryPhotoUri: string | null
  /** Display-only. Must never become structured gender. */
  bg?: string | null
  asltxt?: string | null
}

function photoUrl(uri: string | null, username: string): string | null {
  if (!uri) return null
  const path = uri.replace('{username}', username)
  if (/^https?:\/\//i.test(path)) return path
  return `${PINALOVE_ORIGIN}${path}-medium.jpg`
}

function hasChildrenFromBrowse(raw: string): Tristate {
  if (raw === '2') return 'NO'
  return 'UNKNOWN'
}

function wantsChildrenFromBrowse(raw: string): Tristate {
  if (raw === '1') return 'YES'
  if (raw === '2') return 'NO'
  return 'UNKNOWN'
}

/**
 * Map a FASE 3A browsenew deck item. Gender stays UNKNOWN.
 * bg / asltxt are display strings, not structured gender.
 */
export function browseRecordToImport(row: BrowseDeckRecord, extractedAt: string): ImportProfileInput {
  void row.bg
  void row.asltxt
  const hasChildren = hasChildrenFromBrowse(row.haschildren)
  const wantsChildren = wantsChildrenFromBrowse(row.wantschildren)
  const faceVerified: Tristate = row.faceverified === 1 ? 'YES' : 'UNKNOWN'
  const lastIso = lastActivityToIso(row.lastactivity)
  const classification = classifyListsNewMatch({
    gender: null,
    faceVerified,
    hasChildren,
    maritalHistory: 'UNKNOWN',
    religion: null,
    occupation: null,
  })
  const fieldFacts: FieldFactMap = {
    haschildren: { rawValue: row.haschildren, normalizedValue: hasChildren },
    wantschildren: { rawValue: row.wantschildren, normalizedValue: wantsChildren },
    faceverified: { rawValue: row.faceverified, normalizedValue: faceVerified },
    gender: { rawValue: null, normalizedValue: 'UNKNOWN' },
    maritalHistory: { rawValue: null, normalizedValue: 'UNKNOWN' },
    distance: { rawValue: row.distance, normalizedValue: row.distance },
    lastactivity: { rawValue: row.lastactivity, normalizedValue: lastIso },
    education: { rawValue: row.education, normalizedValue: row.education },
    lookingfor: { rawValue: row.lookingfor, normalizedValue: row.lookingfor },
    area: { rawValue: row.area ?? null, normalizedValue: row.area ?? null },
  }
  const facts: ProvenanceRecord[] = [
    {
      field: 'faceVerified',
      value: faceVerified,
      source: 'BROWSENEW_STRUCTURED_FIELD',
      evidence: `faceverified=${String(row.faceverified)}`,
      confidence: faceVerified === 'YES' ? 'STRUCTURED' : 'NONE',
    },
    {
      field: 'hasChildren',
      value: hasChildren,
      source: 'BROWSENEW_STRUCTURED_FIELD',
      evidence: `haschildren=${row.haschildren}`,
      confidence: hasChildren === 'UNKNOWN' ? 'NONE' : 'STRUCTURED',
    },
    {
      field: 'maritalHistory',
      value: 'UNKNOWN',
      source: 'BROWSENEW_STRUCTURED_FIELD',
      evidence: null,
      confidence: 'NONE',
    },
    {
      field: 'gender',
      value: 'UNKNOWN',
      source: 'BROWSENEW_STRUCTURED_FIELD',
      evidence: 'gender field absent; bg/asltxt ignored',
      confidence: 'NONE',
    },
  ]
  return {
    externalId: row.externalId,
    username: row.username,
    profileUrl: `${PINALOVE_ORIGIN}/${row.username}`,
    primaryPhotoUrl: photoUrl(row.primaryPhotoUri, row.username),
    age: row.age,
    location: row.city,
    country: row.country,
    distanceKm: row.distance,
    distanceRaw: row.distance,
    relationshipStatus: 'UNKNOWN',
    maritalHistory: 'UNKNOWN',
    hasChildren,
    wantsChildren,
    gender: null,
    lastActivityAt: lastIso,
    education: row.education,
    headline: row.headline,
    bio: row.description,
    photoVerified: faceVerified === 'YES',
    faceVerified,
    source: 'PINALOVE_BROWSE',
    scrapedAt: extractedAt,
    lastSeenAt: extractedAt,
    reviewStatus: classification.status,
    decisionReason: [...classification.reasons, ...classification.missingDetail.map((m) => `missing: ${m}`)].join(
      ' · ',
    ),
    fieldFacts,
    facts,
    classificationReasons: classification.reasons,
    missingDetail: classification.missingDetail,
  }
}
