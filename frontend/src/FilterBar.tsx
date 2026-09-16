import type { FilterShortcut, ProfileFilters } from '../../shared/types.ts'

const SHORTCUTS: { id: FilterShortcut; label: string }[] = [
  { id: 'mexico', label: 'Mexico' },
  { id: 'cdmx', label: 'CDMX' },
  { id: 'no-children', label: 'No children' },
  { id: 'never-married', label: 'Never married' },
  { id: 'verified', label: 'Verified' },
  { id: 'needs-review', label: 'Needs review' },
  { id: 'high-score', label: 'High score' },
]

export function FilterBar({
  value,
  onChange,
}: {
  value: ProfileFilters
  onChange: (next: ProfileFilters) => void
}) {
  const set = (patch: Partial<ProfileFilters>) => onChange({ ...value, ...patch })
  return (
    <div className="filters">
      {SHORTCUTS.map((s) => (
        <button
          key={s.id}
          type="button"
          className={`chip ${value.shortcut === s.id ? 'active' : ''}`}
          onClick={() => set({ shortcut: value.shortcut === s.id ? undefined : s.id })}
        >
          {s.label}
        </button>
      ))}
      <input
        placeholder="Search"
        value={value.search ?? ''}
        onChange={(e) => set({ search: e.target.value || undefined })}
      />
      <input
        type="number"
        placeholder="Age min"
        value={value.ageMin ?? ''}
        onChange={(e) => set({ ageMin: e.target.value ? Number(e.target.value) : undefined })}
      />
      <input
        type="number"
        placeholder="Age max"
        value={value.ageMax ?? ''}
        onChange={(e) => set({ ageMax: e.target.value ? Number(e.target.value) : undefined })}
      />
      <input
        placeholder="Country"
        value={value.country ?? ''}
        onChange={(e) => set({ country: e.target.value || undefined })}
      />
      <input
        placeholder="Location"
        value={value.location ?? ''}
        onChange={(e) => set({ location: e.target.value || undefined })}
      />
      <input
        type="number"
        placeholder="Max km"
        value={value.distanceMax ?? ''}
        onChange={(e) =>
          set({ distanceMax: e.target.value ? Number(e.target.value) : undefined })
        }
      />
      <select
        value={value.hasChildren ?? ''}
        onChange={(e) =>
          set({ hasChildren: (e.target.value || undefined) as ProfileFilters['hasChildren'] })
        }
      >
        <option value="">Children</option>
        <option value="NO">No</option>
        <option value="YES">Yes</option>
        <option value="UNKNOWN">Unknown</option>
      </select>
      <select
        value={value.maritalHistory ?? ''}
        onChange={(e) =>
          set({
            maritalHistory: (e.target.value || undefined) as ProfileFilters['maritalHistory'],
          })
        }
      >
        <option value="">Marital history</option>
        <option value="NEVER_MARRIED">Never married</option>
        <option value="SEPARATED">Separated</option>
        <option value="DIVORCED">Divorced</option>
        <option value="WIDOWED">Widowed</option>
        <option value="UNKNOWN">Unknown</option>
      </select>
      <select
        value={value.relationshipStatus ?? ''}
        onChange={(e) =>
          set({
            relationshipStatus: (e.target.value ||
              undefined) as ProfileFilters['relationshipStatus'],
          })
        }
      >
        <option value="">Relationship</option>
        <option value="SINGLE">Single</option>
        <option value="IN_RELATIONSHIP">In relationship</option>
        <option value="SEPARATED">Separated</option>
        <option value="UNKNOWN">Unknown</option>
      </select>
      <input
        placeholder="Religion"
        value={value.religion ?? ''}
        onChange={(e) => set({ religion: e.target.value || undefined })}
      />
      <select
        value={value.verified == null ? '' : String(value.verified)}
        onChange={(e) =>
          set({
            verified: e.target.value === '' ? undefined : e.target.value === 'true',
          })
        }
      >
        <option value="">Verified</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
      <input
        type="number"
        placeholder="Score min"
        value={value.scoreMin ?? ''}
        onChange={(e) => set({ scoreMin: e.target.value ? Number(e.target.value) : undefined })}
      />
      <input
        type="number"
        placeholder="Score max"
        value={value.scoreMax ?? ''}
        onChange={(e) => set({ scoreMax: e.target.value ? Number(e.target.value) : undefined })}
      />
    </div>
  )
}
