import type { ContactStatus, InboundReviewStatus, ReviewStatus, VisualReviewStatus } from './types.ts'

function hasContactEvidence(contactStatus: ContactStatus | null | undefined): boolean {
  return contactStatus === 'PROBE_SENT' || contactStatus === 'MESSAGE_SENT' || contactStatus === 'REPLIED'
}

export function visualReviewFromEvidence(input: {
  visualReviewStatus?: VisualReviewStatus | null
  reviewStatus?: ReviewStatus | null
  contactStatus?: ContactStatus | null
}): VisualReviewStatus {
  if (
    input.visualReviewStatus === 'INTERESTED' ||
    input.visualReviewStatus === 'DISCARDED' ||
    input.visualReviewStatus === 'PENDING'
  ) {
    return input.visualReviewStatus
  }
  if (hasContactEvidence(input.contactStatus)) return 'INTERESTED'
  if (input.reviewStatus === 'DISCARDED') return 'DISCARDED'
  return 'PENDING'
}

export function visualBlocksNormalWorkflow(
  visualReviewStatus: VisualReviewStatus | null | undefined,
): boolean {
  return visualReviewStatus === 'PENDING' || visualReviewStatus === 'DISCARDED'
}

export function isPendingInboundReview(input: {
  inboundReviewStatus?: InboundReviewStatus | null
  lastInboundAt?: string | null
  inboundUnread?: boolean
  reviewStatus?: ReviewStatus | null
}): boolean {
  if (input.reviewStatus === 'DISCARDED') return false
  if (input.inboundReviewStatus !== 'PENDING') return false
  return Boolean(input.lastInboundAt) || Boolean(input.inboundUnread)
}

/** VISUAL REVIEW queue. Inbound PENDING stays in NEW INBOUND, not here. */
export function inVisualReviewQueue(input: {
  visualReviewStatus?: VisualReviewStatus | null
  reviewStatus?: ReviewStatus | null
  inboundReviewStatus?: InboundReviewStatus | null
  lastInboundAt?: string | null
  inboundUnread?: boolean
}): boolean {
  if (input.visualReviewStatus !== 'PENDING') return false
  if (input.reviewStatus === 'DISCARDED') return false
  if (isPendingInboundReview(input)) return false
  return true
}

/**
 * UI age max for visual review. UNKNOWN age stays visible and is not treated as 0.
 * Does not mutate stored age.
 */
export function matchesVisualAgeMax(age: number | null | undefined, ageMax: number | null | undefined): boolean {
  if (ageMax == null) return true
  if (age == null) return true
  return age <= ageMax
}
