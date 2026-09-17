import { useEffect, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import type { Profile, ProfileFilters, ReviewStatus } from '../../shared/types.ts'
import { fetchProfiles, patchStatus } from './api'
import type { ShellContext } from './AppShell'
import { FilterBar } from './FilterBar'
import { ProfileCard } from './ProfileCard'

export function ProfileGridPage({
  title,
  subtitle,
  fixedStatus,
  excludeDiscarded = false,
  dense = false,
}: {
  title: string
  subtitle: string
  fixedStatus?: ReviewStatus
  excludeDiscarded?: boolean
  dense?: boolean
}) {
  const navigate = useNavigate()
  const { refreshStats } = useOutletContext<ShellContext>()
  const [filters, setFilters] = useState<ProfileFilters>(
    fixedStatus ? { status: fixedStatus } : {},
  )
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  async function load(next = filters) {
    setError(null)
    const query = { ...next }
    if (fixedStatus) query.status = fixedStatus
    try {
      const data = await fetchProfiles(query)
      const list = excludeDiscarded
        ? data.profiles.filter((p) => p.reviewStatus !== 'DISCARDED')
        : data.profiles
      setProfiles(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'load failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load(filters)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when filter object identity changes via setFilters
  }, [filters, fixedStatus])

  async function onMove(id: string, status: ReviewStatus, reason?: string) {
    await patchStatus(id, status, reason)
    await load()
    await refreshStats()
  }

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>{title}</h1>
          <p className="muted">{subtitle}</p>
        </div>
        <span className="muted">{profiles.length} profiles</span>
      </div>
      <FilterBar value={filters} onChange={setFilters} />
      {error ? <p className="muted">{error}</p> : null}
      {loading ? <p className="empty">Loading…</p> : null}
      {!loading && profiles.length === 0 ? (
        <p className="empty">No profiles match these filters.</p>
      ) : null}
      <div className="grid">
        {profiles.map((p) => (
          <ProfileCard
            key={p.id}
            profile={p}
            dense={dense}
            onOpen={() => navigate(`/profiles/${p.id}`)}
            onMove={onMove}
          />
        ))}
      </div>
    </section>
  )
}
