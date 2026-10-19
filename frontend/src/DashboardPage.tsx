import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import type { Profile } from '../../shared/types.ts'
import { fetchProfiles } from './api'
import { messageQueueRank } from '../../shared/workflow.ts'
import { inVisualReviewQueue, matchesVisualAgeMax } from '../../shared/visualReview.ts'
import type { ShellContext } from './AppShell'
import { ActionRequiredList } from './ActionRequiredList'
import { ProfileGridPage } from './ProfileGridPage'

const VISUAL_AGE_MAX_KEY = 'pinalove.visualAgeMax'

function readVisualAgeMax(): number | undefined {
  try {
    const raw = localStorage.getItem(VISUAL_AGE_MAX_KEY)
    if (!raw) return undefined
    const n = Number(raw)
    return Number.isFinite(n) && n > 0 ? n : undefined
  } catch {
    return undefined
  }
}

export function DashboardPage() {
  const { stats, refreshStats } = useOutletContext<ShellContext>()
  const unknown = stats?.unknownByField
  const [all, setAll] = useState<Profile[]>([])
  const [visualAgeMax, setVisualAgeMax] = useState<number | undefined>(readVisualAgeMax)

  async function load() {
    const data = await fetchProfiles({})
    setAll(data.profiles)
  }

  useEffect(() => {
    void load()
  }, [])

  function changeVisualAgeMax(next: number | undefined) {
    setVisualAgeMax(next)
    try {
      if (next == null) localStorage.removeItem(VISUAL_AGE_MAX_KEY)
      else localStorage.setItem(VISUAL_AGE_MAX_KEY, String(next))
    } catch {
      /* ignore quota / private mode */
    }
  }

  const pendingInbound = all
    .filter(
      (p) =>
        p.inboundReviewStatus === 'PENDING' &&
        (p.lastInboundAt != null || p.inboundUnread) &&
        p.reviewStatus !== 'DISCARDED',
    )
    .sort((a, b) => {
      const ta = Date.parse(a.lastInboundAt ?? '') || 0
      const tb = Date.parse(b.lastInboundAt ?? '') || 0
      return tb - ta
    })
  const pendingIds = new Set(pendingInbound.map((p) => p.id))
  const visualPendingAll = all.filter((p) => inVisualReviewQueue(p))
  const visualIds = new Set(visualPendingAll.map((p) => p.id))
  const visualReview = visualPendingAll
    .filter((p) => matchesVisualAgeMax(p.age, visualAgeMax))
    .sort((a, b) => {
      const ta = Date.parse(a.lastSeenAt ?? a.createdAt ?? '') || 0
      const tb = Date.parse(b.lastSeenAt ?? b.createdAt ?? '') || 0
      return tb - ta
    })
  const replies = all
    .filter((p) => p.conversationNeedsReply && !pendingIds.has(p.id) && !visualIds.has(p.id))
    .sort((a, b) => {
      const ta = Date.parse(a.lastInboundAt ?? '') || 0
      const tb = Date.parse(b.lastInboundAt ?? '') || 0
      return tb - ta
    })
  const stale = all.filter(
    (p) =>
      p.contactStatus === 'STALE_LOCAL_PROBE' &&
      !p.conversationNeedsReply &&
      !pendingIds.has(p.id) &&
      !visualIds.has(p.id),
  )
  const ready = all
    .filter(
      (p) =>
        p.contactStatus === 'READY_TO_CONTACT' &&
        !p.conversationNeedsReply &&
        !pendingIds.has(p.id) &&
        !visualIds.has(p.id),
    )
    .sort((a, b) => {
      const ra = messageQueueRank(a) ?? 9
      const rb = messageQueueRank(b) ?? 9
      if (ra !== rb) return ra - rb
      return a.username.localeCompare(b.username)
    })
  const preselected = all.filter(
    (p) =>
      p.reviewStatus === 'PRESELECTED' &&
      !p.conversationNeedsReply &&
      !pendingIds.has(p.id) &&
      !visualIds.has(p.id) &&
      p.contactStatus !== 'READY_TO_CONTACT' &&
      p.contactStatus !== 'PROBE_SENT' &&
      p.contactStatus !== 'MESSAGE_SENT' &&
      p.contactStatus !== 'REPLIED',
  )
  const needsDetail = all.filter(
    (p) =>
      p.reviewStatus === 'NEEDS_DETAIL' &&
      !p.conversationNeedsReply &&
      !pendingIds.has(p.id) &&
      !visualIds.has(p.id) &&
      p.contactStatus !== 'STALE_LOCAL_PROBE' &&
      p.contactStatus !== 'READY_TO_CONTACT',
  )
  const discarded = all.filter((p) => p.reviewStatus === 'DISCARDED')

  return (
    <section>
      <div className="stats">
        <div className="stat">
          <strong>{stats?.actionRequired ?? '—'}</strong>
          <span>Action required</span>
        </div>
        <div className="stat">
          <strong>{stats?.visualReviewPending ?? '—'}</strong>
          <span>Visual review pending</span>
        </div>
        <div className="stat">
          <strong>{stats?.visuallyInterested ?? '—'}</strong>
          <span>Visually interested</span>
        </div>
        <div className="stat">
          <strong>{stats?.pendingInbound ?? '—'}</strong>
          <span>New inbound review</span>
        </div>
        <div className="stat">
          <strong>{stats?.needsReply ?? '—'}</strong>
          <span>Replies</span>
        </div>
        <div className="stat">
          <strong>{stats?.readyToContact ?? '—'}</strong>
          <span>Ready to message</span>
        </div>
        <div className="stat">
          <strong>{stats?.needsDetailActionable ?? '—'}</strong>
          <span>Needs detail</span>
        </div>
        <div className="stat">
          <strong>{stats?.discarded ?? '—'}</strong>
          <span>Discarded</span>
        </div>
      </div>
      {unknown ? (
        <p className="muted unknown-fields">
          UNKNOWN counts — children {unknown.children} · marital {unknown.maritalHistory} ·
          religion {unknown.religion} · occupation {unknown.occupation} · gender {unknown.gender} ·
          verified {unknown.photoVerified} · education {unknown.education}
        </p>
      ) : null}
      <ActionRequiredList
        visualReview={visualReview}
        visualAgeMax={visualAgeMax}
        onVisualAgeMaxChange={changeVisualAgeMax}
        pendingInbound={pendingInbound}
        replies={replies}
        ready={ready}
        stale={stale}
        preselected={preselected}
        needsDetail={needsDetail}
        discarded={discarded}
        onProfileChange={(next) => {
          setAll((prev) => prev.map((p) => (p.id === next.id ? next : p)))
          void refreshStats()
        }}
      />
      <ProfileGridPage
        title="All non-discarded"
        subtitle="Classification stays PRESELECTED / NEEDS_DETAIL / DISCARDED. Contact is a separate field. Distance raw is not scored as km."
        excludeDiscarded
      />
    </section>
  )
}
