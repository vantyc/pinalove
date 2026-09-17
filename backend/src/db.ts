import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  external_id TEXT,
  username TEXT NOT NULL,
  profile_url TEXT NOT NULL,
  primary_photo_url TEXT,
  local_photo_path TEXT,
  age INTEGER,
  location TEXT,
  country TEXT,
  distance_km REAL,
  height_cm INTEGER,
  weight_kg INTEGER,
  relationship_status TEXT NOT NULL DEFAULT 'UNKNOWN',
  marital_history TEXT NOT NULL DEFAULT 'UNKNOWN',
  has_children TEXT NOT NULL DEFAULT 'UNKNOWN',
  wants_children TEXT NOT NULL DEFAULT 'UNKNOWN',
  religion TEXT,
  religion_practice_level TEXT NOT NULL DEFAULT 'UNKNOWN',
  headline TEXT,
  bio TEXT,
  photo_verified INTEGER NOT NULL DEFAULT 0,
  profile_verified INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'IMPORT',
  scraped_at TEXT,
  last_seen_at TEXT,
  review_status TEXT NOT NULL DEFAULT 'UNREVIEWED',
  decision TEXT NOT NULL DEFAULT 'NONE',
  decision_reason TEXT,
  score INTEGER,
  score_reasons TEXT NOT NULL DEFAULT '[]',
  flags TEXT NOT NULL DEFAULT '[]',
  proposed_message TEXT,
  education TEXT,
  occupation TEXT,
  last_activity_at TEXT,
  gender TEXT,
  distance_raw REAL,
  face_verified TEXT NOT NULL DEFAULT 'UNKNOWN',
  field_facts TEXT NOT NULL DEFAULT '{}',
  classification_reasons TEXT NOT NULL DEFAULT '[]',
  missing_detail TEXT NOT NULL DEFAULT '[]',
  facts TEXT NOT NULL DEFAULT '[]',
  text_signals TEXT NOT NULL DEFAULT '[]',
  data_conflicts TEXT NOT NULL DEFAULT '[]',
  contact_status TEXT NOT NULL DEFAULT 'NONE',
  draft_message TEXT,
  draft_created_at TEXT,
  manually_sent_at TEXT,
  replied_at TEXT,
  last_human_action_at TEXT,
  contact_notes TEXT,
  distance_trust TEXT NOT NULL DEFAULT 'UNKNOWN',
  distance_display_km REAL,
  logistic_priority TEXT NOT NULL DEFAULT 'NONE',
  priority_reasons TEXT NOT NULL DEFAULT '[]',
  uncertainty_reasons TEXT NOT NULL DEFAULT '[]',
  sources TEXT NOT NULL DEFAULT '[]',
  activity_category TEXT,
  last_inbound_at TEXT,
  last_outbound_at TEXT,
  inbound_unread INTEGER NOT NULL DEFAULT 0,
  last_inbound_preview TEXT,
  conversation_needs_reply INTEGER NOT NULL DEFAULT 0,
  inbox_identity TEXT,
  inbox_mail_id TEXT,
  inbound_review_status TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_source_external
  ON profiles(source, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_status ON profiles(review_status);
CREATE INDEX IF NOT EXISTS idx_profiles_score ON profiles(score);
CREATE INDEX IF NOT EXISTS idx_profiles_country ON profiles(country);

CREATE TABLE IF NOT EXISTS decision_logs (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  reason TEXT,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_decision_logs_profile ON decision_logs(profile_id, created_at);

CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`

const PROFILE_MIGRATIONS: { name: string; ddl: string }[] = [
  { name: 'education', ddl: 'TEXT' },
  { name: 'occupation', ddl: 'TEXT' },
  { name: 'last_activity_at', ddl: 'TEXT' },
  { name: 'gender', ddl: 'TEXT' },
  { name: 'distance_raw', ddl: 'REAL' },
  { name: 'face_verified', ddl: "TEXT NOT NULL DEFAULT 'UNKNOWN'" },
  { name: 'field_facts', ddl: "TEXT NOT NULL DEFAULT '{}'" },
  { name: 'classification_reasons', ddl: "TEXT NOT NULL DEFAULT '[]'" },
  { name: 'missing_detail', ddl: "TEXT NOT NULL DEFAULT '[]'" },
  { name: 'facts', ddl: "TEXT NOT NULL DEFAULT '[]'" },
  { name: 'text_signals', ddl: "TEXT NOT NULL DEFAULT '[]'" },
  { name: 'data_conflicts', ddl: "TEXT NOT NULL DEFAULT '[]'" },
  { name: 'contact_status', ddl: "TEXT NOT NULL DEFAULT 'NONE'" },
  { name: 'draft_message', ddl: 'TEXT' },
  { name: 'draft_created_at', ddl: 'TEXT' },
  { name: 'manually_sent_at', ddl: 'TEXT' },
  { name: 'replied_at', ddl: 'TEXT' },
  { name: 'last_human_action_at', ddl: 'TEXT' },
  { name: 'contact_notes', ddl: 'TEXT' },
  { name: 'distance_trust', ddl: "TEXT NOT NULL DEFAULT 'UNKNOWN'" },
  { name: 'distance_display_km', ddl: 'REAL' },
  { name: 'logistic_priority', ddl: "TEXT NOT NULL DEFAULT 'NONE'" },
  { name: 'priority_reasons', ddl: "TEXT NOT NULL DEFAULT '[]'" },
  { name: 'uncertainty_reasons', ddl: "TEXT NOT NULL DEFAULT '[]'" },
  { name: 'sources', ddl: "TEXT NOT NULL DEFAULT '[]'" },
  { name: 'activity_category', ddl: 'TEXT' },
  { name: 'last_inbound_at', ddl: 'TEXT' },
  { name: 'last_outbound_at', ddl: 'TEXT' },
  { name: 'inbound_unread', ddl: 'INTEGER NOT NULL DEFAULT 0' },
  { name: 'last_inbound_preview', ddl: 'TEXT' },
  { name: 'conversation_needs_reply', ddl: 'INTEGER NOT NULL DEFAULT 0' },
  { name: 'inbox_identity', ddl: 'TEXT' },
  { name: 'inbox_mail_id', ddl: 'TEXT' },
  { name: 'inbound_review_status', ddl: 'TEXT' },
]

function migrateProfiles(db: DatabaseSync): void {
  const cols = db.prepare('PRAGMA table_info(profiles)').all() as Array<{ name: string }>
  const have = new Set(cols.map((c) => c.name))
  for (const col of PROFILE_MIGRATIONS) {
    if (have.has(col.name)) continue
    db.exec(`ALTER TABLE profiles ADD COLUMN ${col.name} ${col.ddl}`)
  }
  db.exec('DROP INDEX IF EXISTS idx_profiles_external_id')
  db.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_external_id ON profiles(external_id) WHERE external_id IS NOT NULL',
  )
  db.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_inbox_identity ON profiles(inbox_identity) WHERE inbox_identity IS NOT NULL',
  )
  migrateInboundReview(db)
}

export function migrateInboundReview(db: DatabaseSync): void {
  db.exec(`
    UPDATE profiles
    SET inbound_review_status = 'PENDING'
    WHERE source = 'PINALOVE_INBOX'
      AND (inbound_review_status IS NULL OR inbound_review_status = '')
      AND review_status != 'DISCARDED'
  `)
  db.exec(`
    UPDATE profiles
    SET conversation_needs_reply = 0
    WHERE inbound_review_status = 'PENDING'
  `)
}

export function openDatabase(sqlitePath: string): DatabaseSync {
  mkdirSync(dirname(sqlitePath), { recursive: true })
  const db = new DatabaseSync(sqlitePath)
  db.exec(SCHEMA_SQL)
  migrateProfiles(db)
  return db
}
