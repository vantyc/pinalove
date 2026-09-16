import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, describe, it } from 'node:test'
import { createApp } from './app.ts'
import { isForbiddenApiPath } from './safety.ts'

const dir = mkdtempSync(path.join(tmpdir(), 'pinalove-'))
const sqlitePath = path.join(dir, 'pinalove.sqlite')
const fixturesPath = path.join(dir, 'sample.json')

writeFileSync(
  fixturesPath,
  JSON.stringify([
    {
      externalId: 'demo-1',
      username: 'demo_ana',
      profileUrl: 'https://www.pinalove.com/profile/demo_ana',
      primaryPhotoUrl: 'https://api.dicebear.com/9.x/lorelei/svg?seed=ana',
      age: 33,
      location: 'Roma Norte, CDMX',
      country: 'Mexico',
      distanceKm: 8,
      relationshipStatus: 'SINGLE',
      maritalHistory: 'NEVER_MARRIED',
      hasChildren: 'NO',
      religion: 'Catholic',
      religionPracticeLevel: 'PRACTICING',
      headline: 'Looking for a serious relationship',
      bio: 'Faith and family. Family oriented.',
      photoVerified: true,
      profileVerified: true,
      reviewStatus: 'UNREVIEWED',
      proposedMessage: 'Hola Ana, me gustó tu enfoque de fe y familia.',
    },
    {
      externalId: 'demo-2',
      username: 'demo_discard',
      profileUrl: 'https://www.pinalove.com/profile/demo_discard',
      age: 41,
      location: 'Guadalajara',
      country: 'Mexico',
      relationshipStatus: 'SINGLE',
      maritalHistory: 'UNKNOWN',
      hasChildren: 'UNKNOWN',
      reviewStatus: 'DISCARDED',
      decisionReason: 'Incomplete critical information — kept for audit',
    },
  ]),
)

const app = createApp({
  sqlitePath,
  fixturesPath,
  seedOnEmpty: true,
  staticDir: dir,
})

after(() => {
  app.close()
  rmSync(dir, { recursive: true, force: true })
})

function listen(): Promise<string> {
  return new Promise((resolve) => {
    app.server.listen(0, '127.0.0.1', () => {
      const addr = app.server.address()
      if (!addr || typeof addr === 'string') throw new Error('no addr')
      resolve(`http://127.0.0.1:${addr.port}`)
    })
  })
}

describe('api + store', () => {
  it('forbids auto-send paths', () => {
    assert.equal(isForbiddenApiPath('/pinalove/api/send-message'), true)
    assert.equal(isForbiddenApiPath('/pinalove/api/profiles'), false)
  })

  it('seeds fixtures, lists, moves status without deleting, and keeps history', async () => {
    const base = await listen()
    const stats = await (await fetch(`${base}/pinalove/api/dashboard/stats`)).json()
    assert.equal(stats.total, 2)
    assert.equal(stats.discarded, 1)

    const listed = await (await fetch(`${base}/pinalove/api/profiles`)).json()
    const ana = listed.profiles.find((p: { username: string }) => p.username === 'demo_ana')
    assert.ok(ana)
    assert.ok(ana.score >= 70)
    assert.equal(ana.scoreReasons.length > 0, true)

    const patched = await fetch(`${base}/pinalove/api/profiles/${ana.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'SHORTLISTED', reason: 'manual review' }),
    })
    const shortlisted = await patched.json()
    assert.equal(shortlisted.reviewStatus, 'SHORTLISTED')

    const discarded = listed.profiles.find((p: { username: string }) => p.username === 'demo_discard')
    const restored = await fetch(`${base}/pinalove/api/profiles/${discarded.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'UNREVIEWED', reason: 'false positive' }),
    })
    assert.equal((await restored.json()).reviewStatus, 'UNREVIEWED')
    assert.ok(app.store.getById(discarded.id))

    const history = await (await fetch(`${base}/pinalove/api/profiles/${discarded.id}/history`)).json()
    assert.ok(history.history.length >= 2)
    assert.ok(history.history.some((h: { source: string }) => h.source === 'USER'))

    const send = await fetch(`${base}/pinalove/api/send-message`, { method: 'POST' })
    assert.equal(send.status, 404)

    const imported = await fetch(`${base}/pinalove/api/profiles/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profiles: [
          {
            externalId: 'demo-1',
            username: 'demo_ana',
            profileUrl: 'https://www.pinalove.com/profile/demo_ana',
            age: 33,
            location: 'Roma Norte, CDMX',
            country: 'Mexico',
            relationshipStatus: 'SINGLE',
            maritalHistory: 'NEVER_MARRIED',
            hasChildren: 'NO',
          },
        ],
      }),
    })
    const importResult = await imported.json()
    assert.equal(importResult.updated, 1)
    assert.equal(app.store.count(), 2)
  })
})
