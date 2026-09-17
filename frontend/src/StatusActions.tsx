import type { Profile, ReviewStatus } from '../../shared/types.ts'
import { confirmDiscard } from './discard.ts'

const ACTIONS: { status: ReviewStatus; label: string; restore?: boolean }[] = [
  { status: 'PRESELECTED', label: 'Preselected' },
  { status: 'NEEDS_DETAIL', label: 'Needs detail' },
  { status: 'DISCARDED', label: 'Discard' },
  { status: 'UNREVIEWED', label: 'Restore', restore: true },
]

export function StatusActions({
  current,
  profile,
  onMove,
  onDiscard,
  onRestore,
}: {
  current: ReviewStatus
  profile?: Profile
  onMove: (status: ReviewStatus, reason?: string) => void
  onDiscard?: () => void
  onRestore?: () => void
}) {
  return (
    <div className="actions">
      {ACTIONS.filter((a) => a.status !== current).map((a) => (
        <button
          key={a.status}
          className={`btn ${a.status === 'DISCARDED' ? 'danger' : a.restore ? 'ghost' : ''}`}
          type="button"
          onClick={() => {
            if (a.status === 'DISCARDED') {
              if (profile && !confirmDiscard(profile)) return
              if (onDiscard) {
                onDiscard()
                return
              }
              onMove('DISCARDED', 'Manual discard')
              return
            }
            if (a.restore) {
              if (onRestore) {
                onRestore()
                return
              }
              onMove('UNREVIEWED', 'Restored by user')
              return
            }
            onMove(a.status)
          }}
        >
          {a.label}
        </button>
      ))}
    </div>
  )
}
