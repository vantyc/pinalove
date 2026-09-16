import type { Profile } from '../../shared/types.ts'

export function ProposedMessage({ profile }: { profile: Profile }) {
  if (!profile.proposedMessage) {
    return (
      <div className="panel">
        <h2>Proposed message</h2>
        <p className="muted">
          No draft yet. A later analyzer may propose text here. There is no Auto Send.
        </p>
        <a className="btn primary" href={profile.profileUrl} target="_blank" rel="noreferrer">
          Open profile
        </a>
      </div>
    )
  }

  return (
    <div className="panel">
      <h2>Proposed message</h2>
      <p className="kind">Draft only — copy and send yourself. Never auto-sent.</p>
      <div className="message-box">{profile.proposedMessage}</div>
      <div className="actions" style={{ marginTop: '0.7rem' }}>
        <button
          className="btn primary"
          type="button"
          onClick={() => navigator.clipboard.writeText(profile.proposedMessage ?? '')}
        >
          Copy message
        </button>
        <a className="btn" href={profile.profileUrl} target="_blank" rel="noreferrer">
          Open profile
        </a>
      </div>
    </div>
  )
}
