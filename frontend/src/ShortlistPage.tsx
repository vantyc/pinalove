import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Profile } from '../../shared/types.ts'
import { fetchProfiles, patchContact, patchStatus } from './api'
import { FlagList, StatusPill } from './FlagList'
import { ProposedMessage } from './ProposedMessage'
import { ScorePanel } from './ScorePanel'
import { StatusActions } from './StatusActions'

export function ShortlistPage() {
  const navigate = useNavigate()
  const [profiles, setProfiles] = useState<Profile[]>([])

  async function load() {
    const data = await fetchProfiles({ status: 'SHORTLISTED' })
    setProfiles(data.profiles)
  }

  useEffect(() => {
    void load()
  }, [])

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Shortlist</h1>
          <p className="muted">People you actually want to consider. Drafts are never auto-sent.</p>
        </div>
      </div>
      {profiles.length === 0 ? <p className="empty">Shortlist is empty.</p> : null}
      {profiles.map((p) => (
        <article key={p.id} className="panel">
          <div className="list-row" style={{ border: 0, background: 'transparent', padding: 0 }}>
            {p.primaryPhotoUrl ? (
              <img src={p.primaryPhotoUrl} alt="" />
            ) : (
              <div className="empty">No photo</div>
            )}
            <div>
              <button className="username btn ghost" type="button" onClick={() => navigate(`/profiles/${p.id}`)}>
                {p.username}
              </button>
              <div className="meta">
                <span>{p.age ?? '?'} yrs</span>
                <span>{[p.location, p.country].filter(Boolean).join(', ')}</span>
                <StatusPill status={p.reviewStatus} />
                <span className="score">score {p.score ?? '—'}</span>
              </div>
              {p.bio ? <p>{p.bio.slice(0, 280)}{p.bio.length > 280 ? '…' : ''}</p> : null}
              <FlagList flags={p.flags} />
            </div>
            <a className="btn primary" href={p.profileUrl} target="_blank" rel="noreferrer">
              Open profile
            </a>
          </div>
          <ScorePanel score={p.score} reasons={p.scoreReasons} />
          <ProposedMessage profile={p} />
          <StatusActions
            current={p.reviewStatus}
            profile={p}
            onMove={async (status, reason) => {
              await patchStatus(p.id, status, reason)
              await load()
            }}
            onDiscard={async () => {
              await patchContact(p.id, { action: 'discard' })
              await load()
            }}
            onRestore={async () => {
              await patchContact(p.id, { action: 'restore' })
              await load()
            }}
          />
          <p>
            <Link to={`/profiles/${p.id}`}>Full detail</Link>
          </p>
        </article>
      ))}
    </section>
  )
}
