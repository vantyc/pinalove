import type { MaritalHistory, RelationshipStatus, Tristate } from '../../shared/types.ts'

export type Confidence = 'EXPLICIT' | 'NONE'

export type NormalizedField<T> = {
  value: T
  sourceValue: string | null
  confidence: Confidence
}

export type ListsNewNormalized = {
  externalId: NormalizedField<string | null>
  username: NormalizedField<string | null>
  profileUrl: NormalizedField<string | null>
  age: NormalizedField<number | null>
  city: NormalizedField<string | null>
  country: NormalizedField<string | null>
  distance: NormalizedField<number | null>
  headline: NormalizedField<string | null>
  description: NormalizedField<string | null>
  hasChildren: NormalizedField<Tristate>
  wantsChildren: NormalizedField<Tristate>
  faceVerified: NormalizedField<Tristate>
  education: NormalizedField<string | null>
  occupation: NormalizedField<string | null>
  joinTime: NormalizedField<string | null>
  lookingFor: NormalizedField<string | null>
  lastActivity: NormalizedField<string | null>
  photoCount: NormalizedField<number | null>
  primaryPhotoUrl: NormalizedField<string | null>
  relationshipStatus: NormalizedField<RelationshipStatus>
  maritalHistory: NormalizedField<MaritalHistory>
  religion: NormalizedField<string | null>
  gender: NormalizedField<string | null>
}

const PINALOVE_ORIGIN = 'https://www.pinalove.com'

function present(value: unknown): boolean {
  return value !== undefined && value !== null && value !== ''
}

function asString(value: unknown): string | null {
  if (!present(value)) return null
  const text = String(value)
  if (text === 'No answer') return null
  return text
}

function unknownField<T>(value: T, sourceValue: string | null = null): NormalizedField<T> {
  return { value, sourceValue, confidence: 'NONE' }
}

function explicit<T>(value: T, sourceValue: unknown): NormalizedField<T> {
  return {
    value,
    sourceValue: sourceValue == null ? null : String(sourceValue),
    confidence: 'EXPLICIT',
  }
}

function code(value: unknown): string | null {
  if (!present(value)) return null
  return String(value)
}

/**
 * listsnew haschildren (demonstrated in the controlled test):
 *   0 -> UNKNOWN
 *   2 -> NO
 * Other codes, including 1, stay UNKNOWN until demonstrated.
 */
export function normalizeHasChildren(raw: unknown): NormalizedField<Tristate> {
  const c = code(raw)
  if (c == null) return unknownField('UNKNOWN')
  if (c === '2') return explicit('NO', c)
  return unknownField('UNKNOWN', c)
}

/** PinaLove wantschildren: 0 No answer, 1 Yes, 2 No, 3 Maybe. Maybe is not YES/NO. */
export function normalizeWantsChildren(raw: unknown): NormalizedField<Tristate> {
  const c = code(raw)
  if (c == null) return unknownField('UNKNOWN')
  if (c === '1') return explicit('YES', c)
  if (c === '2') return explicit('NO', c)
  if (c === '3') return unknownField('UNKNOWN', c)
  if (c === '0') return unknownField('UNKNOWN', c)
  return unknownField('UNKNOWN', c)
}

/** listsnew faceverified: 1 -> YES. Anything else stays UNKNOWN until demonstrated. */
export function normalizeFaceVerified(raw: unknown): NormalizedField<Tristate> {
  if (!present(raw)) return unknownField('UNKNOWN')
  if (raw === true || raw === 1 || raw === '1') return explicit('YES', raw)
  return unknownField('UNKNOWN', String(raw))
}

export function pickPrimaryPhotoUrl(item: Record<string, unknown>): string | null {
  const photos = item.photos
  let chosen: { ID?: unknown; Uri?: unknown } | null = null
  if (Array.isArray(photos) && photos.length > 0 && photos[0] && typeof photos[0] === 'object') {
    chosen = photos[0] as { ID?: unknown; Uri?: unknown }
  } else if (photos && typeof photos === 'object') {
    const values = Object.values(photos as Record<string, unknown>)
    const first = values.find((p) => p && typeof p === 'object') as
      | { ID?: unknown; Uri?: unknown }
      | undefined
    chosen = first ?? null
  }
  const uri = typeof chosen?.Uri === 'string' ? chosen.Uri : null
  if (uri && uri.length > 0 && !uri.includes('nophoto')) {
    if (/^https?:\/\//i.test(uri)) return `${uri}-medium.jpg`.replace(/-medium\.jpg-medium\.jpg$/, '-medium.jpg')
    return `${PINALOVE_ORIGIN}${uri}-medium.jpg`
  }
  return null
}

function photoCount(item: Record<string, unknown>): number | null {
  const photos = item.photos
  if (!photos) return null
  if (Array.isArray(photos)) return photos.filter((p) => p && typeof p === 'object').length
  if (typeof photos === 'object') {
    return Object.values(photos as Record<string, unknown>).filter((p) => p && typeof p === 'object')
      .length
  }
  return null
}

function unixToIso(raw: unknown): string | null {
  if (!present(raw)) return null
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return String(raw)
  const ms = n > 1e12 ? n : n * 1000
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return String(raw)
  return d.toISOString()
}

export function normalizeListsNewItem(item: Record<string, unknown>): ListsNewNormalized {
  const username = asString(item.name) ?? asString(item.username)
  const id = present(item.id) ? String(item.id) : null
  const headline = asString(item.headline)
  const description = asString(item.description)
  const occupation = asString(item.occupation)
  const city = asString(item.city)
  const country = asString(item.country)
  const lookingFor = asString(item.lookingfor)
  const ageRaw = item.age
  const ageNum = present(ageRaw) ? Number(ageRaw) : null
  const age = ageNum != null && Number.isFinite(ageNum) ? ageNum : null
  const distanceRaw = item.distance
  const distanceNum = present(distanceRaw) ? Number(distanceRaw) : null
  const distance = distanceNum != null && Number.isFinite(distanceNum) ? distanceNum : null
  const photoUrl = pickPrimaryPhotoUrl(item)
  const count = photoCount(item)
  const joinIso = unixToIso(item.jointime)
  const lastIso = unixToIso(item.lastactivity)
  const educationRaw = present(item.education) ? String(item.education) : null

  return {
    externalId: id ? explicit(id, item.id) : unknownField(null),
    username: username ? explicit(username, item.name ?? item.username) : unknownField(null),
    profileUrl: username
      ? explicit(`${PINALOVE_ORIGIN}/${username}`, username)
      : unknownField(null),
    age: age != null ? explicit(age, ageRaw) : unknownField(null),
    city: city ? explicit(city, item.city) : unknownField(null),
    country: country ? explicit(country, item.country) : unknownField(null),
    distance: distance != null ? explicit(distance, distanceRaw) : unknownField(null),
    headline: headline ? explicit(headline, item.headline) : unknownField(null, asString(item.headline) === null && present(item.headline) ? String(item.headline) : null),
    description: description
      ? explicit(description, '[present]')
      : unknownField(null, present(item.description) ? String(item.description) : null),
    hasChildren: normalizeHasChildren(item.haschildren),
    wantsChildren: normalizeWantsChildren(item.wantschildren),
    faceVerified: normalizeFaceVerified(item.faceverified),
    education: unknownField(null, educationRaw),
    occupation: occupation ? explicit(occupation, item.occupation) : unknownField(null),
    joinTime: joinIso ? explicit(joinIso, item.jointime) : unknownField(null),
    lookingFor: lookingFor ? explicit(lookingFor, item.lookingfor) : unknownField(null),
    lastActivity: lastIso ? explicit(lastIso, item.lastactivity) : unknownField(null),
    photoCount: count != null ? explicit(count, count) : unknownField(null),
    primaryPhotoUrl: photoUrl ? explicit(photoUrl, 'photos[].Uri') : unknownField(null),
    relationshipStatus: unknownField('UNKNOWN'),
    maritalHistory: unknownField('UNKNOWN'),
    religion: unknownField(null),
    gender: unknownField(null, present(item.gender) ? String(item.gender) : null),
  }
}

export function collectFieldNames(item: Record<string, unknown>): string[] {
  return Object.keys(item).toSorted()
}
