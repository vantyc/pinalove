import type { DataConflict, Profile, ProvenanceRecord } from '../../shared/types.ts'
import { decodeProfileText } from '../../shared/localEnrichment.ts'

type ProvenanceKind = 'Structured' | 'Explicit bio' | 'Unknown' | 'Conflict'

function sourceKind(fact: ProvenanceRecord): ProvenanceKind {
  if (fact.source === 'CONFLICT') return 'Conflict'
  if (fact.confidence === 'EXPLICIT' && (fact.source === 'HEADLINE' || fact.source === 'DESCRIPTION')) {
    return 'Explicit bio'
  }
  if (fact.source === 'LISTSNEW_STRUCTURED_FIELD' && fact.confidence === 'STRUCTURED') return 'Structured'
  return 'Unknown'
}

function kindsFor(facts: ProvenanceRecord[], conflict?: DataConflict): ProvenanceKind[] {
  if (conflict) return ['Conflict']
  const kinds = facts.map(sourceKind)
  const unique = [...new Set(kinds)]
  return unique.length > 0 ? unique : ['Unknown']
}

function pillClass(kind: ProvenanceKind): string {
  if (kind === 'Structured') return 'structured'
  if (kind === 'Explicit bio') return 'explicit'
  if (kind === 'Conflict') return 'conflict'
  return 'unknown'
}

function FactRow({
  label,
  value,
  facts,
  conflict,
}: {
  label: string
  value: string
  facts: ProvenanceRecord[]
  conflict?: DataConflict
}) {
  const kinds = kindsFor(facts, conflict)
  const evidence: string[] = []
  if (conflict) {
    evidence.push(
      `structured ${String(conflict.structuredEvidence ?? conflict.structuredValue)} vs bio “${conflict.textEvidence}”`,
    )
  } else {
    for (const fact of facts) {
      if (fact.evidence) evidence.push(fact.evidence)
    }
  }
  return (
    <div className="fact-row">
      <div className="fact-main">
        <strong>{label}</strong>
        <span>{value}</span>
        {kinds.map((kind) => (
          <span key={kind} className={`pill provenance ${pillClass(kind)}`}>
            {kind}
          </span>
        ))}
      </div>
      {evidence.map((item) => (
        <p key={item} className="fact-evidence">
          “{item}”
        </p>
      ))}
    </div>
  )
}

export function FactsPanel({ profile }: { profile: Profile }) {
  const facts = profile.facts ?? []
  const dataConflicts = profile.dataConflicts ?? []
  const conflictFor = (field: string) => dataConflicts.find((c) => c.field === field)
  const forField = (field: string) => facts.filter((f) => f.field === field)

  return (
    <div className="panel">
      <h2>Facts</h2>
      <FactRow
        label="Children"
        value={profile.hasChildren}
        facts={forField('hasChildren')}
        conflict={conflictFor('hasChildren')}
      />
      <FactRow
        label="Marital status"
        value={profile.maritalHistory}
        facts={forField('maritalHistory')}
        conflict={conflictFor('maritalHistory')}
      />
      <FactRow label="Religion" value={profile.religion ?? 'UNKNOWN'} facts={forField('religion')} />
      <FactRow label="Occupation" value={profile.occupation ?? 'UNKNOWN'} facts={forField('occupation')} />
      <FactRow label="Photo verified" value={profile.faceVerified} facts={forField('faceVerified')} />
      {profile.textSignals.length > 0 ? (
        <div className="legend">
          Text signals (not facts):{' '}
          {profile.textSignals.map((s) => `${s.code} (“${s.evidence}”)`).join(' · ')}
        </div>
      ) : null}
    </div>
  )
}

export function BioPanel({ profile }: { profile: Profile }) {
  const headline = decodeProfileText(profile.headline)
  const bio = decodeProfileText(profile.bio)
  return (
    <div className="panel">
      <h2>Headline and description</h2>
      {headline ? <p>{headline}</p> : <p className="muted">No headline</p>}
      {bio ? <p>{bio}</p> : <p className="muted">No description</p>}
      <p className="legend">SINGLE is not treated as NEVER_MARRIED. UNKNOWN stays UNKNOWN.</p>
    </div>
  )
}
