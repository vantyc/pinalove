import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import type { Profile } from '../../shared/types.ts'
import { fetchProfiles } from './api'
import { messageQueueRank } from '../../shared/workflow.ts'
import type { ShellContext } from './AppShell'
import { ActionRequiredList } from './ActionRequiredList'
import { ProfileGridPage } from './ProfileGridPage'

export function DashboardPage() {
  const { stats, refreshStats } = useOutletContext<ShellContext>()
  const unknown = stats?.unknownByField
  const [all, setAll] = useState<Profile[]>([])

  async function load() {
    const data = await fetchProfiles({})
    setAll(data.profiles)
  }

  useEffect(() => {
    void load()
  }, [])

  const stale = all.filter((p) => p.contactStatus === 'STALE_LOCAL_PROBE')
  const ready = all
    .filter((p) => p.contactStatus === 'READY_TO_CONTACT')
    .sort((a, b) => {
      const ra = messageQueueRank(a) ?? 9
      const rb = messageQueueRank(b) ?? 9
      if (ra !== rb) return ra - rb
      return a.username.localeCompare(b.username)
    })
  const preselected = all.filter(
    (p) =>
      p.reviewStatus === 'PRESELECTED' &&
      p.contactStatus !== 'READY_TO_CONTACT' &&
      p.contactStatus !== 'PROBE_SENT' &&
      p.contactStatus !== 'REPLIED',
  )
  const needsDetail = all.filter(
    (p) =>
      p.reviewStatus === 'NEEDS_DETAIL' &&
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
          <strong>{stats?.readyToContact ?? '—'}</strong>
          <span>Ready to message</span>
        </div>
        <div className="stat">
          <strong>{stats?.staleLocalProbe ?? '—'}</strong>
          <span>Stale local probes</span>
        </div>
        <div className="stat">
          <strong>{stats?.preselected ?? '—'}</strong>
          <span>Preselected</span>
        </div>
        <div className="stat">
          <strong>{stats?.needsDetail ?? '—'}</strong>
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
