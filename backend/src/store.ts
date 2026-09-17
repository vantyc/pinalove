import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { DEFAULT_RULE_CONFIG } from '../../shared/defaultRules.ts'
import { classifyListsNewMatch } from '../../shared/classify.ts'
import { evaluationFromImport, evaluateProfile } from '../../shared/scoring.ts'
import { interpretDistance } from '../../shared/geo.ts'
import { activityCategory } from '../../shared/activity.ts'
import { assignContact, generateStaleProbeDraft } from '../../shared/workflow.ts'
import { generateOpeningDraft } from '../../shared/drafts.ts'
import type {
  ActivityCategory,
  ContactStatus,
  DashboardStats,
  DataConflict,
  Decision,
  DecisionLog,
  DecisionSource,
  DistanceTrust,
  FieldFactMap,
  FlagCode,
  ImportProfileInput,
  ImportResult,
  LogisticPriority,
  Profile,
  ProfileFilters,
  ProfileSource,
  ProvenanceRecord,
  ReviewStatus,
  RuleConfig,
  ScoreReason,
  TextSignal,
  Tristate,
  UnknownFieldCounts,
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
  education: string | null
  occupation: string | null
  last_activity_at: string | null
  gender: string | null
  distance_raw: number | null
  face_verified: Tristate
  field_facts: string
  classification_reasons: string
  missing_detail: string
  facts: string
  text_signals: string
  data_conflicts: string
  contact_status: ContactStatus | null
  draft_message: string | null
  draft_created_at: string | null
  manually_sent_at: string | null
  replied_at: string | null
  last_human_action_at: string | null
  contact_notes: string | null
  distance_trust: DistanceTrust | null
  distance_display_km: number | null
  logistic_priority: LogisticPriority | null
  priority_reasons: string | null
  uncertainty_reasons: string | null
  sources: string | null
  activity_category: ActivityCategory | null
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

function mergeSources(existing: ProfileSource[] | undefined, incoming: ProfileSource): ProfileSource[] {
  const next = existing ? [...existing] : []
  if (!next.includes(incoming)) next.push(incoming)
  return next
}

function sourcesFromRow(row: ProfileRow): ProfileSource[] {
  const parsed = parseJson<ProfileSource[]>(row.sources ?? '[]', [])
  if (parsed.length > 0) return parsed
  return [row.source]
}

function distanceSourceFor(profile: Pick<Profile, 'source' | 'sources' | 'distanceRaw'>): ProfileSource {
  if (profile.sources.includes('PINALOVE_BROWSE') && (profile.distanceRaw == null || profile.distanceRaw <= 500)) {
    return 'PINALOVE_BROWSE'
  }
  return profile.source
}

function scoringKmFor(profile: Profile, scoringKm: number | null): number | null {
  if (profile.source === 'PINALOVE_BROWSE' || profile.sources.includes('PINALOVE_BROWSE')) {
    return scoringKm
  }
  if (
    (profile.source === 'PINALOVE' || profile.source === 'PINALOVE_MATCH') &&
    (profile.distanceKm == null || profile.distanceKm > 500)
  ) {
    return null
  }
  return scoringKm
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
    distanceRaw: row.distance_raw ?? null,
    distanceDisplayKm: row.distance_display_km ?? null,
    distanceTrust: row.distance_trust ?? 'UNKNOWN',
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
    proposedMessage: row.draft_message ?? row.proposed_message,
    contactStatus: row.contact_status ?? 'NONE',
    draftMessage: row.draft_message ?? row.proposed_message ?? null,
    draftCreatedAt: row.draft_created_at ?? null,
    manuallySentAt: row.manually_sent_at ?? null,
    repliedAt: row.replied_at ?? null,
    lastHumanActionAt: row.last_human_action_at ?? null,
    contactNotes: row.contact_notes ?? null,
    logisticPriority: row.logistic_priority === 'LOCAL' ? 'HIGH_LOCAL' : (row.logistic_priority ?? 'NONE'),
    priorityReasons: parseJson<string[]>(row.priority_reasons ?? '[]', []),
    uncertaintyReasons: parseJson<string[]>(row.uncertainty_reasons ?? '[]', []),
    sources: sourcesFromRow(row),
    activityCategory: row.activity_category ?? activityCategory(row.last_activity_at),
    education: row.education ?? null,
    occupation: row.occupation ?? null,
    lastActivityAt: row.last_activity_at ?? null,
    gender: row.gender ?? null,
    faceVerified: row.face_verified ?? 'UNKNOWN',
    fieldFacts: parseJson<FieldFactMap>(row.field_facts ?? '{}', {}),
    facts: parseJson<ProvenanceRecord[]>(row.facts ?? '[]', []),
    textSignals: parseJson<TextSignal[]>(row.text_signals ?? '[]', []),
    dataConflicts: parseJson<DataConflict[]>(row.data_conflicts ?? '[]', []),
    classificationReasons: parseJson<string[]>(row.classification_reasons ?? '[]', []),
    missingDetail: parseJson<string[]>(row.missing_detail ?? '[]', []),
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
      next.status = ['NEEDS_DETAIL', 'MANUAL_REVIEW']
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
    let unknownCritical = 0
    const unknownByField: UnknownFieldCounts = {
      children: 0,
      maritalHistory: 0,
      religion: 0,
      occupation: 0,
      gender: 0,
      photoVerified: 0,
      education: 0,
    }
    const high = this.getRules().scoring.highScoreThreshold
    for (const p of profiles) {
      byStatus[p.reviewStatus] += 1
      if (p.flags.length > 0) flagged += 1
      if ((p.score ?? 0) >= high) highScore += 1
      if (p.hasChildren === 'UNKNOWN') unknownByField.children += 1
      if (p.maritalHistory === 'UNKNOWN') unknownByField.maritalHistory += 1
      if (!p.religion || p.religion === 'UNKNOWN') unknownByField.religion += 1
      if (!p.occupation || p.occupation === 'UNKNOWN') unknownByField.occupation += 1
      if (!p.gender || p.gender === 'UNKNOWN') unknownByField.gender += 1
      if (p.faceVerified === 'UNKNOWN') unknownByField.photoVerified += 1
      if (!p.education || p.education === 'UNKNOWN') unknownByField.education += 1
      if (
        p.hasChildren === 'UNKNOWN' ||
        p.maritalHistory === 'UNKNOWN' ||
        p.faceVerified === 'UNKNOWN'
      ) {
        unknownCritical += 1
      }
    }
    return {
      total: profiles.length,
      byStatus,
      unreviewed: byStatus.UNREVIEWED,
      preselected: byStatus.PRESELECTED,
      needsDetail: byStatus.NEEDS_DETAIL,
      shortlisted: byStatus.SHORTLISTED,
      discarded: byStatus.DISCARDED,
      manualReview: byStatus.MANUAL_REVIEW,
      highScore,
      flagged,
      unknownCritical,
      unknownByField,
      staleLocalProbe: profiles.filter((p) => p.contactStatus === 'STALE_LOCAL_PROBE').length,
      readyToContact: profiles.filter((p) => p.contactStatus === 'READY_TO_CONTACT').length,
      probeSent: profiles.filter((p) => p.contactStatus === 'PROBE_SENT').length,
      actionRequired: profiles.filter((p) => {
        if (p.reviewStatus === 'DISCARDED') return false
        if (p.contactStatus === 'STALE_LOCAL_PROBE') return true
        if (p.contactStatus === 'READY_TO_CONTACT') return true
        if (
          p.reviewStatus === 'PRESELECTED' &&
          p.contactStatus !== 'PROBE_SENT' &&
          p.contactStatus !== 'REPLIED'
        ) {
          return true
        }
        if (p.reviewStatus === 'NEEDS_DETAIL') return true
        return false
      }).length,
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
    if (status === 'DISCARDED') return this.discardManual(id, reason)
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

  /** Human discard. SQLite only. Does not call PinaLove. Row and provenance stay. */
  discardManual(id: string, note: string | null = null): Profile | null {
    const current = this.getById(id)
    if (!current) return null
    const ts = nowIso()
    const trimmed = note?.trim() ?? ''
    const reason = trimmed && trimmed !== 'Manual discard' ? `Manual discard: ${trimmed}` : 'Manual discard'
    this.db
      .prepare(
        `UPDATE profiles SET
          review_status = ?, contact_status = ?, decision_reason = ?,
          last_human_action_at = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run('DISCARDED', 'NONE', reason, ts, ts, id)
    this.appendLog(id, current.reviewStatus, 'DISCARDED', reason, 'USER', ts)
    return this.getById(id)
  }

  /** Restore a discarded row from persisted facts. No PinaLove requests. */
  restoreFromDiscard(id: string, now = Date.now()): Profile | null {
    const current = this.getById(id)
    if (!current) return null
    const ts = nowIso()
    const classified = classifyListsNewMatch({
      gender: current.gender,
      faceVerified: current.faceVerified,
      hasChildren: current.hasChildren,
      maritalHistory: current.maritalHistory,
      religion: current.religion,
      occupation: current.occupation,
      dataConflict: current.dataConflicts.length > 0,
    })
    const assigned = assignContact({
      reviewStatus: classified.status,
      contactStatus: 'NONE',
      location: current.location,
      country: current.country,
      lastActivityAt: current.lastActivityAt,
      faceVerified: current.faceVerified,
      hasChildren: current.hasChildren,
      now,
    })
    let contactStatus = assigned.contactStatus
    if (current.repliedAt) contactStatus = 'REPLIED'
    else if (current.manuallySentAt) contactStatus = 'PROBE_SENT'
    const freezeDraft = Boolean(current.manuallySentAt) || contactStatus === 'REPLIED' || contactStatus === 'NO_RESPONSE' || contactStatus === 'PROBE_SENT'
    let draft = current.draftMessage
    let draftAt = current.draftCreatedAt
    if (!freezeDraft && contactStatus === 'STALE_LOCAL_PROBE') {
      draft = generateStaleProbeDraft(current.location)
      draftAt = ts
    }
    if (!freezeDraft && contactStatus === 'READY_TO_CONTACT') {
      const occupationFact = current.facts.find((f) => f.field === 'occupation' && f.confidence === 'EXPLICIT')
      draft = generateOpeningDraft({
        username: current.username,
        location: current.location,
        headline: current.headline,
        bio: current.bio,
        occupation: typeof occupationFact?.value === 'string' ? occupationFact.value : null,
        occupationConfidence: occupationFact?.confidence ?? null,
        facts: current.facts,
      })
      draftAt = ts
    }
    this.db
      .prepare(
        `UPDATE profiles SET
          review_status = ?, classification_reasons = ?, missing_detail = ?,
          contact_status = ?, draft_message = ?, draft_created_at = ?, proposed_message = ?,
          logistic_priority = ?, priority_reasons = ?, uncertainty_reasons = ?,
          last_human_action_at = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        classified.status,
        JSON.stringify(classified.reasons),
        JSON.stringify(classified.missingDetail),
        contactStatus,
        draft,
        draftAt,
        draft,
        assigned.logisticPriority,
        JSON.stringify(assigned.priorityReasons),
        JSON.stringify(assigned.uncertaintyReasons),
        ts,
        ts,
        id,
      )
    this.appendLog(
      id,
      current.reviewStatus,
      classified.status,
      'restored by user; reclassified from existing facts',
      'USER',
      ts,
    )
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

  applyLocalWorkflow(now = Date.now()): number {
    const rows = this.db.prepare('SELECT * FROM profiles').all() as ProfileRow[]
    const ts = nowIso()
    const stmt = this.db.prepare(
      `UPDATE profiles SET
        contact_status = ?, draft_message = ?, draft_created_at = ?,
        proposed_message = ?, distance_trust = ?, distance_display_km = ?,
        distance_km = ?, logistic_priority = ?, priority_reasons = ?,
        uncertainty_reasons = ?, activity_category = ?, updated_at = ?
       WHERE id = ?`,
    )
    let n = 0
    for (const row of rows) {
      const profile = rowToProfile(row)
      const distance = interpretDistance({
        distanceRaw: profile.distanceRaw,
        distanceKm: profile.distanceKm,
        location: profile.location,
        country: profile.country,
        source: distanceSourceFor(profile),
      })
      const assigned = assignContact({
        reviewStatus: profile.reviewStatus,
        contactStatus: profile.contactStatus,
        location: profile.location,
        country: profile.country,
        lastActivityAt: profile.lastActivityAt,
        faceVerified: profile.faceVerified,
        hasChildren: profile.hasChildren,
        now,
      })
      let draft = profile.draftMessage
      let draftAt = profile.draftCreatedAt
      const freezeDraft =
        Boolean(profile.manuallySentAt) ||
        profile.contactStatus === 'PROBE_SENT' ||
        profile.contactStatus === 'REPLIED' ||
        profile.contactStatus === 'NO_RESPONSE' ||
        assigned.contactStatus === 'PROBE_SENT' ||
        assigned.contactStatus === 'REPLIED' ||
        assigned.contactStatus === 'NO_RESPONSE'
      if (!freezeDraft && assigned.contactStatus === 'STALE_LOCAL_PROBE') {
        draft = generateStaleProbeDraft(profile.location)
        draftAt = ts
      }
      if (!freezeDraft && assigned.contactStatus === 'READY_TO_CONTACT') {
        const occupationFact = profile.facts.find(
          (f) => f.field === 'occupation' && f.confidence === 'EXPLICIT',
        )
        draft = generateOpeningDraft({
          username: profile.username,
          location: profile.location,
          headline: profile.headline,
          bio: profile.bio,
          occupation: typeof occupationFact?.value === 'string' ? occupationFact.value : null,
          occupationConfidence: occupationFact?.confidence ?? null,
          facts: profile.facts,
        })
        draftAt = ts
      }
      stmt.run(
        assigned.contactStatus,
        draft,
        draftAt,
        draft,
        distance.trust,
        distance.displayKm,
        scoringKmFor(profile, distance.scoringKm),
        assigned.logisticPriority,
        JSON.stringify(assigned.priorityReasons),
        JSON.stringify(assigned.uncertaintyReasons),
        activityCategory(profile.lastActivityAt, now),
        ts,
        profile.id,
      )
      n += 1
    }
    this.rescoreAll()
    return n
  }

  markContactSent(id: string): Profile | null {
    const current = this.getById(id)
    if (!current) return null
    const ts = nowIso()
    this.db
      .prepare(
        `UPDATE profiles SET
          contact_status = ?, manually_sent_at = ?, last_human_action_at = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run('PROBE_SENT', ts, ts, ts, id)
    this.appendLog(id, current.reviewStatus, current.reviewStatus, 'marked as sent (manual, local only)', 'USER', ts)
    return this.getById(id)
  }

  markContactOutcome(id: string, outcome: Extract<ContactStatus, 'REPLIED' | 'NO_RESPONSE'>): Profile | null {
    const current = this.getById(id)
    if (!current) return null
    const ts = nowIso()
    const repliedAt = outcome === 'REPLIED' ? ts : current.repliedAt
    this.db
      .prepare(
        `UPDATE profiles SET
          contact_status = ?, replied_at = ?, last_human_action_at = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(outcome, repliedAt, ts, ts, id)
    this.appendLog(
      id,
      current.reviewStatus,
      current.reviewStatus,
      `marked ${outcome} (manual, local only)`,
      'USER',
      ts,
    )
    return this.getById(id)
  }

  updateContactNotes(id: string, notes: string | null): Profile | null {
    const current = this.getById(id)
    if (!current) return null
    const ts = nowIso()
    this.db
      .prepare('UPDATE profiles SET contact_notes = ?, last_human_action_at = ?, updated_at = ? WHERE id = ?')
      .run(notes, ts, ts, id)
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
      const distance = interpretDistance({
        distanceRaw: profile.distanceRaw,
        distanceKm: profile.distanceKm,
        location: profile.location,
        country: profile.country,
        source: distanceSourceFor(profile),
      })
      const evaluation = evaluateProfile({ ...profile, distanceKm: distance.scoringKm }, rules)
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

  applyLocalEnrichment(
    id: string,
    patch: {
      hasChildren: Profile['hasChildren']
      maritalHistory: Profile['maritalHistory']
      relationshipStatus: Profile['relationshipStatus']
      religion: string | null
      occupation: string | null
      gender: string | null
      facts: ProvenanceRecord[]
      textSignals: TextSignal[]
      dataConflicts: DataConflict[]
      reviewStatus: ReviewStatus
      classificationReasons: string[]
      missingDetail: string[]
      flags: FlagCode[]
      fieldFacts: FieldFactMap
      decisionReason: string
    },
  ): Profile | null {
    const current = this.getById(id)
    if (!current) return null
    const ts = nowIso()
    const distance = interpretDistance({
      distanceRaw: current.distanceRaw,
      distanceKm: current.distanceKm,
      location: current.location,
      country: current.country,
      source: distanceSourceFor(current),
    })
    const evaluation = evaluateProfile(
      {
        age: current.age,
        location: current.location,
        country: current.country,
        distanceKm: distance.scoringKm,
        relationshipStatus: patch.relationshipStatus,
        maritalHistory: patch.maritalHistory,
        hasChildren: patch.hasChildren,
        religion: patch.religion,
        religionPracticeLevel: current.religionPracticeLevel,
        headline: current.headline,
        bio: current.bio,
        photoVerified: current.photoVerified,
        profileVerified: current.profileVerified,
        primaryPhotoUrl: current.primaryPhotoUrl,
      },
      this.getRules(),
    )
    const flags = [...new Set([...evaluation.flags, ...patch.flags])]
    this.db
      .prepare(
        `UPDATE profiles SET
          has_children = ?, marital_history = ?, relationship_status = ?,
          religion = ?, occupation = ?, gender = ?,
          facts = ?, text_signals = ?, data_conflicts = ?, field_facts = ?,
          review_status = ?, classification_reasons = ?, missing_detail = ?,
          decision_reason = ?, flags = ?, score = ?, score_reasons = ?,
          updated_at = ?
         WHERE id = ?`,
      )
      .run(
        patch.hasChildren,
        patch.maritalHistory,
        patch.relationshipStatus,
        patch.religion,
        patch.occupation,
        patch.gender,
        JSON.stringify(patch.facts),
        JSON.stringify(patch.textSignals),
        JSON.stringify(patch.dataConflicts),
        JSON.stringify(patch.fieldFacts),
        patch.reviewStatus,
        JSON.stringify(patch.classificationReasons),
        JSON.stringify(patch.missingDetail),
        patch.decisionReason,
        JSON.stringify(flags),
        evaluation.score,
        JSON.stringify(evaluation.reasons),
        ts,
        id,
      )
    if (current.reviewStatus !== patch.reviewStatus) {
      this.appendLog(
        id,
        current.reviewStatus,
        patch.reviewStatus,
        'local text enrichment',
        'RULE_ENGINE',
        ts,
      )
    }
    return this.getById(id)
  }

  private upsertImported(
    input: ImportProfileInput,
    rules: RuleConfig,
  ): 'inserted' | 'updated' {
    const evaluation = evaluationFromImport(input, rules)
    const incomingSource = input.source ?? 'IMPORT'
    const externalId = input.externalId ?? null
    const existing = this.findExisting(incomingSource, externalId, input.profileUrl)
    const ts = nowIso()
    const sources = mergeSources(existing?.sources ?? (existing ? [existing.source] : undefined), incomingSource)
    const keepBrowseDistance =
      Boolean(existing) &&
      incomingSource !== 'PINALOVE_BROWSE' &&
      (existing!.source === 'PINALOVE_BROWSE' || existing!.sources.includes('PINALOVE_BROWSE'))
    const status =
      existing && existing.reviewStatus !== 'UNREVIEWED'
        ? existing.reviewStatus
        : (input.reviewStatus ?? existing?.reviewStatus ?? 'UNREVIEWED')
    const faceVerified =
      input.faceVerified ?? existing?.faceVerified ?? (input.photoVerified ? 'YES' : 'UNKNOWN')
    const lastActivityAt = input.lastActivityAt ?? existing?.lastActivityAt ?? null
    const profile: Profile = {
      id: existing?.id ?? randomUUID(),
      externalId,
      username: input.username,
      profileUrl: input.profileUrl,
      primaryPhotoUrl: input.primaryPhotoUrl ?? existing?.primaryPhotoUrl ?? null,
      localPhotoPath: input.localPhotoPath ?? existing?.localPhotoPath ?? null,
      age: input.age ?? existing?.age ?? null,
      location: input.location ?? existing?.location ?? null,
      country: input.country ?? existing?.country ?? null,
      distanceKm: keepBrowseDistance ? existing!.distanceKm : (input.distanceKm ?? existing?.distanceKm ?? null),
      distanceRaw: keepBrowseDistance ? existing!.distanceRaw : (input.distanceRaw ?? existing?.distanceRaw ?? null),
      distanceDisplayKm: existing?.distanceDisplayKm ?? null,
      distanceTrust: existing?.distanceTrust ?? 'UNKNOWN',
      heightCm: input.heightCm ?? existing?.heightCm ?? null,
      weightKg: input.weightKg ?? existing?.weightKg ?? null,
      relationshipStatus: input.relationshipStatus ?? existing?.relationshipStatus ?? 'UNKNOWN',
      maritalHistory: input.maritalHistory ?? existing?.maritalHistory ?? 'UNKNOWN',
      hasChildren: input.hasChildren ?? existing?.hasChildren ?? 'UNKNOWN',
      wantsChildren: input.wantsChildren ?? existing?.wantsChildren ?? 'UNKNOWN',
      religion: input.religion ?? existing?.religion ?? null,
      religionPracticeLevel: input.religionPracticeLevel ?? existing?.religionPracticeLevel ?? 'UNKNOWN',
      occupation: input.occupation ?? existing?.occupation ?? null,
      education: input.education ?? existing?.education ?? null,
      gender: input.gender ?? existing?.gender ?? null,
      lastActivityAt,
      headline: input.headline ?? existing?.headline ?? null,
      bio: input.bio ?? existing?.bio ?? null,
      photoVerified: input.photoVerified ?? existing?.photoVerified ?? faceVerified === 'YES',
      faceVerified,
      profileVerified: input.profileVerified ?? existing?.profileVerified ?? false,
      fieldFacts: input.fieldFacts ?? existing?.fieldFacts ?? {},
      facts: input.facts && input.facts.length > 0 ? input.facts : (existing?.facts ?? []),
      textSignals: input.textSignals ?? existing?.textSignals ?? [],
      dataConflicts: input.dataConflicts ?? existing?.dataConflicts ?? [],
      classificationReasons: input.classificationReasons ?? existing?.classificationReasons ?? [],
      missingDetail: input.missingDetail ?? existing?.missingDetail ?? [],
      source: existing?.source ?? incomingSource,
      sources,
      activityCategory: activityCategory(lastActivityAt),
      scrapedAt: input.scrapedAt ?? existing?.scrapedAt ?? null,
      lastSeenAt: input.lastSeenAt ?? ts,
      reviewStatus: status,
      decision: input.decision ?? existing?.decision ?? 'NONE',
      decisionReason: input.decisionReason ?? existing?.decisionReason ?? null,
      score: evaluation.score,
      scoreReasons: evaluation.reasons,
      flags: evaluation.flags,
      proposedMessage: input.proposedMessage ?? existing?.proposedMessage ?? null,
      contactStatus: existing?.contactStatus ?? 'NONE',
      draftMessage: existing?.draftMessage ?? input.proposedMessage ?? null,
      draftCreatedAt: existing?.draftCreatedAt ?? null,
      manuallySentAt: existing?.manuallySentAt ?? null,
      repliedAt: existing?.repliedAt ?? null,
      lastHumanActionAt: existing?.lastHumanActionAt ?? null,
      contactNotes: existing?.contactNotes ?? null,
      logisticPriority: existing?.logisticPriority ?? 'NONE',
      priorityReasons: existing?.priorityReasons ?? [],
      uncertaintyReasons: existing?.uncertaintyReasons ?? [],
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
          proposed_message, education, occupation, last_activity_at, gender,
          distance_raw, face_verified, field_facts, classification_reasons,
          missing_detail, created_at, updated_at, facts, text_signals, data_conflicts,
          sources, activity_category
        ) VALUES (
          ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
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
          education = excluded.education,
          occupation = excluded.occupation,
          last_activity_at = excluded.last_activity_at,
          gender = excluded.gender,
          distance_raw = excluded.distance_raw,
          face_verified = excluded.face_verified,
          field_facts = excluded.field_facts,
          classification_reasons = excluded.classification_reasons,
          missing_detail = excluded.missing_detail,
          facts = excluded.facts,
          text_signals = excluded.text_signals,
          data_conflicts = excluded.data_conflicts,
          sources = excluded.sources,
          activity_category = excluded.activity_category,
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
        profile.education,
        profile.occupation,
        profile.lastActivityAt,
        profile.gender,
        profile.distanceRaw,
        profile.faceVerified,
        JSON.stringify(profile.fieldFacts),
        JSON.stringify(profile.classificationReasons),
        JSON.stringify(profile.missingDetail),
        profile.createdAt,
        profile.updatedAt,
        JSON.stringify(profile.facts),
        JSON.stringify(profile.textSignals),
        JSON.stringify(profile.dataConflicts),
        JSON.stringify(profile.sources),
        profile.activityCategory,
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
    _source: Profile['source'],
    externalId: string | null,
    profileUrl: string,
  ): Profile | null {
    if (externalId) {
      const row = this.db
        .prepare('SELECT * FROM profiles WHERE external_id = ? ORDER BY created_at LIMIT 1')
        .get(externalId) as ProfileRow | undefined
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
  if (filters.contactStatus) {
    const statuses = Array.isArray(filters.contactStatus) ? filters.contactStatus : [filters.contactStatus]
    if (!statuses.includes(profile.contactStatus)) return false
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
