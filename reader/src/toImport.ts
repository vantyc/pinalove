import { classifyListsNewMatch } from '../../shared/classify.ts'
import type { FieldFact, FieldFactMap, ImportProfileInput } from '../../shared/types.ts'
import type { MaterializedMatch } from './pinaloveReader.ts'
import { containsSensitiveQuery } from './sanitize.ts'

const FORBIDDEN_FACT_KEYS = new Set([
  'a',
  'u',
  'uid',
  'tgz',
  'authtoken',
  'phpsessid',
  'cookie',
  'authorization',
  'token',
  'id_token',
  'access_token',
  'refresh_token',
])

function fact(rawValue: unknown, normalizedValue: unknown): FieldFact {
  return { rawValue, normalizedValue }
}

function firstPhotoUri(original: Record<string, unknown>): string | null {
  const photos = original.photos
  if (Array.isArray(photos) && photos[0] && typeof photos[0] === 'object') {
    const uri = (photos[0] as { Uri?: unknown }).Uri
    return typeof uri === 'string' && uri.length > 0 ? uri : null
  }
  return null
}

function rawOf(original: Record<string, unknown>, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(original, key) ? original[key] : null
}

export function assertNoSecretsInFacts(facts: FieldFactMap): void {
  const blob = JSON.stringify(facts)
  if (/PHPSESSID|authToken|"tgz"|id_token|access_token/i.test(blob)) {
    throw new Error('Refusing to persist field facts that look like secrets')
  }
  for (const key of Object.keys(facts)) {
    if (FORBIDDEN_FACT_KEYS.has(key.toLowerCase())) {
      throw new Error(`Refusing to persist forbidden key "${key}"`)
    }
  }
  if (containsSensitiveQuery(blob)) {
    throw new Error('Refusing to persist field facts that contain sensitive query keys')
  }
}

export function listsNewMatchToImport(match: MaterializedMatch): ImportProfileInput {
  const n = match.normalized
  const original = match.raw.original
  const username = n.username.value
  if (!username) {
    throw new Error('listsnew item missing name; cannot persist without a visible identity')
  }
  const profileUrl = n.profileUrl.value
  if (!profileUrl) {
    throw new Error(`listsnew item ${username} missing deterministic profile URL`)
  }

  const classification = classifyListsNewMatch({
    gender: n.gender.value,
    faceVerified: n.faceVerified.value,
    hasChildren: n.hasChildren.value,
    maritalHistory: n.maritalHistory.value,
    religion: n.religion.value,
    occupation: n.occupation.value,
  })

  const fieldFacts: FieldFactMap = {
    haschildren: fact(rawOf(original, 'haschildren'), n.hasChildren.value),
    wantschildren: fact(rawOf(original, 'wantschildren'), n.wantsChildren.value),
    faceverified: fact(rawOf(original, 'faceverified'), n.faceVerified.value),
    religion: fact(null, 'UNKNOWN'),
    relationshipStatus: fact(null, 'UNKNOWN'),
    maritalHistory: fact(null, 'UNKNOWN'),
    occupation: fact(rawOf(original, 'occupation'), n.occupation.value ?? 'UNKNOWN'),
    education: fact(rawOf(original, 'education'), n.education.value ?? 'UNKNOWN'),
    gender: fact(rawOf(original, 'gender'), n.gender.value ?? 'UNKNOWN'),
    distance: fact(rawOf(original, 'distance'), null),
    primaryPhotoUri: fact(firstPhotoUri(original), n.primaryPhotoUrl.value),
    lastactivity: fact(rawOf(original, 'lastactivity'), n.lastActivity.value),
  }
  assertNoSecretsInFacts(fieldFacts)

  return {
    externalId: n.externalId.value,
    username,
    profileUrl,
    primaryPhotoUrl: n.primaryPhotoUrl.value,
    localPhotoPath: null,
    age: n.age.value,
    location: n.city.value,
    country: n.country.value,
    distanceKm: null,
    distanceRaw: n.distance.value,
    relationshipStatus: 'UNKNOWN',
    maritalHistory: 'UNKNOWN',
    hasChildren: n.hasChildren.value,
    wantsChildren: n.wantsChildren.value,
    religion: null,
    religionPracticeLevel: 'UNKNOWN',
    occupation: null,
    education: null,
    gender: n.gender.value,
    lastActivityAt: n.lastActivity.value,
    headline: n.headline.value,
    bio: n.description.value,
    photoVerified: n.faceVerified.value === 'YES',
    faceVerified: n.faceVerified.value,
    profileVerified: false,
    source: 'PINALOVE',
    scrapedAt: match.raw.extractedAt,
    lastSeenAt: match.raw.extractedAt,
    reviewStatus: classification.status,
    decisionReason: [...classification.reasons, ...classification.missingDetail.map((m) => `missing: ${m}`)].join(
      ' · ',
    ),
    fieldFacts,
    classificationReasons: classification.reasons,
    missingDetail: classification.missingDetail,
  }
}

export type DataAnomaly = {
  username: string
  code: string
  detail: string
}

export function collectMatchAnomalies(match: MaterializedMatch): DataAnomaly[] {
  const original = match.raw.original
  const n = match.normalized
  const name = n.username.value ?? '(missing-name)'
  const out: DataAnomaly[] = []
  const childrenRaw = original.haschildren
  if (childrenRaw != null && String(childrenRaw) !== '0' && String(childrenRaw) !== '2') {
    out.push({
      username: name,
      code: 'haschildren-unmapped',
      detail: `haschildren=${String(childrenRaw)} not assumed (only 0 and 2 are demonstrated)`,
    })
  }
  if (n.faceVerified.value !== 'YES') {
    out.push({
      username: name,
      code: 'faceverified-not-1',
      detail: `faceverified raw=${String(original.faceverified ?? '(absent)')}`,
    })
  }
  const distance = n.distance.value
  if (distance != null && distance > 200) {
    out.push({
      username: name,
      code: 'distance-uninterpreted',
      detail: `distanceRaw=${String(distance)} stored only; not used as km`,
    })
  }
  if (!n.primaryPhotoUrl.value) {
    out.push({
      username: name,
      code: 'missing-photo-uri',
      detail: 'photos[].Uri missing; UI will use local placeholder',
    })
  }
  if (original.occupation != null && original.occupation !== '') {
    out.push({
      username: name,
      code: 'occupation-unexpected',
      detail: 'occupation present in listsnew but previously absent from field union',
    })
  }
  return out
}
