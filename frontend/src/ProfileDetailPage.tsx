import { useEffect, useState } from 'react'
import { Link, useOutletContext, useParams } from 'react-router-dom'
import type { DecisionLog, Profile } from '../../shared/types.ts'
import { fetchHistory, fetchProfile, patchContact, patchStatus } from './api'
import type { ShellContext } from './AppShell'
import { FactsPanel, BioPanel } from './FactsPanel'
import { FlagList, StatusPill } from './FlagList'
import { ScorePanel } from './ScorePanel'
import { StatusActions } from './StatusActions'
import { scoreShouldBeWithheld } from '../../shared/workflow.ts'
import { ProbeDraft, ScoreOrWithheld } from './ProbeDraft'

export function ProfileDetailPage() {
  const { id } = useParams()
  const { refreshStats } = useOutletContext<ShellContext>()
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
            <ScoreOrWithheld profile={profile} />
          </div>
          <div className="meta">
            <span>{profile.age ?? '?'} yrs</span>
            <span>{[profile.location, profile.country].filter(Boolean).join(', ')}</span>
            {profile.distanceDisplayKm != null ? (
              <span>
                {profile.distanceTrust === 'TRUSTED' ? '' : '~'}
                {Math.round(profile.distanceDisplayKm)} km
                {profile.distanceTrust === 'UNTRUSTED' ? ' (untrusted)' : ''}
              </span>
            ) : null}
            <StatusPill status={profile.reviewStatus} />
            {profile.contactStatus !== 'NONE' ? (
              <span className={`pill contact ${profile.contactStatus}`}>{profile.contactStatus.replaceAll('_', ' ')}</span>
            ) : null}
          </div>
          <p>
            <a className="btn primary" href={profile.profileUrl} target="_blank" rel="noreferrer">
              Open profile
            </a>
          </p>
          {profile.reviewStatus === 'NEEDS_DETAIL' ? (
            <div className="panel">
              <h2>Still needs verification</h2>
              {profile.classificationReasons.length > 0 ? (
                <ul className="reasons">
                  {profile.classificationReasons.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
              {profile.missingDetail.length > 0 ? (
                <>
                  <p className="legend">Fields still UNKNOWN:</p>
                  <ul className="reasons">
                    {profile.missingDetail.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="muted">No remaining UNKNOWN fields recorded.</p>
              )}
            </div>
          ) : null}
          {profile.reviewStatus === 'DISCARDED' ? (
            <div className="panel">
              <h2>Discarded</h2>
              <p>{profile.decisionReason ?? 'No reason recorded'}</p>
            </div>
          ) : null}
          <ProbeDraft profile={profile} onChange={setProfile} />
          <FactsPanel profile={profile} />
          <BioPanel profile={profile} />
          <div className="panel">
            <h2>System indicators</h2>
            <FlagList flags={profile.flags} />
            {profile.decisionReason ? <p>Decision note: {profile.decisionReason}</p> : null}
          </div>
          <ScorePanel
            score={profile.score}
            reasons={profile.scoreReasons}
            withheld={scoreShouldBeWithheld({
              reviewStatus: profile.reviewStatus,
              hasChildren: profile.hasChildren,
              maritalHistory: profile.maritalHistory,
              contactStatus: profile.contactStatus,
            })}
          />
          <div className="panel">
            <h2>Move</h2>
            <StatusActions
              current={profile.reviewStatus}
              profile={profile}
              onMove={async (status, reason) => {
                const next = await patchStatus(profile.id, status, reason)
                setProfile(next)
                const h = await fetchHistory(profile.id)
                setHistory(h.history)
                await refreshStats()
              }}
              onDiscard={async () => {
                const next = await patchContact(profile.id, { action: 'discard' })
                setProfile(next)
                const h = await fetchHistory(profile.id)
                setHistory(h.history)
                await refreshStats()
              }}
              onRestore={async () => {
                const next = await patchContact(profile.id, { action: 'restore' })
                setProfile(next)
                const h = await fetchHistory(profile.id)
                setHistory(h.history)
                await refreshStats()
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
