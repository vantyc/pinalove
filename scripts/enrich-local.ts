import path from 'node:path'
import { classifyListsNewMatch } from '../shared/classify.ts'
import { extractExplicitDeclarations, mergeStructuredAndText } from '../shared/localEnrichment.ts'
import type { FieldFactMap, FlagCode, Profile } from '../shared/types.ts'
import { openDatabase } from '../backend/src/db.ts'
import { ProfileStore } from '../backend/src/store.ts'

const SQLITE_PATH = process.env.SQLITE_PATH ?? path.join(process.cwd(), 'data/pinalove.sqlite')

function sqlitePathIsLocal(sqlitePath: string): void {
  const resolved = path.resolve(sqlitePath)
  if (resolved.includes('/var/lib/pinalove')) {
    throw new Error('Refusing to write the Kubernetes hostPath SQLite from local enrichment')
  }
}

/** listsnew haschildren only: 2=NO, 0=UNKNOWN. Never reuse a previously promoted column. */
function childrenFromListsNewRaw(raw: unknown): Profile['hasChildren'] {
  if (raw == null || raw === '') return 'UNKNOWN'
  if (String(raw) === '2') return 'NO'
  return 'UNKNOWN'
}

function faceFromListsNewRaw(raw: unknown): Profile['faceVerified'] {
  if (raw === 1 || raw === '1' || raw === true) return 'YES'
  return 'UNKNOWN'
}

function factMapFrom(merged: ReturnType<typeof mergeStructuredAndText>, previous: FieldFactMap): FieldFactMap {
  const next: FieldFactMap = { ...previous }
  for (const fact of merged.facts) {
    const prev = next[fact.field]
    next[fact.field] = {
      rawValue: prev?.rawValue ?? fact.evidence,
      normalizedValue: fact.value,
      source: fact.source,
      evidence: fact.evidence,
      confidence: fact.confidence,
    }
  }
  return next
}

function main(): void {
  sqlitePathIsLocal(SQLITE_PATH)
  const db = openDatabase(SQLITE_PATH)
  const store = new ProfileStore(db)
  const profiles = store.list({}).filter((p) => p.source === 'PINALOVE')
  if (profiles.length !== 25) {
    throw new Error(`Expected 25 PINALOVE profiles, found ${profiles.length}`)
  }

  const explicitNoChildren: string[] = []
  const explicitNeverMarried: string[] = []
  const religions: { username: string; value: string }[] = []
  const occupations: { username: string; value: string }[] = []
  const conflicts: { username: string; field: string }[] = []
  const byStatus: Record<string, number> = {}

  for (const profile of profiles) {
    const text = extractExplicitDeclarations(profile.headline, profile.bio)
    const childrenRaw = profile.fieldFacts.haschildren?.rawValue ?? null
    const faceRaw = profile.fieldFacts.faceverified?.rawValue ?? null
    const merged = mergeStructuredAndText({
      structuredChildren: childrenFromListsNewRaw(childrenRaw),
      structuredChildrenRaw: childrenRaw,
      // listsnew did not provide marital/religion/occupation/gender; ignore promoted columns
      structuredMarital: 'UNKNOWN',
      structuredReligion: null,
      structuredOccupation: null,
      structuredGender: null,
      structuredFaceVerified: faceFromListsNewRaw(faceRaw),
      structuredFaceRaw: faceRaw,
      structuredRelationship: 'UNKNOWN',
      text,
    })
    const classified = classifyListsNewMatch({
      gender: merged.gender,
      faceVerified: merged.faceVerified,
      hasChildren: merged.hasChildren,
      maritalHistory: merged.maritalHistory,
      religion: merged.religion,
      occupation: merged.occupation,
      dataConflict: merged.dataConflicts.length > 0,
    })
    const flags: FlagCode[] = merged.dataConflicts.length > 0 ? ['DATA_CONFLICT'] : []
    store.applyLocalEnrichment(profile.id, {
      hasChildren: merged.hasChildren,
      maritalHistory: merged.maritalHistory,
      relationshipStatus: merged.relationshipStatus,
      religion: merged.religion,
      occupation: merged.occupation,
      gender: merged.gender,
      facts: merged.facts,
      textSignals: merged.textSignals,
      dataConflicts: merged.dataConflicts,
      reviewStatus: classified.status,
      classificationReasons: classified.reasons,
      missingDetail: classified.missingDetail,
      flags,
      fieldFacts: factMapFrom(merged, profile.fieldFacts),
      decisionReason: [...classified.reasons, ...classified.missingDetail.map((m) => `missing: ${m}`)].join(' · '),
    })

    if (text.hasChildren?.value === 'NO') explicitNoChildren.push(profile.username)
    if (text.maritalHistory?.value === 'NEVER_MARRIED') explicitNeverMarried.push(profile.username)
    if (text.religion) religions.push({ username: profile.username, value: text.religion.value })
    if (text.occupation) occupations.push({ username: profile.username, value: text.occupation.value })
    for (const conflict of merged.dataConflicts) {
      conflicts.push({ username: profile.username, field: conflict.field })
    }
    byStatus[classified.status] = (byStatus[classified.status] ?? 0) + 1
  }

  const after = store.list({}).filter((p) => p.source === 'PINALOVE')
  const unknown = {
    children: after.filter((p) => p.hasChildren === 'UNKNOWN').length,
    maritalHistory: after.filter((p) => p.maritalHistory === 'UNKNOWN').length,
    religion: after.filter((p) => !p.religion || p.religion === 'UNKNOWN').length,
    occupation: after.filter((p) => !p.occupation || p.occupation === 'UNKNOWN').length,
    gender: after.filter((p) => !p.gender || p.gender === 'UNKNOWN').length,
    photoVerified: after.filter((p) => p.faceVerified === 'UNKNOWN').length,
    education: after.filter((p) => !p.education || p.education === 'UNKNOWN').length,
  }

  const report = {
    analyzed: after.length,
    pinaloveRequests: 0,
    chrome: false,
    cdp: false,
    explicitNoChildren: {
      count: explicitNoChildren.length,
      usernames: explicitNoChildren,
    },
    explicitNeverMarried: {
      count: explicitNeverMarried.length,
      usernames: explicitNeverMarried,
    },
    explicitReligion: religions,
    explicitOccupation: occupations,
    conflicts,
    classification: {
      PRESELECTED: byStatus.PRESELECTED ?? 0,
      NEEDS_DETAIL: byStatus.NEEDS_DETAIL ?? 0,
      DISCARDED: byStatus.DISCARDED ?? 0,
      UNREVIEWED: byStatus.UNREVIEWED ?? 0,
    },
    unknownByField: unknown,
  }

  db.close()
  console.log(JSON.stringify(report, null, 2))
}

main()
