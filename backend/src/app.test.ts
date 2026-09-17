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

let baseUrl: string | null = null

function listen(): Promise<string> {
  if (baseUrl) return Promise.resolve(baseUrl)
  return new Promise((resolve) => {
    app.server.listen(0, '127.0.0.1', () => {
      const addr = app.server.address()
      if (!addr || typeof addr === 'string') throw new Error('no addr')
      baseUrl = `http://127.0.0.1:${addr.port}`
      resolve(baseUrl)
    })
  })
}

describe('api + store', () => {
  it('forbids auto-send paths', () => {
    assert.equal(isForbiddenApiPath('/pinalove/api/send-message'), true)
    assert.equal(isForbiddenApiPath('/pinalove/api/sendmessage'), true)
    assert.equal(isForbiddenApiPath('/pinalove/api/playlikeuser'), true)
    assert.equal(isForbiddenApiPath('/pinalove/api/hideuser'), true)
    assert.equal(isForbiddenApiPath('/pinalove/api/blockuser'), true)
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

    const pinalove = await fetch(`${base}/pinalove/api/profiles/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profiles: [
          {
            externalId: 'pl-1',
            username: 'listsnew_one',
            profileUrl: 'https://www.pinalove.com/listsnew_one',
            source: 'PINALOVE',
            hasChildren: 'UNKNOWN',
            wantsChildren: 'UNKNOWN',
            faceVerified: 'YES',
            photoVerified: true,
            distanceRaw: 13304,
            distanceKm: null,
            maritalHistory: 'UNKNOWN',
            relationshipStatus: 'UNKNOWN',
            reviewStatus: 'NEEDS_DETAIL',
            classificationReasons: ['listsnew cannot confirm marital status'],
            missingDetail: ['children', 'marital status', 'religion', 'occupation'],
            fieldFacts: {
              distance: { rawValue: 13304, normalizedValue: null },
              haschildren: { rawValue: '0', normalizedValue: 'UNKNOWN' },
            },
          },
        ],
      }),
    })
    const pinaloveResult = await pinalove.json()
    assert.equal(pinaloveResult.imported, 1)
    const listed2 = await (await fetch(`${base}/pinalove/api/profiles`)).json()
    const real = listed2.profiles.find((p: { username: string }) => p.username === 'listsnew_one')
    assert.equal(real.reviewStatus, 'NEEDS_DETAIL')
    assert.equal(real.hasChildren, 'UNKNOWN')
    assert.equal(real.distanceKm, null)
    assert.equal(real.distanceRaw, 13304)
    assert.equal(real.faceVerified, 'YES')
    const stats2 = await (await fetch(`${base}/pinalove/api/dashboard/stats`)).json()
    assert.equal(stats2.needsDetail, 1)
  })

  it('local stale becomes STALE_LOCAL_PROBE, draft is local-only, mark-sent writes SQLite', async () => {
    const base = await listen()
    const imported = await fetch(`${base}/pinalove/api/profiles/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profiles: [
          {
            externalId: 'local-stale-demo',
            username: 'AdaStaleLocal',
            profileUrl: 'https://www.pinalove.com/AdaStaleLocal',
            source: 'PINALOVE',
            age: 23,
            location: 'Mexico City',
            country: 'Mexico',
            distanceRaw: 13304,
            distanceKm: null,
            lastActivityAt: '2025-10-16T12:00:00.000Z',
            hasChildren: 'UNKNOWN',
            maritalHistory: 'UNKNOWN',
            faceVerified: 'YES',
            photoVerified: true,
            reviewStatus: 'NEEDS_DETAIL',
          },
        ],
      }),
    })
    assert.equal((await imported.json()).imported, 1)
    const applied = app.store.applyLocalWorkflow(Date.parse('2026-09-16T19:00:00.000Z'))
    assert.ok(applied >= 1)
    const listed = await (await fetch(`${base}/pinalove/api/profiles?contactStatus=STALE_LOCAL_PROBE`)).json()
    const pat = listed.profiles.find((p: { username: string }) => p.username === 'AdaStaleLocal')
    assert.ok(pat)
    assert.equal(pat.reviewStatus, 'NEEDS_DETAIL')
    assert.notEqual(pat.reviewStatus, 'DISCARDED')
    assert.equal(pat.contactStatus, 'STALE_LOCAL_PROBE')
    assert.equal(pat.distanceKm, null)
    assert.equal(pat.distanceDisplayKm, 13)
    assert.equal(pat.distanceTrust, 'UNTRUSTED')
    assert.match(pat.draftMessage, /Mexico City/)
    assert.equal(/never married|children|religion/i.test(pat.draftMessage), false)

    const sentRes = await fetch(`${base}/pinalove/api/profiles/${pat.id}/contact`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark-sent' }),
    })
    const sentProfile = await sentRes.json()
    assert.equal(sentProfile.contactStatus, 'PROBE_SENT')
    assert.ok(sentProfile.manuallySentAt)
    assert.equal(sentProfile.reviewStatus, 'NEEDS_DETAIL')
    assert.equal(app.store.getById(pat.id)?.contactStatus, 'PROBE_SENT')

    const sendmessage = await fetch(`${base}/pinalove/api/sendmessage`, { method: 'POST' })
    assert.equal(sendmessage.status, 404)
  })

  it('frontend sources cannot trigger sendmessage', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs')
    const { join } = await import('node:path')
    const root = join(process.cwd(), 'frontend/src')
    const files: string[] = []
    const walk = (folder: string) => {
      for (const name of readdirSync(folder)) {
        const p = join(folder, name)
        if (statSync(p).isDirectory()) walk(p)
        else if (/\.(ts|tsx)$/.test(name)) files.push(p)
      }
    }
    walk(root)
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      assert.equal(/sendmessage/i.test(text), false, file)
      assert.equal(/auto-send/i.test(text), false, file)
    }
  })

  it('apply-workflow script never talks to PinaLove', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const text = readFileSync(join(process.cwd(), 'scripts/apply-workflow.ts'), 'utf8')
    assert.equal(/pinalove\.com|playwright|chromium|profilenew|listsnew|sendmessage/i.test(text), false)
  })

  it('import-browse-deck script never talks to PinaLove', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const text = readFileSync(join(process.cwd(), 'scripts/import-browse-deck.ts'), 'utf8')
    assert.equal(/playwright|chromium|connectOverCDP|browsenew|listsnew|profilenew|sendmessage/i.test(text), false)
    assert.equal(/fetch\(/i.test(text), false)
  })

  it('Mark as sent is SQLite only and asks for human confirmation in the UI', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const ui = readFileSync(join(process.cwd(), 'frontend/src/ProbeDraft.tsx'), 'utf8')
    assert.match(ui, /Confirm that you manually sent this message on PinaLove\./)
    assert.equal(/sendmessage|playlikeuser|apiRequest/i.test(ui), false)
    const store = readFileSync(join(process.cwd(), 'backend/src/store.ts'), 'utf8')
    assert.match(store, /marked as sent \(manual, local only\)/)
    assert.equal(/pinalove\.com\/nt|sendmessage/i.test(store), false)
  })

  it('externalId dedupe across MATCH/BROWSE and browse distance is trusted', async () => {
    const base = await listen()
    const matchImport = await fetch(`${base}/pinalove/api/profiles/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profiles: [
          {
            externalId: '900001',
            username: 'AdaLocal',
            profileUrl: 'https://www.pinalove.com/AdaLocal',
            source: 'PINALOVE_MATCH',
            age: 29,
            location: 'Mexico City',
            country: 'MX',
            distanceRaw: 13304,
            distanceKm: null,
            lastActivityAt: '2025-01-01T00:00:00.000Z',
            hasChildren: 'UNKNOWN',
            maritalHistory: 'UNKNOWN',
            faceVerified: 'YES',
            photoVerified: true,
            reviewStatus: 'NEEDS_DETAIL',
            gender: null,
          },
        ],
      }),
    })
    assert.equal((await matchImport.json()).imported, 1)
    const browseImport = await fetch(`${base}/pinalove/api/profiles/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profiles: [
          {
            externalId: '900001',
            username: 'AdaLocal',
            profileUrl: 'https://www.pinalove.com/AdaLocal',
            source: 'PINALOVE_BROWSE',
            age: 29,
            location: 'Mexico City',
            country: 'MX',
            distanceRaw: 13,
            distanceKm: 13,
            lastActivityAt: '2025-01-01T00:00:00.000Z',
            hasChildren: 'UNKNOWN',
            maritalHistory: 'UNKNOWN',
            faceVerified: 'YES',
            photoVerified: true,
            reviewStatus: 'NEEDS_DETAIL',
            gender: null,
            facts: [
              {
                field: 'gender',
                value: 'UNKNOWN',
                source: 'BROWSENEW_STRUCTURED_FIELD',
                evidence: 'gender field absent; bg/asltxt ignored',
                confidence: 'NONE',
              },
            ],
          },
        ],
      }),
    })
    const browseResult = await browseImport.json()
    assert.equal(browseResult.imported, 0)
    assert.equal(browseResult.updated, 1)
    app.store.applyLocalWorkflow(Date.parse('2026-09-17T01:34:00.000Z'))
    const listed = await (await fetch(`${base}/pinalove/api/profiles`)).json()
    const pats = listed.profiles.filter((p: { externalId: string }) => p.externalId === '900001')
    assert.equal(pats.length, 1)
    assert.ok(pats[0].sources.includes('PINALOVE_MATCH'))
    assert.ok(pats[0].sources.includes('PINALOVE_BROWSE'))
    assert.equal(pats[0].distanceKm, 13)
    assert.equal(pats[0].distanceTrust, 'TRUSTED')
    assert.equal(pats[0].contactStatus, 'STALE_LOCAL_PROBE')
    assert.equal(pats[0].reviewStatus, 'NEEDS_DETAIL')
    assert.equal(pats[0].logisticPriority, 'HIGH_LOCAL')
    assert.equal(pats[0].gender, null)
    const genderFact = pats[0].facts.find((f: { field: string }) => f.field === 'gender')
    assert.equal(genderFact?.value, 'UNKNOWN')

    const sentRes = await fetch(`${base}/pinalove/api/profiles/${pats[0].id}/contact`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark-sent' }),
    })
    const sent = await sentRes.json()
    assert.equal(sent.contactStatus, 'PROBE_SENT')
    assert.equal(app.store.getById(pats[0].id)?.contactStatus, 'PROBE_SENT')

    const replied = await fetch(`${base}/pinalove/api/profiles/${pats[0].id}/contact`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'replied' }),
    })
    assert.equal((await replied.json()).contactStatus, 'REPLIED')
  })
})
