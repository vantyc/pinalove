import type { Profile } from '../../shared/types.ts'
import { FlagList, StatusPill } from './FlagList'
import { StatusActions } from './StatusActions'

export function ProfileCard({
  profile,
  onOpen,
  onMove,
  dense = false,
}: {
  profile: Profile
  onOpen: () => void
  onMove: (id: string, status: Profile['reviewStatus'], reason?: string) => void
  dense?: boolean
}) {
  return (
    <article className="card">
      <a className="photo" href={profile.profileUrl} target="_blank" rel="noreferrer">
        {profile.primaryPhotoUrl ? (
          <img src={profile.primaryPhotoUrl} alt="" />
        ) : (
          <div className="empty">No photo</div>
        )}
      </a>
      <div className="card-body">
        <div className="row">
          <button className="username btn ghost" type="button" onClick={onOpen}>
            {profile.username}
          </button>
          <span className="score">{profile.score ?? '—'}</span>
        </div>
        <div className="meta">
          <span>{profile.age ?? '?'} yrs</span>
          <span>
            {[profile.location, profile.country].filter(Boolean).join(', ') || 'Unknown location'}
          </span>
          {profile.distanceKm != null ? <span>{Math.round(profile.distanceKm)} km</span> : null}
        </div>
        <div className="meta">
          <span className="pill">Rel: {profile.relationshipStatus}</span>
          <span className="pill">Hist: {profile.maritalHistory}</span>
          <span className="pill">Children: {profile.hasChildren}</span>
          <span className="pill">{profile.religion ?? 'Religion UNKNOWN'}</span>
          {(profile.photoVerified || profile.profileVerified) && (
            <span className="pill">Verified</span>
          )}
          <StatusPill status={profile.reviewStatus} />
        </div>
        <FlagList flags={profile.flags.slice(0, dense ? 2 : 4)} />
        {profile.decisionReason ? (
          <p className="muted">{profile.decisionReason}</p>
        ) : null}
        <div className="actions">
          <a className="btn primary" href={profile.profileUrl} target="_blank" rel="noreferrer">
            Open profile
          </a>
          <StatusActions
            current={profile.reviewStatus}
            onMove={(status, reason) => onMove(profile.id, status, reason)}
          />
        </div>
      </div>
    </article>
  )
}
