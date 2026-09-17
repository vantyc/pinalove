import type { Profile } from '../../shared/types.ts'
import { scoreShouldBeWithheld } from '../../shared/workflow.ts'
import { confirmDiscard } from './discard.ts'
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
  const discarded = profile.reviewStatus === 'DISCARDED'
  const draft = profile.draftMessage
  const sent = profile.contactStatus === 'PROBE_SENT' || profile.contactStatus === 'MESSAGE_SENT'
  const terminal = profile.contactStatus === 'REPLIED' || profile.contactStatus === 'NO_RESPONSE'
  const actionable = !discarded

  async function copy() {
    if (!draft) return
    await navigator.clipboard.writeText(draft)
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

  async function discard() {
    if (!confirmDiscard(profile)) return
    const next = await patchContact(profile.id, { action: 'discard' })
    onChange(next)
  }

  if (discarded && !draft) return null

  return (
    <div className="panel">
      {draft ? (
        <>
          <h2>{title}</h2>
          <p className="kind">DRAFT ONLY — NOT SENT BY THIS APP</p>
          {sent ? (
            <p className="muted">Marked as sent at {profile.manuallySentAt}. This app did not send it.</p>
          ) : null}
          {terminal ? <p className="muted">Human outcome: {profile.contactStatus.replaceAll('_', ' ')}</p> : null}
          <div className="message-box">{draft}</div>
        </>
      ) : null}
      {actionable ? (
        <div className="actions" style={{ marginTop: '0.7rem' }}>
          <button className="btn danger" type="button" onClick={() => void discard()}>
            Discard
          </button>
          {draft ? (
            <button className="btn primary" type="button" onClick={() => void copy()}>
              Copy message
            </button>
          ) : null}
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
      ) : null}
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
