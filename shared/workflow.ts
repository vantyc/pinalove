import { isLocalMexico } from './geo.ts'
import { isStaleForLocalProbe } from './activity.ts'
import type { ContactStatus, LogisticPriority, ReviewStatus, Tristate } from './types.ts'

export type WorkflowInput = {
  reviewStatus: ReviewStatus
  contactStatus?: ContactStatus | null
  location: string | null
  country: string | null
  lastActivityAt: string | null
  faceVerified?: Tristate | null
  hasChildren?: Tristate | null
  now?: number
  /** Inbox-only rows must not enter READY/PROBE queues. */
  inboxOnly?: boolean
}

export type WorkflowAssignment = {
  contactStatus: ContactStatus
  logisticPriority: LogisticPriority
  stale: boolean
  local: boolean
  priorityReasons: string[]
  uncertaintyReasons: string[]
}

const TERMINAL_CONTACT: ReadonlySet<ContactStatus> = new Set([
  'PROBE_SENT',
  'MESSAGE_SENT',
  'REPLIED',
  'NO_RESPONSE',
])

function highLocal(local: boolean): LogisticPriority {
  return local ? 'HIGH_LOCAL' : 'NONE'
}

/**
 * Classification (PRESELECTED / NEEDS_DETAIL / DISCARDED) stays on reviewStatus.
 * Contact workflow is a separate field.
 * HIGH_LOCAL is logistic proximity, not a quality score.
 * Local + stale (>=180d) + photo verified becomes STALE_LOCAL_PROBE, never DISCARDED here.
 * UNKNOWN children/marital do not block the probe.
 */
export function assignContact(input: WorkflowInput): WorkflowAssignment {
  const local = isLocalMexico({ location: input.location, country: input.country })
  const stale = isStaleForLocalProbe(input.lastActivityAt, input.now)
  const photoYes = input.faceVerified === 'YES'
  const priorityReasons: string[] = []
  const uncertaintyReasons: string[] = []
  if (local) priorityReasons.push('HIGH LOCAL LOGISTIC VALUE')
  if (stale) uncertaintyReasons.push('STALE ACCOUNT')

  const previous = input.contactStatus ?? 'NONE'
  if (TERMINAL_CONTACT.has(previous)) {
    return {
      contactStatus: previous,
      logisticPriority: highLocal(local),
      stale,
      local,
      priorityReasons,
      uncertaintyReasons,
    }
  }

  if (input.inboxOnly) {
    return {
      contactStatus: 'NONE',
      logisticPriority: highLocal(local),
      stale,
      local,
      priorityReasons,
      uncertaintyReasons,
    }
  }

  if (input.reviewStatus === 'DISCARDED') {
    return {
      contactStatus: 'NONE',
      logisticPriority: highLocal(local),
      stale,
      local,
      priorityReasons,
      uncertaintyReasons,
    }
  }

  if (local && stale && photoYes) {
    return {
      contactStatus: 'STALE_LOCAL_PROBE',
      logisticPriority: 'HIGH_LOCAL',
      stale: true,
      local: true,
      priorityReasons,
      uncertaintyReasons,
    }
  }

  if (input.reviewStatus === 'PRESELECTED') {
    return {
      contactStatus: 'READY_TO_CONTACT',
      logisticPriority: highLocal(local),
      stale,
      local,
      priorityReasons,
      uncertaintyReasons,
    }
  }

  if (photoYes && input.hasChildren === 'NO') {
    return {
      contactStatus: 'READY_TO_CONTACT',
      logisticPriority: highLocal(local),
      stale,
      local,
      priorityReasons,
      uncertaintyReasons,
    }
  }

  return {
    contactStatus: 'READY_TO_CONTACT',
    logisticPriority: highLocal(local),
    stale,
    local,
    priorityReasons,
    uncertaintyReasons,
  }
}

/**
 * Inbox needs a human reply when the latest inbound is after the last known outbound.
 * Does not send. Does not invent REPLIED.
 */
export function conversationNeedsReply(input: {
  lastInboundAt: string | null
  lastOutboundAt?: string | null
  manuallySentAt?: string | null
}): boolean {
  if (!input.lastInboundAt) return false
  const inbound = Date.parse(input.lastInboundAt)
  if (Number.isNaN(inbound)) return false
  const outboundRaw = input.lastOutboundAt ?? input.manuallySentAt ?? null
  if (!outboundRaw) return true
  const outbound = Date.parse(outboundRaw)
  if (Number.isNaN(outbound)) return true
  return inbound > outbound
}

/** Dashboard order: new inbound review, replies, probes, ready, needs detail, discarded. */
export function dashboardSectionRank(input: {
  inboundReviewStatus?: string | null
  lastInboundAt?: string | null
  inboundUnread?: boolean
  conversationNeedsReply?: boolean
  contactStatus: ContactStatus
  reviewStatus: ReviewStatus
}): 1 | 2 | 3 | 4 | 5 | 6 | null {
  if (input.inboundReviewStatus === 'PENDING' && (input.lastInboundAt || input.inboundUnread)) return 1
  if (input.conversationNeedsReply) return 2
  if (input.contactStatus === 'STALE_LOCAL_PROBE') return 3
  if (input.contactStatus === 'READY_TO_CONTACT') return 4
  if (input.reviewStatus === 'NEEDS_DETAIL') return 5
  if (input.reviewStatus === 'DISCARDED') return 6
  return null
}

/** 1 = PRESELECTED, 2 = photo verified + children NO, 3 = other ready matches. */
export function messageQueueRank(input: {
  contactStatus: ContactStatus
  reviewStatus: ReviewStatus
  faceVerified?: Tristate | null
  hasChildren?: Tristate | null
}): 1 | 2 | 3 | null {
  if (input.contactStatus !== 'READY_TO_CONTACT') return null
  if (input.reviewStatus === 'PRESELECTED') return 1
  if (input.faceVerified === 'YES' && input.hasChildren === 'NO') return 2
  return 3
}

/** Short activity check. Does not mention staleness, login dates, kids, marital, or religion. */
export function generateStaleProbeDraft(location: string | null): string {
  const raw = (location ?? '').trim()
  const city = raw.split(',')[0]?.trim() || 'Mexico City'
  if (/\b(unknown|stale|logged|inactive)\b/i.test(city)) {
    return `Hi 🙂 I noticed you're in Mexico City too. Are you still using this app?`
  }
  return `Hi 🙂 I noticed you're in ${city} too. Are you still using this app?`
}

export function scoreShouldBeWithheld(input: {
  reviewStatus: ReviewStatus
  hasChildren: string
  maritalHistory: string
  contactStatus?: ContactStatus | null
}): boolean {
  if (input.contactStatus === 'STALE_LOCAL_PROBE') return true
  if (input.reviewStatus === 'NEEDS_DETAIL') return true
  if (input.hasChildren === 'UNKNOWN' || input.maritalHistory === 'UNKNOWN') return true
  return false
}
