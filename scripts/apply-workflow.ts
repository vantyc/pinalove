import path from 'node:path'
import { openDatabase } from '../backend/src/db.ts'
import { ProfileStore } from '../backend/src/store.ts'

const SQLITE_PATH = process.env.SQLITE_PATH ?? path.join(process.cwd(), 'data/pinalove.sqlite')

function sqlitePathIsLocal(sqlitePath: string): void {
  const resolved = path.resolve(sqlitePath)
  if (resolved.includes('/var/lib/pinalove')) {
    throw new Error('Refusing to write the Kubernetes hostPath SQLite from local workflow')
  }
}

function main(): void {
  sqlitePathIsLocal(SQLITE_PATH)
  const db = openDatabase(SQLITE_PATH)
  const store = new ProfileStore(db)
  const n = store.applyLocalWorkflow()
  const profiles = store.list({})
  const byStatus: Record<string, number> = {}
  const byContact: Record<string, number> = {}
  for (const p of profiles) {
    byStatus[p.reviewStatus] = (byStatus[p.reviewStatus] ?? 0) + 1
    byContact[p.contactStatus] = (byContact[p.contactStatus] ?? 0) + 1
  }
  const stale = profiles.filter((p) => p.contactStatus === 'STALE_LOCAL_PROBE')
  const preselected = profiles.filter((p) => p.reviewStatus === 'PRESELECTED')
  const needsDetail = profiles.filter((p) => p.reviewStatus === 'NEEDS_DETAIL')
  const discarded = profiles.filter((p) => p.reviewStatus === 'DISCARDED')
  const report = {
    pinaloveRequests: 0,
    chrome: false,
    cdp: false,
    workflowApplied: n,
    analyzed: profiles.length,
    classification: {
      PRESELECTED: byStatus.PRESELECTED ?? 0,
      NEEDS_DETAIL: byStatus.NEEDS_DETAIL ?? 0,
      DISCARDED: byStatus.DISCARDED ?? 0,
      UNREVIEWED: byStatus.UNREVIEWED ?? 0,
    },
    contact: byContact,
    staleLocalProbe: stale.map((p) => p.username),
    drafts: stale.map((p) => ({ username: p.username, draft: p.draftMessage })),
    preselected: preselected.map((p) => p.username),
    needsDetailCount: needsDetail.length,
    discarded: discarded.map((p) => p.username),
    profiles: profiles.map((p) => ({
      username: p.username,
      reviewStatus: p.reviewStatus,
      contactStatus: p.contactStatus,
      location: p.location,
      country: p.country,
      lastActivityAt: p.lastActivityAt,
      hasChildren: p.hasChildren,
      maritalHistory: p.maritalHistory,
      faceVerified: p.faceVerified,
      distanceRaw: p.distanceRaw,
      distanceKm: p.distanceKm,
      distanceDisplayKm: p.distanceDisplayKm,
      distanceTrust: p.distanceTrust,
      logisticPriority: p.logisticPriority,
    })),
  }
  db.close()
  console.log(JSON.stringify(report, null, 2))
}

main()
