import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { DecisionLog, Profile } from '../../shared/types.ts'
import { fetchHistory, fetchProfile, patchStatus } from './api'
import { FlagList, StatusPill } from './FlagList'
import { ProposedMessage } from './ProposedMessage'
import { ScorePanel } from './ScorePanel'
import { StatusActions } from './StatusActions'

export function ProfileDetailPage() {
  const { id } = useParams()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [history, setHistory] = useState<DecisionLog[]>([])
  const [error, setError] = useState<string | null>(null)

  async function load() {
    if (!id) return
    try {
      const [p, h] = await Promise.all([fetchProfile(id), fetchHistory(id)])
      setProfile(p)
      setHistory(h.history)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'load failed')
    }
  }

  useEffect(() => {
    void load()
  }, [id])

  if (error) return <p className="empty">{error}</p>
  if (!profile) return <p className="empty">Loading…</p>

  return (
    <section>
      <p>
        <Link to="/">← Dashboard</Link>
      </p>
      <div className="detail">
        <div>
          {profile.primaryPhotoUrl ? (
            <img src={profile.primaryPhotoUrl} alt="" />
          ) : (
            <div className="panel empty">No primary photo</div>
          )}
        </div>
        <div>
          <div className="page-head">
            <h1>{profile.username}</h1>
            <span className="score">{profile.score ?? '—'}</span>
          </div>
          <div className="meta">
            <span>{profile.age ?? '?'} yrs</span>
            <span>{[profile.location, profile.country].filter(Boolean).join(', ')}</span>
            {profile.distanceKm != null ? <span>{Math.round(profile.distanceKm)} km</span> : null}
            <StatusPill status={profile.reviewStatus} />
          </div>
          <div className="panel">
            <h2>Declared profile data</h2>
            <p>Relationship: {profile.relationshipStatus}</p>
            <p>Marital history: {profile.maritalHistory}</p>
            <p>Children: {profile.hasChildren}</p>
            <p>Wants children: {profile.wantsChildren}</p>
            <p>Religion: {profile.religion ?? 'UNKNOWN'}</p>
            <p>Practice: {profile.religionPracticeLevel}</p>
            <p>
              Verified: photos {profile.photoVerified ? 'yes' : 'no'} / profile{' '}
              {profile.profileVerified ? 'yes' : 'no'}
            </p>
            {profile.heightCm ? <p>Height: {profile.heightCm} cm</p> : null}
            {profile.headline ? <p>Headline: {profile.headline}</p> : null}
            {profile.bio ? <p>{profile.bio}</p> : null}
            <p className="legend">
              SINGLE is not treated as NEVER_MARRIED. UNKNOWN stays UNKNOWN.
            </p>
          </div>
          <div className="panel">
            <h2>System indicators</h2>
            <FlagList flags={profile.flags} />
            {profile.decisionReason ? <p>Decision note: {profile.decisionReason}</p> : null}
          </div>
          <ScorePanel score={profile.score} reasons={profile.scoreReasons} />
          <ProposedMessage profile={profile} />
          <div className="panel">
            <h2>Move</h2>
            <StatusActions
              current={profile.reviewStatus}
              onMove={async (status, reason) => {
                const next = await patchStatus(profile.id, status, reason)
                setProfile(next)
                const h = await fetchHistory(profile.id)
                setHistory(h.history)
              }}
            />
          </div>
          <div className="panel">
            <h2>Audit log</h2>
            {history.map((h) => (
              <p key={h.id} className="muted">
                {h.createdAt} · {h.source} · {h.previousStatus ?? '∅'} → {h.newStatus}
                {h.reason ? ` · ${h.reason}` : ''}
              </p>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
