import type { Profile, ReviewStatus, Tristate } from '../../shared/types.ts'
import { FlagList, StatusPill } from './FlagList'
import { StatusActions } from './StatusActions'

function formatActivity(iso: string | null): string {
  if (!iso) return 'UNKNOWN'
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return 'UNKNOWN'
  const days = Math.round((Date.now() - t) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return '1 day ago'
  if (days < 30) return `${days} days ago`
  const months = Math.round(days / 30)
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`
  const years = Math.round(days / 365)
  return `${years} year${years === 1 ? '' : 's'} ago`
}

function tri(label: string, value: Tristate | string | null): string {
  if (value == null || value === '') return `${label}: UNKNOWN`
  return `${label}: ${value}`
}

export function ProfileCard({
  profile,
  onOpen,
  onMove,
  dense = false,
}: {
  profile: Profile
  onOpen: () => void
  onMove: (id: string, status: ReviewStatus, reason?: string) => void
  dense?: boolean
}) {
  const reasons =
    profile.classificationReasons.length > 0
      ? profile.classificationReasons
      : profile.decisionReason
        ? [profile.decisionReason]
        : []
  const missing = profile.reviewStatus === 'NEEDS_DETAIL' ? profile.missingDetail : []

  return (
    <article className="card">
      <div className="photo">
        {profile.primaryPhotoUrl ? (
          <img src={profile.primaryPhotoUrl} alt="" />
        ) : (
          <div className="photo-placeholder">No photo</div>
        )}
      </div>
      <div className="card-body">
        <div className="row">
          <button className="username btn ghost" type="button" onClick={onOpen}>
            {profile.username}
          </button>
          <StatusPill status={profile.reviewStatus} />
          {profile.contactStatus !== 'NONE' ? (
            <span className={`pill contact ${profile.contactStatus}`}>
              {profile.contactStatus.replaceAll('_', ' ')}
            </span>
          ) : null}
        </div>
        <div className="meta">
          <span>{profile.age ?? '?'} yrs</span>
          <span>
            {[profile.location, profile.country].filter(Boolean).join(', ') || 'Unknown location'}
          </span>
        </div>
        <div className="meta">
          <span className="pill">{tri('Verified', profile.faceVerified)}</span>
          <span className="pill">{tri('Children', profile.hasChildren)}</span>
          <span className="pill">{tri('Wants children', profile.wantsChildren)}</span>
          <span className="pill">{tri('Education', profile.education)}</span>
          <span className="pill">Activity: {formatActivity(profile.lastActivityAt)}</span>
        </div>
        {reasons.length > 0 ? (
          <ul className="reasons">
            {reasons.slice(0, dense ? 2 : 4).map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        ) : null}
        {missing.length > 0 ? (
          <p className="muted">Needs: {missing.join(', ')}</p>
        ) : null}
        {profile.reviewStatus === 'DISCARDED' && profile.decisionReason ? (
          <p className="muted">Discarded: {profile.decisionReason}</p>
        ) : null}
        <FlagList flags={profile.flags.slice(0, dense ? 2 : 4)} />
        <div className="actions">
          <a className="btn primary" href={profile.profileUrl} target="_blank" rel="noreferrer">
            Open profile
          </a>
          <button className="btn" type="button" onClick={onOpen}>
            Review
          </button>
          <StatusActions
            current={profile.reviewStatus}
            onMove={(status, reason) => onMove(profile.id, status, reason)}
          />
        </div>
      </div>
    </article>
  )
}
