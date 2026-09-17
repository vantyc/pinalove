import type {
  DashboardStats,
  Decision,
  DecisionLog,
  Profile,
  ProfileFilters,
  ReviewStatus,
  RuleConfig,
} from '../../shared/types.ts'

const API = '/pinalove/api'

async function parse<T>(res: Response | Promise<Response>): Promise<T> {
  const resolved = await res
  if (!resolved.ok) {
    const text = await resolved.text()
    throw new Error(text || `${resolved.status} ${resolved.statusText}`)
  }
  return resolved.json() as Promise<T>
}

export function filtersToQuery(filters: ProfileFilters): string {
  const q = new URLSearchParams()
  if (filters.ageMin != null) q.set('ageMin', String(filters.ageMin))
  if (filters.ageMax != null) q.set('ageMax', String(filters.ageMax))
  if (filters.country) q.set('country', filters.country)
  if (filters.location) q.set('location', filters.location)
  if (filters.distanceMax != null) q.set('distanceMax', String(filters.distanceMax))
  if (filters.hasChildren) q.set('hasChildren', filters.hasChildren)
  if (filters.relationshipStatus) q.set('relationshipStatus', filters.relationshipStatus)
  if (filters.maritalHistory) q.set('maritalHistory', filters.maritalHistory)
  if (filters.religion) q.set('religion', filters.religion)
  if (filters.verified != null) q.set('verified', String(filters.verified))
  if (filters.scoreMin != null) q.set('scoreMin', String(filters.scoreMin))
  if (filters.scoreMax != null) q.set('scoreMax', String(filters.scoreMax))
  if (filters.status) {
    q.set('status', Array.isArray(filters.status) ? filters.status.join(',') : filters.status)
  }
  if (filters.contactStatus) {
    q.set(
      'contactStatus',
      Array.isArray(filters.contactStatus) ? filters.contactStatus.join(',') : filters.contactStatus,
    )
  }
  if (filters.flags?.length) q.set('flags', filters.flags.join(','))
  if (filters.shortcut) q.set('shortcut', filters.shortcut)
  if (filters.search) q.set('search', filters.search)
  return q.toString()
}

export function fetchSession() {
  return parse<{ user: string | null }>(fetch(`${API}/session`))
}

export function fetchProfiles(filters: ProfileFilters = {}) {
  const qs = filtersToQuery(filters)
  return parse<{ profiles: Profile[]; total: number }>(
    fetch(`${API}/profiles${qs ? `?${qs}` : ''}`),
  )
}

export function fetchProfile(id: string) {
  return parse<Profile>(fetch(`${API}/profiles/${id}`))
}

export function fetchHistory(id: string) {
  return parse<{ history: DecisionLog[] }>(fetch(`${API}/profiles/${id}/history`))
}

export function fetchStats() {
  return parse<DashboardStats>(fetch(`${API}/dashboard/stats`))
}

export function patchContact(
  id: string,
  body: {
    action: 'mark-sent' | 'notes' | 'replied' | 'no-response' | 'discard' | 'restore' | 'archive'
    notes?: string | null
  },
) {
  return parse<Profile>(
    fetch(`${API}/profiles/${id}/contact`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

export function fetchRules() {
  return parse<RuleConfig>(fetch(`${API}/config/rules`))
}

export function patchStatus(id: string, status: ReviewStatus, reason?: string) {
  return parse<Profile>(
    fetch(`${API}/profiles/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, reason, source: 'USER' }),
    }),
  )
}

export function patchDecision(id: string, decision: Decision, reason?: string | null) {
  return parse<Profile>(
    fetch(`${API}/profiles/${id}/decision`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision, reason }),
    }),
  )
}
