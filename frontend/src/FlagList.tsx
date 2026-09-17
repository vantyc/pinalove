import { FLAG_LABELS } from '../../shared/types.ts'
import type { FlagCode, ReviewStatus } from '../../shared/types.ts'

export function FlagList({ flags }: { flags: FlagCode[] }) {
  if (!flags.length) return null
  return (
    <div className="meta">
      {flags.map((code) => (
        <span key={code} className="pill flag" title={FLAG_LABELS[code]}>
          {FLAG_LABELS[code]}
        </span>
      ))}
    </div>
  )
}

export function StatusPill({ status }: { status: ReviewStatus }) {
  return <span className={`pill status ${status}`}>{status.replaceAll('_', ' ')}</span>
}
