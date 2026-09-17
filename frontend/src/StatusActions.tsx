import type { ReviewStatus } from '../../shared/types.ts'

const ACTIONS: { status: ReviewStatus; label: string; restore?: boolean }[] = [
  { status: 'PRESELECTED', label: 'Preselected' },
  { status: 'NEEDS_DETAIL', label: 'Needs detail' },
  { status: 'DISCARDED', label: 'Discard' },
  { status: 'UNREVIEWED', label: 'Restore', restore: true },
]

export function StatusActions({
  current,
  onMove,
}: {
  current: ReviewStatus
  onMove: (status: ReviewStatus, reason?: string) => void
}) {
  return (
    <div className="actions">
      {ACTIONS.filter((a) => a.status !== current).map((a) => (
        <button
          key={a.status}
          className={`btn ${a.status === 'DISCARDED' ? 'danger' : a.restore ? 'ghost' : ''}`}
          type="button"
          onClick={() => {
            const reason =
              a.status === 'DISCARDED'
                ? window.prompt('Discard reason (kept for audit):') ?? undefined
                : a.restore
                  ? 'Restored by user'
                  : undefined
            if (a.status === 'DISCARDED' && reason === undefined) return
            onMove(a.status, reason)
          }}
        >
          {a.label}
        </button>
      ))}
    </div>
  )
}
