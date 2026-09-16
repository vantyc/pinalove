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

export function openDatabase(sqlitePath: string): DatabaseSync {
  mkdirSync(dirname(sqlitePath), { recursive: true })
  const db = new DatabaseSync(sqlitePath)
  db.exec(SCHEMA_SQL)
  return db
}
