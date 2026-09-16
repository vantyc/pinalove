import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { DEFAULT_RULE_CONFIG } from '../../shared/defaultRules.ts'
import { evaluationFromImport, evaluateProfile } from '../../shared/scoring.ts'
import type {
  DashboardStats,
  Decision,
  DecisionLog,
  DecisionSource,
  FlagCode,
  ImportProfileInput,
  ImportResult,
  Profile,
  ProfileFilters,
  ReviewStatus,
  RuleConfig,
  ScoreReason,
} from '../../shared/types.ts'
import { REVIEW_STATUSES } from '../../shared/types.ts'

type ProfileRow = {
  id: string
  external_id: string | null
  username: string
  profile_url: string
  primary_photo_url: string | null
  local_photo_path: string | null
  age: number | null
  location: string | null
  country: string | null
  distance_km: number | null
  height_cm: number | null
  weight_kg: number | null
  relationship_status: Profile['relationshipStatus']
  marital_history: Profile['maritalHistory']
  has_children: Profile['hasChildren']
  wants_children: Profile['wantsChildren']
  religion: string | null
  religion_practice_level: Profile['religionPracticeLevel']
  headline: string | null
  bio: string | null
  photo_verified: number
  profile_verified: number
  source: Profile['source']
  scraped_at: string | null
  last_seen_at: string | null
  review_status: ReviewStatus
  decision: Decision
  decision_reason: string | null
  score: number | null
  score_reasons: string
  flags: string
  proposed_message: string | null
  created_at: string
  updated_at: string
}

function nowIso(): string {
  return new Date().toISOString()
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function rowToProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    externalId: row.external_id,
    username: row.username,
    profileUrl: row.profile_url,
    primaryPhotoUrl: row.primary_photo_url,
    localPhotoPath: row.local_photo_path,
    age: row.age,
    location: row.location,
    country: row.country,
    distanceKm: row.distance_km,
    heightCm: row.height_cm,
    weightKg: row.weight_kg,
    relationshipStatus: row.relationship_status,
    maritalHistory: row.marital_history,
    hasChildren: row.has_children,
    wantsChildren: row.wants_children,
    religion: row.religion,
    religionPracticeLevel: row.religion_practice_level,
    headline: row.headline,
    bio: row.bio,
    photoVerified: Boolean(row.photo_verified),
    profileVerified: Boolean(row.profile_verified),
    source: row.source,
    scrapedAt: row.scraped_at,
    lastSeenAt: row.last_seen_at,
    reviewStatus: row.review_status,
    decision: row.decision,
    decisionReason: row.decision_reason,
    score: row.score,
    scoreReasons: parseJson<ScoreReason[]>(row.score_reasons, []),
    flags: parseJson<FlagCode[]>(row.flags, []),
    proposedMessage: row.proposed_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function applyShortcut(filters: ProfileFilters, rules: RuleConfig): ProfileFilters {
  if (!filters.shortcut) return filters
  const next = { ...filters }
  switch (filters.shortcut) {
    case 'mexico':
      next.country = next.country ?? 'Mexico'
      break
    case 'cdmx':
      next.location = next.location ?? 'CDMX'
      break
    case 'no-children':
      next.hasChildren = 'NO'
      break
    case 'never-married':
      next.maritalHistory = 'NEVER_MARRIED'
      break
    case 'verified':
      next.verified = true
      break
    case 'needs-review':
      next.status = 'MANUAL_REVIEW'
      break
    case 'high-score':
      next.scoreMin = next.scoreMin ?? rules.scoring.highScoreThreshold
      break
  }
  return next
}

export class ProfileStore {
  constructor(private readonly db: DatabaseSync) {}

  getRules(): RuleConfig {
    const row = this.db
      .prepare('SELECT value FROM app_config WHERE key = ?')
      .get('rules') as { value: string } | undefined
    if (!row) return structuredClone(DEFAULT_RULE_CONFIG)
    try {
      return JSON.parse(row.value) as RuleConfig
    } catch {
      return structuredClone(DEFAULT_RULE_CONFIG)
    }
  }

  saveRules(rules: RuleConfig): RuleConfig {
    const ts = nowIso()
    this.db
      .prepare(
        `INSERT INTO app_config (key, value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run('rules', JSON.stringify(rules), ts)
    this.rescoreAll(rules)
    return rules
  }

  count(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM profiles').get() as { n: number }
    return row.n
  }

  getById(id: string): Profile | null {
    const row = this.db.prepare('SELECT * FROM profiles WHERE id = ?').get(id) as
      | ProfileRow
      | undefined
    return row ? rowToProfile(row) : null
  }

  list(filters: ProfileFilters = {}): Profile[] {
    const rules = this.getRules()
    const f = applyShortcut(filters, rules)
    const rows = this.db.prepare('SELECT * FROM profiles ORDER BY score DESC, updated_at DESC').all() as ProfileRow[]
    return rows.map(rowToProfile).filter((p) => matchesFilters(p, f, rules))
  }

  stats(): DashboardStats {
    const profiles = this.list({})
    const byStatus = Object.fromEntries(REVIEW_STATUSES.map((s) => [s, 0])) as Record<
      ReviewStatus,
      number
    >
    let flagged = 0
    let highScore = 0
    const high = this.getRules().scoring.highScoreThreshold
    for (const p of profiles) {
      byStatus[p.reviewStatus] += 1
      if (p.flags.length > 0) flagged += 1
      if ((p.score ?? 0) >= high) highScore += 1
    }
    return {
      total: profiles.length,
      byStatus,
      unreviewed: byStatus.UNREVIEWED,
      shortlisted: byStatus.SHORTLISTED,
      discarded: byStatus.DISCARDED,
      manualReview: byStatus.MANUAL_REVIEW,
      highScore,
      flagged,
    }
  }

  history(profileId: string): DecisionLog[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM decision_logs WHERE profile_id = ? ORDER BY created_at DESC',
      )
      .all(profileId) as Array<{
      id: string
      profile_id: string
      previous_status: ReviewStatus | null
      new_status: ReviewStatus
      reason: string | null
      source: DecisionSource
      created_at: string
    }>
    return rows.map((r) => ({
      id: r.id,
      profileId: r.profile_id,
      previousStatus: r.previous_status,
      newStatus: r.new_status,
      reason: r.reason,
      source: r.source,
      createdAt: r.created_at,
    }))
  }

  setStatus(
    id: string,
    status: ReviewStatus,
    reason: string | null,
    source: DecisionSource = 'USER',
  ): Profile | null {
    const current = this.getById(id)
    if (!current) return null
    const ts = nowIso()
    this.db
      .prepare(
        'UPDATE profiles SET review_status = ?, decision_reason = COALESCE(?, decision_reason), updated_at = ? WHERE id = ?',
      )
      .run(status, reason, ts, id)
    this.appendLog(id, current.reviewStatus, status, reason, source, ts)
    return this.getById(id)
  }

  setDecision(id: string, decision: Decision, reason: string | null): Profile | null {
    const current = this.getById(id)
    if (!current) return null
    const ts = nowIso()
    this.db
      .prepare(
        'UPDATE profiles SET decision = ?, decision_reason = ?, updated_at = ? WHERE id = ?',
      )
      .run(decision, reason, ts, id)
    this.appendLog(
      id,
      current.reviewStatus,
      current.reviewStatus,
      reason ?? `decision=${decision}`,
      'USER',
      ts,
    )
    return this.getById(id)
  }

  importProfiles(inputs: ImportProfileInput[]): ImportResult {
    const rules = this.getRules()
    const result: ImportResult = { imported: 0, updated: 0, errors: [] }
    for (let i = 0; i < inputs.length; i += 1) {
      try {
        const outcome = this.upsertImported(inputs[i], rules)
        if (outcome === 'inserted') result.imported += 1
        else result.updated += 1
      } catch (err) {
        result.errors.push({
          index: i,
          message: err instanceof Error ? err.message : 'import error',
        })
      }
    }
    return result
  }

  rescoreAll(rules = this.getRules()): number {
    const rows = this.db.prepare('SELECT * FROM profiles').all() as ProfileRow[]
    const ts = nowIso()
    const stmt = this.db.prepare(
      'UPDATE profiles SET score = ?, score_reasons = ?, flags = ?, updated_at = ? WHERE id = ?',
    )
    let n = 0
    for (const row of rows) {
      const profile = rowToProfile(row)
      const evaluation = evaluateProfile(profile, rules)
      stmt.run(
        evaluation.score,
        JSON.stringify(evaluation.reasons),
        JSON.stringify(evaluation.flags),
        ts,
        profile.id,
      )
      n += 1
    }
    return n
  }

  private upsertImported(
    input: ImportProfileInput,
    rules: RuleConfig,
  ): 'inserted' | 'updated' {
    const evaluation = evaluationFromImport(input, rules)
    const source = input.source ?? 'IMPORT'
    const externalId = input.externalId ?? null
    const existing = this.findExisting(source, externalId, input.profileUrl)
    const ts = nowIso()
    const status = input.reviewStatus ?? existing?.reviewStatus ?? 'UNREVIEWED'
    const profile: Profile = {
      id: existing?.id ?? randomUUID(),
      externalId,
      username: input.username,
      profileUrl: input.profileUrl,
      primaryPhotoUrl: input.primaryPhotoUrl ?? null,
      localPhotoPath: input.localPhotoPath ?? null,
      age: input.age ?? null,
      location: input.location ?? null,
      country: input.country ?? null,
      distanceKm: input.distanceKm ?? null,
      heightCm: input.heightCm ?? null,
      weightKg: input.weightKg ?? null,
      relationshipStatus: input.relationshipStatus ?? 'UNKNOWN',
      maritalHistory: input.maritalHistory ?? 'UNKNOWN',
      hasChildren: input.hasChildren ?? 'UNKNOWN',
      wantsChildren: input.wantsChildren ?? 'UNKNOWN',
      religion: input.religion ?? null,
      religionPracticeLevel: input.religionPracticeLevel ?? 'UNKNOWN',
      headline: input.headline ?? null,
      bio: input.bio ?? null,
      photoVerified: input.photoVerified ?? false,
      profileVerified: input.profileVerified ?? false,
      source,
      scrapedAt: input.scrapedAt ?? null,
      lastSeenAt: input.lastSeenAt ?? ts,
      reviewStatus: status,
      decision: input.decision ?? existing?.decision ?? 'NONE',
      decisionReason: input.decisionReason ?? existing?.decisionReason ?? null,
      score: evaluation.score,
      scoreReasons: evaluation.reasons,
      flags: evaluation.flags,
      proposedMessage: input.proposedMessage ?? existing?.proposedMessage ?? null,
      createdAt: existing?.createdAt ?? ts,
      updatedAt: ts,
    }
    this.db
      .prepare(
        `INSERT INTO profiles (
          id, external_id, username, profile_url, primary_photo_url, local_photo_path,
          age, location, country, distance_km, height_cm, weight_kg,
          relationship_status, marital_history, has_children, wants_children,
          religion, religion_practice_level, headline, bio,
          photo_verified, profile_verified, source, scraped_at, last_seen_at,
          review_status, decision, decision_reason, score, score_reasons, flags,
          proposed_message, created_at, updated_at
        ) VALUES (
          ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
        )
        ON CONFLICT(id) DO UPDATE SET
          external_id = excluded.external_id,
          username = excluded.username,
          profile_url = excluded.profile_url,
          primary_photo_url = excluded.primary_photo_url,
          local_photo_path = excluded.local_photo_path,
          age = excluded.age,
          location = excluded.location,
          country = excluded.country,
          distance_km = excluded.distance_km,
          height_cm = excluded.height_cm,
          weight_kg = excluded.weight_kg,
          relationship_status = excluded.relationship_status,
          marital_history = excluded.marital_history,
          has_children = excluded.has_children,
          wants_children = excluded.wants_children,
          religion = excluded.religion,
          religion_practice_level = excluded.religion_practice_level,
          headline = excluded.headline,
          bio = excluded.bio,
          photo_verified = excluded.photo_verified,
          profile_verified = excluded.profile_verified,
          source = excluded.source,
          scraped_at = excluded.scraped_at,
          last_seen_at = excluded.last_seen_at,
          review_status = excluded.review_status,
          decision = excluded.decision,
          decision_reason = excluded.decision_reason,
          score = excluded.score,
          score_reasons = excluded.score_reasons,
          flags = excluded.flags,
          proposed_message = excluded.proposed_message,
          updated_at = excluded.updated_at`,
      )
      .run(
        profile.id,
        profile.externalId,
        profile.username,
        profile.profileUrl,
        profile.primaryPhotoUrl,
        profile.localPhotoPath,
        profile.age,
        profile.location,
        profile.country,
        profile.distanceKm,
        profile.heightCm,
        profile.weightKg,
        profile.relationshipStatus,
        profile.maritalHistory,
        profile.hasChildren,
        profile.wantsChildren,
        profile.religion,
        profile.religionPracticeLevel,
        profile.headline,
        profile.bio,
        profile.photoVerified ? 1 : 0,
        profile.profileVerified ? 1 : 0,
        profile.source,
        profile.scrapedAt,
        profile.lastSeenAt,
        profile.reviewStatus,
        profile.decision,
        profile.decisionReason,
        profile.score,
        JSON.stringify(profile.scoreReasons),
        JSON.stringify(profile.flags),
        profile.proposedMessage,
        profile.createdAt,
        profile.updatedAt,
      )
    if (!existing) {
      this.appendLog(profile.id, null, profile.reviewStatus, 'imported', 'IMPORT', ts)
      return 'inserted'
    }
    if (existing.reviewStatus !== profile.reviewStatus) {
      this.appendLog(
        profile.id,
        existing.reviewStatus,
        profile.reviewStatus,
        'status updated on import',
        'IMPORT',
        ts,
      )
    }
    return 'updated'
  }

  private findExisting(
    source: Profile['source'],
    externalId: string | null,
    profileUrl: string,
  ): Profile | null {
    if (externalId) {
      const row = this.db
        .prepare('SELECT * FROM profiles WHERE source = ? AND external_id = ?')
        .get(source, externalId) as ProfileRow | undefined
      if (row) return rowToProfile(row)
    }
    const row = this.db
      .prepare('SELECT * FROM profiles WHERE profile_url = ?')
      .get(profileUrl) as ProfileRow | undefined
    return row ? rowToProfile(row) : null
  }

  private appendLog(
    profileId: string,
    previousStatus: ReviewStatus | null,
    newStatus: ReviewStatus,
    reason: string | null,
    source: DecisionSource,
    createdAt: string,
  ): void {
    this.db
      .prepare(
        `INSERT INTO decision_logs (id, profile_id, previous_status, new_status, reason, source, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(randomUUID(), profileId, previousStatus, newStatus, reason, source, createdAt)
  }
}

function matchesFilters(profile: Profile, filters: ProfileFilters, rules: RuleConfig): boolean {
  if (filters.ageMin != null && (profile.age == null || profile.age < filters.ageMin)) return false
  if (filters.ageMax != null && (profile.age == null || profile.age > filters.ageMax)) return false
  if (filters.country) {
    const want = filters.country.toLowerCase()
    const got = (profile.country ?? '').toLowerCase()
    if (!got.includes(want) && !want.includes(got)) return false
  }
  if (filters.location) {
    const want = filters.location.toLowerCase()
    const loc = `${profile.location ?? ''} ${profile.country ?? ''}`.toLowerCase()
    const cdmx =
      want.includes('cdmx') ||
      want.includes('mexico city') ||
      want.includes('ciudad de')
    if (cdmx) {
      const hit = rules.scoring.cdmxLocationMatches.some((m) =>
        (profile.location ?? '').toLowerCase().includes(m.toLowerCase()),
      )
      if (!hit && !loc.includes(want)) return false
    } else if (!loc.includes(want)) {
      return false
    }
  }
  if (filters.distanceMax != null && (profile.distanceKm == null || profile.distanceKm > filters.distanceMax)) {
    return false
  }
  if (filters.hasChildren && profile.hasChildren !== filters.hasChildren) return false
  if (filters.relationshipStatus && profile.relationshipStatus !== filters.relationshipStatus) {
    return false
  }
  if (filters.maritalHistory && profile.maritalHistory !== filters.maritalHistory) return false
  if (filters.religion) {
    const want = filters.religion.toLowerCase()
    if (!(profile.religion ?? '').toLowerCase().includes(want)) return false
  }
  if (filters.verified === true && !profile.photoVerified && !profile.profileVerified) return false
  if (filters.verified === false && (profile.photoVerified || profile.profileVerified)) return false
  if (filters.scoreMin != null && (profile.score == null || profile.score < filters.scoreMin)) {
    return false
  }
  if (filters.scoreMax != null && (profile.score == null || profile.score > filters.scoreMax)) {
    return false
  }
  if (filters.status) {
    const statuses = Array.isArray(filters.status) ? filters.status : [filters.status]
    if (!statuses.includes(profile.reviewStatus)) return false
  }
  if (filters.flags && filters.flags.length > 0) {
    if (!filters.flags.every((f) => profile.flags.includes(f))) return false
  }
  if (filters.search) {
    const q = filters.search.toLowerCase()
    const blob = [
      profile.username,
      profile.location,
      profile.country,
      profile.headline,
      profile.bio,
    ]
      .join(' ')
      .toLowerCase()
    if (!blob.includes(q)) return false
  }
  return true
}
