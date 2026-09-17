import type { Profile } from '../../shared/types.ts'
import { scoreShouldBeWithheld } from '../../shared/workflow.ts'
import { patchContact } from './api'

const SENT_CONFIRMATION = 'Confirm that you manually sent this message on PinaLove.'

export function ProbeDraft({
  profile,
  onChange,
  title = 'Message draft',
}: {
  profile: Profile
  onChange: (next: Profile) => void
  title?: string
}) {
  const draft = profile.draftMessage
  if (!draft) return null
  const sent = profile.contactStatus === 'PROBE_SENT'
  const terminal = profile.contactStatus === 'REPLIED' || profile.contactStatus === 'NO_RESPONSE'

  async function copy() {
    await navigator.clipboard.writeText(draft ?? '')
  }

  async function markSent() {
    if (!window.confirm(SENT_CONFIRMATION)) return
    const next = await patchContact(profile.id, { action: 'mark-sent' })
    onChange(next)
  }

  async function markOutcome(action: 'replied' | 'no-response') {
    const next = await patchContact(profile.id, { action })
    onChange(next)
  }

  return (
    <div className="panel">
      <h2>{title}</h2>
      <p className="kind">DRAFT ONLY — NOT SENT BY THIS APP</p>
      {sent ? (
        <p className="muted">Marked as sent at {profile.manuallySentAt}. This app did not send it.</p>
      ) : null}
      {terminal ? <p className="muted">Human outcome: {profile.contactStatus.replaceAll('_', ' ')}</p> : null}
      <div className="message-box">{draft}</div>
      <div className="actions" style={{ marginTop: '0.7rem' }}>
        <button className="btn primary" type="button" onClick={() => void copy()}>
          Copy message
        </button>
        <a className="btn" href={profile.profileUrl} target="_blank" rel="noreferrer">
          Open profile
        </a>
        {sent || terminal ? null : (
          <button className="btn" type="button" onClick={() => void markSent()}>
            Mark as sent
          </button>
        )}
        {sent && !terminal ? (
          <>
            <button className="btn" type="button" onClick={() => void markOutcome('replied')}>
              REPLIED
            </button>
            <button className="btn" type="button" onClick={() => void markOutcome('no-response')}>
              NO_RESPONSE
            </button>
          </>
        ) : null}
      </div>
    </div>
  )
}

export function ScoreOrWithheld({ profile }: { profile: Profile }) {
  if (
    scoreShouldBeWithheld({
      reviewStatus: profile.reviewStatus,
      hasChildren: profile.hasChildren,
      maritalHistory: profile.maritalHistory,
      contactStatus: profile.contactStatus,
    })
  ) {
    return <span className="score muted">Score withheld</span>
  }
  return <span className="score">{profile.score ?? '—'}</span>
}
