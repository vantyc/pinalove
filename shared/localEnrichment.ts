import type {
  DataConflict,
  FactConfidence,
  FactSource,
  MaritalHistory,
  ProvenanceRecord,
  RelationshipStatus,
  TextSignal,
  Tristate,
} from './types.ts'

export type TextHit<T> = {
  value: T
  source: 'HEADLINE' | 'DESCRIPTION'
  evidence: string
}

export type LocalTextExtraction = {
  hasChildren: TextHit<Tristate> | null
  maritalHistory: TextHit<MaritalHistory> | null
  relationshipStatus: TextHit<RelationshipStatus> | null
  religion: TextHit<string> | null
  religionIsCatholic: boolean
  occupation: TextHit<string> | null
  gender: TextHit<string> | null
  signals: TextSignal[]
}

export function decodeProfileText(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

function snippet(text: string, start: number, end: number): string {
  const cut = text.slice(Math.max(0, start), Math.min(text.length, end)).trim()
  return cut.length > 96 ? `${cut.slice(0, 93)}...` : cut
}

function firstMatch(
  text: string,
  source: 'HEADLINE' | 'DESCRIPTION',
  patterns: RegExp[],
): { evidence: string } | null {
  for (const pattern of patterns) {
    const copy = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`)
    const found = copy.exec(text)
    if (found && found[0]) {
      return { evidence: snippet(text, found.index, found.index + found[0].length) }
    }
  }
  return null
}

const NO_CHILDREN = [
  /\b(?:i\s+)?(?:have\s+)?no\s+(?:kids|children)\b/i,
  /\b(?:i\s+)?(?:do\s+not|don't|dont)\s+have\s+(?:any\s+)?(?:kids|children|a\s+child)\b/i,
  /\bwithout\s+(?:kids|children)\b/i,
  /\bchild[\s-]?free\b/i,
]

const HAS_CHILDREN = [
  /\bsingle\s*moms?\b/i,
  /\bsingle\s+mothers?\b/i,
  /\bmom\s+of\s+\d+\b/i,
  /\bmother\s+of\s+\d+\b/i,
  /\b(?:i\s+have|i've\s+got)\s+(?:a\s+)?(?:\d+\s+)?(?:grown[\s-]?up\s+)?(?:kids?|children|child|son|daughter)s?\b/i,
  /\bmy\s+(?:son|daughter|children|kids)\b/i,
]

const NEVER_MARRIED = [
  /\bnever\s+been\s+married\b/i,
  /\bnever\s+married\b/i,
  /\bsingle,?\s+never\s+married\b/i,
]

const DIVORCED = [/\b(?:i\s+am|i'm|im)\s+divorced\b/i]
const WIDOWED = [/\b(?:i\s+am|i'm|im)\s+(?:a\s+)?widow(?:ed)?\b/i]
const SEPARATED = [/\b(?:i\s+am|i'm|im)\s+separated\b/i]

const SINGLE = [
  /\bas\s+a\s+single\s+person\b/i,
  /\bfilipina\s+single\b/i,
  /\bsingle\s*\/\s*no\s+kids\b/i,
]

const CATHOLIC = [/\broman\s+catholic\b/i, /\bcatholic\b/i]
const RELIGION_IS = [/\bmy\s+religion\s+is\s+([a-z][a-z\s-]{2,40})/i]
const CHRISTIAN = [/\bchristian\b/i, /\bcristian\b/i]
const GOD_FEARING = [/\bgod[\s-]?fearing\b/i]
const FAMILY_ORIENTED = [/\bfamily[\s-]?oriented\b/i]

const WOMAN = [
  /\b(?:i\s+am|i'm|im)\s+(?:a\s+|an\s+)?(?:woman|lady|girl|female)\b/i,
]

const OCCUPATION_TITLES = [
  /\bhead\s+nurse\b/i,
  /\bnurse\b/i,
  /\bteacher\b/i,
  /\bengineer\b/i,
  /\bdoctor\b/i,
  /\baccountant\b/i,
  /\bstudent\b/i,
]
const WORKING_FOR = [/\bcurrently\s+working\s+for\s+(?:a\s+|an\s+)?([^.,]{3,48})/i]

function hit<T>(
  value: T,
  source: 'HEADLINE' | 'DESCRIPTION',
  evidence: string,
): TextHit<T> {
  return { value, source, evidence }
}

function search<T>(
  headline: string,
  description: string,
  patterns: RegExp[],
  value: T,
): TextHit<T> | null {
  const h = firstMatch(headline, 'HEADLINE', patterns)
  if (h) return hit(value, 'HEADLINE', h.evidence)
  const d = firstMatch(description, 'DESCRIPTION', patterns)
  if (d) return hit(value, 'DESCRIPTION', d.evidence)
  return null
}

function occupationFrom(text: string, source: 'HEADLINE' | 'DESCRIPTION'): TextHit<string> | null {
  for (const pattern of OCCUPATION_TITLES) {
    const found = new RegExp(pattern.source, 'i').exec(text)
    if (found?.[0]) {
      const raw = found[0].replace(/\s+/g, ' ').trim()
      const value = raw.toLowerCase() === 'head nurse' ? 'Head nurse' : raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase()
      return hit(value, source, raw)
    }
  }
  const work = new RegExp(WORKING_FOR[0].source, 'i').exec(text)
  if (work?.[1]) {
    return hit(work[1].trim(), source, work[0].trim())
  }
  return null
}

function religionDeclared(text: string, source: 'HEADLINE' | 'DESCRIPTION'): TextHit<string> | null {
  const named = new RegExp(RELIGION_IS[0].source, 'i').exec(text)
  if (named?.[1]) {
    const label = named[1].replace(/\s+/g, ' ').trim().replace(/\.*$/, '')
    if (/^catholic\b/i.test(label) || /^roman catholic\b/i.test(label)) {
      return hit('Catholic', source, named[0].trim())
    }
    return hit(label.replace(/\b\w/g, (c) => c.toUpperCase()), source, named[0].trim())
  }
  const catholic = firstMatch(text, source, CATHOLIC)
  if (catholic) return hit('Catholic', source, catholic.evidence)
  return null
}

/**
 * Explicit statements only. Absence is not NO. Single is not never-married.
 * Christian is not Catholic. Family-oriented is a signal, not a fact.
 */
export function extractExplicitDeclarations(
  headlineRaw: string | null,
  descriptionRaw: string | null,
): LocalTextExtraction {
  const headline = decodeProfileText(headlineRaw)
  const description = decodeProfileText(descriptionRaw)
  const signals: TextSignal[] = []

  const hasKids = search(headline, description, HAS_CHILDREN, 'YES' as const)
  const noKids = search(headline, description, NO_CHILDREN, 'NO' as const)
  // Prefer a positive children declaration over "no kids" if both somehow match.
  const hasChildren = hasKids ?? noKids

  const neverMarried = search(headline, description, NEVER_MARRIED, 'NEVER_MARRIED' as const)
  const divorced = search(headline, description, DIVORCED, 'DIVORCED' as const)
  const widowed = search(headline, description, WIDOWED, 'WIDOWED' as const)
  const separated = search(headline, description, SEPARATED, 'SEPARATED' as const)
  const maritalHistory = neverMarried ?? divorced ?? widowed ?? separated

  let relationshipStatus: TextHit<RelationshipStatus> | null = null
  const singleHit = search(headline, description, SINGLE, 'SINGLE' as const)
  if (singleHit && !/\bsingle\s*moms?\b/i.test(singleHit.evidence) && !/\bsingle\s+mothers?\b/i.test(singleHit.evidence)) {
    relationshipStatus = singleHit
    signals.push({
      code: 'SINGLE_DECLARED',
      evidence: singleHit.evidence,
      source: singleHit.source,
    })
  }

  const hRel = religionDeclared(headline, 'HEADLINE')
  const dRel = religionDeclared(description, 'DESCRIPTION')
  const religion = hRel ?? dRel
  const religionIsCatholic = (religion?.value ?? '').toLowerCase() === 'catholic'

  const christian = search(headline, description, CHRISTIAN, 'Christian')
  if (christian && !religionIsCatholic) {
    signals.push({
      code: 'CHRISTIAN_UNSPECIFIED',
      evidence: christian.evidence,
      source: christian.source,
    })
  }

  const god = search(headline, description, GOD_FEARING, 'god-fearing')
  if (god) {
    signals.push({ code: 'GOD_FEARING', evidence: god.evidence, source: god.source })
  }
  const family = search(headline, description, FAMILY_ORIENTED, 'family-oriented')
  if (family) {
    signals.push({ code: 'FAMILY_ORIENTED', evidence: family.evidence, source: family.source })
  }

  const occH = occupationFrom(headline, 'HEADLINE')
  const occD = occupationFrom(description, 'DESCRIPTION')
  const occupation = occH ?? occD

  // Nationality words (Filipina, Mexican, …) are not gender. listsnew/profilenew
  // structured gender only. Unequivocal "I am a woman/female" is allowed.
  const gender = search(headline, description, WOMAN, 'F')

  return {
    hasChildren,
    maritalHistory,
    relationshipStatus,
    religion,
    religionIsCatholic,
    occupation,
    gender,
    signals,
  }
}

export type MergeInput = {
  structuredChildren: Tristate
  structuredChildrenRaw: unknown
  structuredMarital: MaritalHistory
  structuredReligion: string | null
  structuredOccupation: string | null
  structuredGender: string | null
  structuredFaceVerified: Tristate
  structuredFaceRaw: unknown
  structuredRelationship: RelationshipStatus
  text: LocalTextExtraction
}

export type MergeResult = {
  hasChildren: Tristate
  maritalHistory: MaritalHistory
  relationshipStatus: RelationshipStatus
  religion: string | null
  occupation: string | null
  gender: string | null
  faceVerified: Tristate
  facts: ProvenanceRecord[]
  textSignals: TextSignal[]
  dataConflicts: DataConflict[]
}

function provenance(
  field: string,
  value: unknown,
  source: FactSource,
  evidence: string | null,
  confidence: FactConfidence,
): ProvenanceRecord {
  return { field, value, source, evidence, confidence }
}

function sourceFromText(source: 'HEADLINE' | 'DESCRIPTION'): FactSource {
  return source === 'HEADLINE' ? 'HEADLINE' : 'DESCRIPTION'
}

export function mergeStructuredAndText(input: MergeInput): MergeResult {
  const facts: ProvenanceRecord[] = []
  const dataConflicts: DataConflict[] = []
  const text = input.text

  facts.push(
    provenance(
      'faceVerified',
      input.structuredFaceVerified,
      'LISTSNEW_STRUCTURED_FIELD',
      input.structuredFaceRaw == null ? null : `faceverified=${String(input.structuredFaceRaw)}`,
      input.structuredFaceVerified === 'UNKNOWN' ? 'NONE' : 'STRUCTURED',
    ),
  )

  let hasChildren = input.structuredChildren
  const structuredChildEvidence =
    input.structuredChildrenRaw == null ? null : `haschildren=${String(input.structuredChildrenRaw)}`
  if (input.structuredChildren !== 'UNKNOWN') {
    facts.push(
      provenance(
        'hasChildren',
        input.structuredChildren,
        'LISTSNEW_STRUCTURED_FIELD',
        structuredChildEvidence,
        'STRUCTURED',
      ),
    )
    if (text.hasChildren && text.hasChildren.value !== input.structuredChildren) {
      dataConflicts.push({
        field: 'hasChildren',
        structuredValue: input.structuredChildren,
        textValue: text.hasChildren.value,
        structuredEvidence: structuredChildEvidence,
        textEvidence: text.hasChildren.evidence,
      })
      facts.push(
        provenance(
          'hasChildren',
          text.hasChildren.value,
          sourceFromText(text.hasChildren.source),
          text.hasChildren.evidence,
          'EXPLICIT',
        ),
      )
    } else if (text.hasChildren) {
      facts.push(
        provenance(
          'hasChildren',
          text.hasChildren.value,
          sourceFromText(text.hasChildren.source),
          text.hasChildren.evidence,
          'EXPLICIT',
        ),
      )
    }
  } else if (text.hasChildren) {
    hasChildren = text.hasChildren.value
    facts.push(
      provenance(
        'hasChildren',
        text.hasChildren.value,
        sourceFromText(text.hasChildren.source),
        text.hasChildren.evidence,
        'EXPLICIT',
      ),
    )
  } else {
    facts.push(
      provenance('hasChildren', 'UNKNOWN', 'LISTSNEW_STRUCTURED_FIELD', structuredChildEvidence, 'NONE'),
    )
  }

  let maritalHistory = input.structuredMarital
  if (input.structuredMarital !== 'UNKNOWN') {
    facts.push(
      provenance('maritalHistory', input.structuredMarital, 'LISTSNEW_STRUCTURED_FIELD', null, 'STRUCTURED'),
    )
    if (text.maritalHistory && text.maritalHistory.value !== input.structuredMarital) {
      dataConflicts.push({
        field: 'maritalHistory',
        structuredValue: input.structuredMarital,
        textValue: text.maritalHistory.value,
        structuredEvidence: null,
        textEvidence: text.maritalHistory.evidence,
      })
    }
  } else if (text.maritalHistory) {
    maritalHistory = text.maritalHistory.value
    facts.push(
      provenance(
        'maritalHistory',
        text.maritalHistory.value,
        sourceFromText(text.maritalHistory.source),
        text.maritalHistory.evidence,
        'EXPLICIT',
      ),
    )
  } else {
    facts.push(provenance('maritalHistory', 'UNKNOWN', 'LISTSNEW_STRUCTURED_FIELD', null, 'NONE'))
  }

  let relationshipStatus = input.structuredRelationship
  if (text.relationshipStatus && input.structuredRelationship === 'UNKNOWN') {
    relationshipStatus = text.relationshipStatus.value
    facts.push(
      provenance(
        'relationshipStatus',
        text.relationshipStatus.value,
        sourceFromText(text.relationshipStatus.source),
        text.relationshipStatus.evidence,
        'EXPLICIT',
      ),
    )
  } else {
    facts.push(
      provenance(
        'relationshipStatus',
        relationshipStatus,
        'LISTSNEW_STRUCTURED_FIELD',
        null,
        relationshipStatus === 'UNKNOWN' ? 'NONE' : 'STRUCTURED',
      ),
    )
  }

  let religion = input.structuredReligion
  if ((!religion || religion === 'UNKNOWN') && text.religion) {
    religion = text.religion.value
    facts.push(
      provenance(
        'religion',
        text.religion.value,
        sourceFromText(text.religion.source),
        text.religion.evidence,
        'EXPLICIT',
      ),
    )
  } else {
    facts.push(provenance('religion', religion ?? 'UNKNOWN', 'LISTSNEW_STRUCTURED_FIELD', null, 'NONE'))
  }

  let occupation = input.structuredOccupation
  if ((!occupation || occupation === 'UNKNOWN') && text.occupation) {
    occupation = text.occupation.value
    facts.push(
      provenance(
        'occupation',
        text.occupation.value,
        sourceFromText(text.occupation.source),
        text.occupation.evidence,
        'EXPLICIT',
      ),
    )
  } else {
    facts.push(provenance('occupation', occupation ?? 'UNKNOWN', 'LISTSNEW_STRUCTURED_FIELD', null, 'NONE'))
  }

  let gender = input.structuredGender
  if ((!gender || gender === 'UNKNOWN') && text.gender) {
    gender = text.gender.value
    facts.push(
      provenance(
        'gender',
        text.gender.value,
        sourceFromText(text.gender.source),
        text.gender.evidence,
        'EXPLICIT',
      ),
    )
  } else {
    facts.push(provenance('gender', gender ?? 'UNKNOWN', 'LISTSNEW_STRUCTURED_FIELD', null, 'NONE'))
  }

  return {
    hasChildren,
    maritalHistory,
    relationshipStatus,
    religion,
    occupation,
    gender,
    faceVerified: input.structuredFaceVerified,
    facts,
    textSignals: text.signals,
    dataConflicts,
  }
}
