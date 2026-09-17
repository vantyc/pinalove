import { useNavigate } from 'react-router-dom'
import type { Profile } from '../../shared/types.ts'
import { FlagList, StatusPill } from './FlagList'
import { ProbeDraft } from './ProbeDraft'
import { patchContact } from './api'

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

function distanceLabel(profile: Profile): string {
  if (profile.distanceDisplayKm != null) {
    const approx = profile.distanceTrust === 'TRUSTED' ? '' : ' ~'
    const trust = profile.distanceTrust === 'TRUSTED' ? '' : ' (untrusted as km)'
    return `${approx}${Math.round(profile.distanceDisplayKm)} km${trust}`
  }
  if (profile.distanceRaw != null) return `raw ${profile.distanceRaw} (not km)`
  return 'distance UNKNOWN'
}

function factProvenance(profile: Profile, field: string): string {
  if (profile.dataConflicts.some((c) => c.field === field)) return 'CONFLICT'
  const fact = profile.facts.find((f) => f.field === field)
  if (!fact) return 'UNKNOWN'
  if (fact.source === 'CONFLICT') return 'CONFLICT'
  if (fact.confidence === 'EXPLICIT') return 'EXPLICIT_BIO'
  if (fact.confidence === 'STRUCTURED') return 'STRUCTURED'
  return 'UNKNOWN'
}

function FactLine({ label, value, extra }: { label: string; value: string; extra?: string }) {
  return (
    <p className="meta">
      <strong>{label}</strong> {value}
      {extra ? <span className="muted"> · {extra}</span> : null}
    </p>
  )
}

export function ActionRequiredList({
  pendingInbound = [],
  replies = [],
  ready,
  stale,
  preselected,
  needsDetail,
  discarded,
  onProfileChange,
}: {
  pendingInbound?: Profile[]
  replies?: Profile[]
  ready: Profile[]
  stale: Profile[]
  preselected: Profile[]
  needsDetail: Profile[]
  discarded: Profile[]
  onProfileChange: (next: Profile) => void
}) {
  const navigate = useNavigate()
  return (
    <div>
      <h2>Action required</h2>
      <p className="muted">What needs attention, in order. Review first; contacting is optional and always manual.</p>
      {pendingInbound.length === 0 &&
      replies.length === 0 &&
      ready.length === 0 &&
      stale.length === 0 &&
      preselected.length === 0 &&
      needsDetail.length === 0 ? (
        <p className="empty">Nothing in the action queue.</p>
      ) : null}
      {pendingInbound.length > 0 ? (
        <section className="action-block">
          <h3>NEW INBOUND — REVIEW FIRST</h3>
          <p className="muted">
            Someone wrote to you. That is not the same as you wanting to continue. Decide here from the
            preview — this app never opens the conversation, never marks read, and never sends.
          </p>
          {pendingInbound.map((profile) => (
            <article className="card action-card" key={profile.id}>
              <div className="photo">
                {profile.primaryPhotoUrl ? (
                  <img src={profile.primaryPhotoUrl} alt="" />
                ) : (
                  <div className="photo-placeholder">No photo</div>
                )}
              </div>
              <div className="card-body">
                <div className="row">
                  <button className="username btn ghost" type="button" onClick={() => navigate(`/profiles/${profile.id}`)}>
                    {profile.username}
                  </button>
                  <StatusPill status={profile.reviewStatus} />
                  <span className="pill">PENDING INBOUND</span>
                </div>
                <div className="meta">
                  <span>{profile.age ?? '?'} yrs</span>
                  <span>{[profile.location, profile.country].filter(Boolean).join(', ') || 'Unknown location'}</span>
                  <span>Wrote: {formatActivity(profile.lastInboundAt)}</span>
                  {profile.inboundUnread ? <span>unread</span> : null}
                </div>
                {profile.lastInboundPreview ? (
                  <p className="message-box">{profile.lastInboundPreview}</p>
                ) : (
                  <p className="muted">No preview stored yet.</p>
                )}
                <div className="actions" style={{ marginTop: '0.7rem' }}>
                  <button
                    className="btn primary"
                    type="button"
                    onClick={() => {
                      void patchContact(profile.id, { action: 'interested' }).then(onProfileChange)
                    }}
                  >
                    INTERESTED
                  </button>
                  <button
                    className="btn"
                    type="button"
                    onClick={() => {
                      if (
                        !window.confirm(
                          'Discard this inbound locally? PinaLove will not be changed. The message stays for audit.',
                        )
                      ) {
                        return
                      }
                      void patchContact(profile.id, { action: 'discard' }).then(onProfileChange)
                    }}
                  >
                    DISCARD
                  </button>
                  <a className="btn" href={profile.profileUrl} target="_blank" rel="noreferrer">
                    OPEN PROFILE
                  </a>
                </div>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <p className="muted">NEW INBOUND — REVIEW FIRST — none waiting.</p>
      )}
      {replies.length > 0 ? (
        <section className="action-block">
          <h3>REPLIES / INBOX</h3>
          <p className="muted">Women who wrote to you — reply manually in PinaLove. This app never sends.</p>
          {replies.map((profile) => (
            <article className="card action-card" key={profile.id}>
              <div className="photo">
                {profile.primaryPhotoUrl ? (
                  <img src={profile.primaryPhotoUrl} alt="" />
                ) : (
                  <div className="photo-placeholder">No photo</div>
                )}
              </div>
              <div className="card-body">
                <div className="row">
                  <button className="username btn ghost" type="button" onClick={() => navigate(`/profiles/${profile.id}`)}>
                    {profile.username}
                  </button>
                  <StatusPill status={profile.reviewStatus} />
                  <span className="pill contact REPLIED">NEEDS REPLY</span>
                </div>
                <div className="meta">
                  <span>{profile.age ?? '?'} yrs</span>
                  <span>{[profile.location, profile.country].filter(Boolean).join(', ') || 'Unknown location'}</span>
                  <span>Wrote: {formatActivity(profile.lastInboundAt)}</span>
                  {profile.inboundUnread ? <span>unread</span> : null}
                </div>
                {profile.lastInboundPreview ? (
                  <p className="message-box">{profile.lastInboundPreview}</p>
                ) : (
                  <p className="muted">No preview stored yet.</p>
                )}
                <div className="actions" style={{ marginTop: '0.7rem' }}>
                  <a className="btn primary" href={profile.profileUrl} target="_blank" rel="noreferrer">
                    Open conversation
                  </a>
                  <button
                    className="btn"
                    type="button"
                    onClick={() => {
                      void patchContact(profile.id, { action: 'replied' }).then(onProfileChange)
                    }}
                  >
                    Mark replied
                  </button>
                  <button
                    className="btn"
                    type="button"
                    onClick={() => {
                      if (!window.confirm('Archive this thread locally? PinaLove will not be changed.')) return
                      void patchContact(profile.id, { action: 'archive' }).then(onProfileChange)
                    }}
                  >
                    Ignore / Archive
                  </button>
                </div>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <p className="muted">REPLIES / INBOX — none stored locally yet.</p>
      )}
      {stale.length > 0 ? (
        <section className="action-block">
          <h3>LOCAL PROBES</h3>
          <p className="muted">
            High local logistic value, stale account, photo verified. Probe is not a preselection.
            UNKNOWN children/marital are not failures.
          </p>
          {stale.map((profile) => (
            <article className="card action-card" key={profile.id}>
              <div className="photo">
                {profile.primaryPhotoUrl ? (
                  <img src={profile.primaryPhotoUrl} alt="" />
                ) : (
                  <div className="photo-placeholder">No photo</div>
                )}
              </div>
              <div className="card-body">
                <div className="row">
                  <button className="username btn ghost" type="button" onClick={() => navigate(`/profiles/${profile.id}`)}>
                    {profile.username}
                  </button>
                  <StatusPill status={profile.reviewStatus} />
                  <span className={`pill contact ${profile.contactStatus}`}>
                    {profile.contactStatus.replaceAll('_', ' ')}
                  </span>
                </div>
                <div className="meta">
                  <span>{profile.age ?? '?'} yrs</span>
                  <span>{profile.location ?? 'UNKNOWN'}</span>
                  <span>{distanceLabel(profile)}</span>
                  <span>Last active: {formatActivity(profile.lastActivityAt)}</span>
                </div>
                <FactLine label="Photo Verified" value={profile.faceVerified === 'YES' ? 'YES' : profile.faceVerified} extra={factProvenance(profile, 'faceVerified')} />
                <FactLine
                  label="Children"
                  value={`${profile.hasChildren} (${factProvenance(profile, 'hasChildren')})`}
                  extra={profile.facts.find((f) => f.field === 'hasChildren')?.evidence ?? undefined}
                />
                <FactLine
                  label="Marital"
                  value={`${profile.maritalHistory} (${factProvenance(profile, 'maritalHistory')})`}
                  extra={profile.facts.find((f) => f.field === 'maritalHistory')?.evidence ?? undefined}
                />
                <p className="meta">
                  <strong>reviewStatus</strong> {profile.reviewStatus}
                  <span className="muted"> · contactStatus {profile.contactStatus}</span>
                </p>
                <p className="pill">{profile.priorityReasons.join(' · ') || 'HIGH LOCAL LOGISTIC VALUE'}</p>
                <p className="pill">{profile.uncertaintyReasons.join(' · ') || 'STALE ACCOUNT'}</p>
                <p className="muted">
                  {profile.activityCategory ?? 'activity UNKNOWN'} · logistic {profile.logisticPriority}
                </p>
                <FlagList flags={profile.flags.slice(0, 3)} />
                <ProbeDraft profile={profile} onChange={onProfileChange} title="Probe draft" />
              </div>
            </article>
          ))}
        </section>
      ) : (
        <p className="muted">LOCAL PROBES — none.</p>
      )}
      {ready.length > 0 ? (
        <section className="action-block">
          <h3>READY TO MESSAGE</h3>
          <p className="muted">
            These passed enough filters for you to review. Copy / Open / Mark as sent only if you
            decide to contact them. This app never sends.
          </p>
          {ready.map((profile) => (
            <article className="card action-card" key={profile.id}>
              <div className="photo">
                {profile.primaryPhotoUrl ? (
                  <img src={profile.primaryPhotoUrl} alt="" />
                ) : (
                  <div className="photo-placeholder">No photo</div>
                )}
              </div>
              <div className="card-body">
                <div className="row">
                  <button className="username btn ghost" type="button" onClick={() => navigate(`/profiles/${profile.id}`)}>
                    {profile.username}
                  </button>
                  <StatusPill status={profile.reviewStatus} />
                  <span className={`pill contact ${profile.contactStatus}`}>READY TO MESSAGE</span>
                </div>
                <div className="meta">
                  <span>{profile.age ?? '?'} yrs</span>
                  <span>{[profile.location, profile.country].filter(Boolean).join(', ') || 'Unknown location'}</span>
                  <span>Last active: {formatActivity(profile.lastActivityAt)}</span>
                </div>
                <FactLine label="Photo Verified" value={profile.faceVerified} extra={factProvenance(profile, 'faceVerified')} />
                <FactLine label="Children" value={profile.hasChildren} extra={factProvenance(profile, 'hasChildren')} />
                <FactLine label="Marital" value={profile.maritalHistory} extra={factProvenance(profile, 'maritalHistory')} />
                <ProbeDraft profile={profile} onChange={onProfileChange} title="Message draft" />
              </div>
            </article>
          ))}
        </section>
      ) : (
        <p className="muted">READY TO MESSAGE — none.</p>
      )}
      {preselected.length > 0 ? (
        <section className="action-block">
          <h3>2. Preselected — decision / contact</h3>
          {preselected.map((profile) => (
            <div className="list-row" key={profile.id}>
              {profile.primaryPhotoUrl ? <img src={profile.primaryPhotoUrl} alt="" /> : <div />}
              <div>
                <strong>{profile.username}</strong>
                <div className="meta">
                  <span>{profile.age ?? '?'} yrs</span>
                  <span>{[profile.location, profile.country].filter(Boolean).join(', ')}</span>
                  <StatusPill status={profile.reviewStatus} />
                </div>
              </div>
              <button className="btn primary" type="button" onClick={() => navigate(`/profiles/${profile.id}`)}>
                Review
              </button>
            </div>
          ))}
        </section>
      ) : null}
      {needsDetail.length > 0 ? (
        <section className="action-block">
          <h3>3. Needs detail</h3>
          <p className="muted">{needsDetail.length} profiles still have UNKNOWN hard fields. Score withheld.</p>
          {needsDetail.slice(0, 8).map((profile) => (
            <div className="list-row" key={profile.id}>
              {profile.primaryPhotoUrl ? <img src={profile.primaryPhotoUrl} alt="" /> : <div />}
              <div>
                <strong>{profile.username}</strong>
                <div className="meta">
                  <span>{[profile.location, profile.country].filter(Boolean).join(', ')}</span>
                  <span>Needs: {profile.missingDetail.slice(0, 3).join(', ')}</span>
                </div>
              </div>
              <button className="btn" type="button" onClick={() => navigate(`/profiles/${profile.id}`)}>
                Review
              </button>
            </div>
          ))}
        </section>
      ) : null}
      <section className="action-block">
        <h3>4. Discarded (audit only)</h3>
        {discarded.length === 0 ? (
          <p className="muted">None discarded.</p>
        ) : (
          discarded.map((profile) => (
            <div className="list-row" key={profile.id}>
              {profile.primaryPhotoUrl ? <img src={profile.primaryPhotoUrl} alt="" /> : <div />}
              <div>
                <strong>{profile.username}</strong>
                <div className="meta">
                  <span>{[profile.location, profile.country].filter(Boolean).join(', ')}</span>
                  <StatusPill status={profile.reviewStatus} />
                  <span>{profile.decisionReason ?? profile.classificationReasons[0] ?? 'discarded'}</span>
                </div>
              </div>
              <button className="btn" type="button" onClick={() => navigate(`/profiles/${profile.id}`)}>
                Open
              </button>
            </div>
          ))
        )}
      </section>
    </div>
  )
}
