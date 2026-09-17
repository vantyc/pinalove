import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { openDatabase } from '../backend/src/db.ts'
import { ProfileStore } from '../backend/src/store.ts'
import { browseRecordToImport, type BrowseDeckRecord } from '../shared/browseImport.ts'

const SQLITE_PATH = process.env.SQLITE_PATH ?? path.join(process.cwd(), 'data/pinalove.sqlite')
const FIXTURE_PATH =
  process.env.BROWSE_DECK_PATH ?? path.join(process.cwd(), 'fixtures/browse-deck-fase3a.json')
const NOW = Date.parse('2026-09-17T01:34:00.000Z')

function sqlitePathIsLocal(sqlitePath: string): void {
  const resolved = path.resolve(sqlitePath)
  if (resolved.includes('/var/lib/pinalove')) {
    throw new Error('Refusing to write the Kubernetes hostPath SQLite from local browse import')
  }
}

type DeckFile = {
  extractedAt: string
  profiles: BrowseDeckRecord[]
}

function main(): void {
  sqlitePathIsLocal(SQLITE_PATH)
  if (!existsSync(FIXTURE_PATH)) {
    throw new Error(
      `STOP: local observed browse deck missing at ${FIXTURE_PATH}. That file is gitignored. Do not fetch PinaLove.`,
    )
  }
  const deck = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as DeckFile
  if (!Array.isArray(deck.profiles) || deck.profiles.length === 0) {
    throw new Error('STOP: browse deck has no profiles')
  }
  if (deck.profiles.length > 3) {
    throw new Error('STOP: refusing to import more than 3 browse rows from a local deck')
  }

  const db = openDatabase(SQLITE_PATH)
  const store = new ProfileStore(db)
  const rowsBefore = store.count()
  const inputs = deck.profiles.map((row) => browseRecordToImport(row, deck.extractedAt))
  const result = store.importProfiles(inputs)
  store.applyLocalWorkflow(NOW)
  const rowsAfter = store.count()
  const importedIds = new Set(inputs.map((row) => row.externalId))
  const imported = store.list({}).filter((p) => p.externalId != null && importedIds.has(p.externalId))
  const report = {
    pinaloveRequests: 0,
    liveNetwork: false,
    rowsBefore,
    rowsAfter,
    importedCount: result.imported,
    updatedCount: result.updated,
    errors: result.errors,
    deduplications: result.updated,
    profiles: imported.map((p) => ({
      username: p.username,
      externalId: p.externalId,
      source: p.source,
      sources: p.sources,
      age: p.age,
      location: p.location,
      country: p.country,
      gender: p.gender,
      hasChildren: p.hasChildren,
      maritalHistory: p.maritalHistory,
      faceVerified: p.faceVerified,
      lastActivityAt: p.lastActivityAt,
      activityCategory: p.activityCategory,
      distanceRaw: p.distanceRaw,
      distanceKm: p.distanceKm,
      distanceDisplayKm: p.distanceDisplayKm,
      distanceTrust: p.distanceTrust,
      reviewStatus: p.reviewStatus,
      contactStatus: p.contactStatus,
      logisticPriority: p.logisticPriority,
      priorityReasons: p.priorityReasons,
      uncertaintyReasons: p.uncertaintyReasons,
      draft: p.draftMessage,
    })),
  }
  db.close()
  console.log(JSON.stringify(report, null, 2))
}

main()
