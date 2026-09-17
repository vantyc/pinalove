import type { MaritalHistory, ReviewStatus, Tristate } from './types.ts'

export type ListsNewClassifyInput = {
  gender: string | null
  faceVerified: Tristate
  hasChildren: Tristate
  maritalHistory: MaritalHistory
  religion: string | null
  occupation: string | null
  dataConflict?: boolean
}

export type Classification = {
  status: Extract<ReviewStatus, 'PRESELECTED' | 'NEEDS_DETAIL' | 'DISCARDED' | 'UNREVIEWED'>
  reasons: string[]
  missingDetail: string[]
}

function missingReligion(religion: string | null): boolean {
  return religion == null || religion === '' || religion === 'UNKNOWN'
}

function genderIsWoman(gender: string | null): boolean {
  if (gender == null) return false
  const g = gender.trim().toLowerCase()
  return g === 'f' || g === 'female' || g === 'woman' || g === 'women'
}

function genderIsMan(gender: string | null): boolean {
  if (gender == null) return false
  const g = gender.trim().toLowerCase()
  return g === 'm' || g === 'male' || g === 'man' || g === 'men'
}

/**
 * Initial listsnew classification. Hard filters only.
 * UNKNOWN is never converted to NO. Gender/religion/marital are not inferred.
 */
export function classifyListsNewMatch(input: ListsNewClassifyInput): Classification {
  const missingDetail: string[] = []
  const discard: string[] = []

  if (genderIsMan(input.gender)) {
    discard.push('Not a woman (hard filter: looking for women)')
  } else if (!genderIsWoman(input.gender)) {
    missingDetail.push('gender (not present in listsnew; not inferred)')
  }

  if (input.faceVerified === 'YES') {
    // Photo Verified confirmed.
  } else if (input.faceVerified === 'NO') {
    discard.push('Photo Verified is required')
  } else {
    discard.push('Photo Verified is required and was not confirmed (listsnew faceverified is not 1)')
  }

  if (input.hasChildren === 'YES' && !input.dataConflict) {
    discard.push('Has children (requirement is no children)')
  } else if (input.hasChildren === 'UNKNOWN') {
    missingDetail.push('children')
  }

  if (input.maritalHistory === 'UNKNOWN') {
    missingDetail.push('marital status')
  } else if (input.maritalHistory !== 'NEVER_MARRIED' && !input.dataConflict) {
    discard.push(`Marital history is ${input.maritalHistory} (requirement is never married)`)
  }

  if (missingReligion(input.religion)) missingDetail.push('religion')
  if (input.occupation == null || input.occupation === '' || input.occupation === 'UNKNOWN') {
    missingDetail.push('occupation')
  }

  if (discard.length > 0) {
    return { status: 'DISCARDED', reasons: discard, missingDetail }
  }

  if (input.dataConflict) {
    return {
      status: 'NEEDS_DETAIL',
      reasons: ['Structured field conflicts with an explicit bio statement'],
      missingDetail,
    }
  }

  const hardFiltersConfirmed =
    input.faceVerified === 'YES' &&
    input.hasChildren === 'NO' &&
    input.maritalHistory === 'NEVER_MARRIED'

  if (hardFiltersConfirmed) {
    return {
      status: 'PRESELECTED',
      reasons: ['Photo Verified, no children, and never married are explicitly confirmed'],
      missingDetail,
    }
  }

  return {
    status: 'NEEDS_DETAIL',
    reasons: ['Hard filters not fully confirmed (Photo Verified + no children + never married)'],
    missingDetail,
  }
}
