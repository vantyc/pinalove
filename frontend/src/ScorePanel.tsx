import type { ScoreReason } from '../../shared/types.ts'

export function ScorePanel({ score, reasons }: { score: number | null; reasons: ScoreReason[] }) {
  return (
    <div className="panel">
      <h2>Score {score ?? '—'}</h2>
      <p className="legend">
        Explanations are not facts. Declared = profile field. Inferred = system interpretation.
      </p>
      {reasons.map((r, i) => (
        <div className="reason" key={`${r.code}-${i}`}>
          <span>{r.direction === 'plus' ? '+' : '−'}</span>
          <span>
            {r.message} <span className="kind">{r.kind}</span>
          </span>
          <span className="pts">{r.points > 0 ? `+${r.points}` : r.points}</span>
        </div>
      ))}
    </div>
  )
}
