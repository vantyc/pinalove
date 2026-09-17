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
    assert.equal(isForbiddenApiPath('/pinalove/api/mailboxnew'), true)
    assert.equal(isForbiddenApiPath('/pinalove/api/markasread'), true)
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
      assert.equal(/playlikeuser|playhideuser|hideuser|blockuser|unlike/i.test(text), false, file)
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

  it('does not regenerate drafts after mark-sent or REPLIED', async () => {
    const base = await listen()
    const imported = await fetch(`${base}/pinalove/api/profiles/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profiles: [
          {
            externalId: 'freeze-draft-1',
            username: 'FreezeDraft',
            profileUrl: 'https://www.pinalove.com/FreezeDraft',
            source: 'PINALOVE',
            location: 'Cebu',
            country: 'PH',
            lastActivityAt: '2026-09-16T12:00:00.000Z',
            faceVerified: 'YES',
            hasChildren: 'NO',
            reviewStatus: 'PRESELECTED',
          },
        ],
      }),
    })
    assert.equal((await imported.json()).imported, 1)
    app.store.applyLocalWorkflow(Date.parse('2026-09-16T19:00:00.000Z'))
    const listed = await (await fetch(`${base}/pinalove/api/profiles`)).json()
    const row = listed.profiles.find((p: { username: string }) => p.username === 'FreezeDraft')
    assert.ok(row.draftMessage)
    const original = row.draftMessage
    const sentRes = await fetch(`${base}/pinalove/api/profiles/${row.id}/contact`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark-sent' }),
    })
    const sent = await sentRes.json()
    assert.equal(sent.contactStatus, 'MESSAGE_SENT')
    assert.ok(sent.manuallySentAt)
    app.store.applyLocalWorkflow(Date.parse('2026-09-16T20:00:00.000Z'))
    const afterSent = app.store.getById(row.id)
    assert.equal(afterSent?.draftMessage, original)
    assert.equal(afterSent?.contactStatus, 'MESSAGE_SENT')

    await fetch(`${base}/pinalove/api/profiles/${row.id}/contact`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'replied' }),
    })
    app.store.applyLocalWorkflow(Date.parse('2026-09-16T21:00:00.000Z'))
    const afterReply = app.store.getById(row.id)
    assert.equal(afterReply?.contactStatus, 'REPLIED')
    assert.equal(afterReply?.draftMessage, original)
  })

  it('blocks anonymous HTML and API when AUTH_PROXY_HEADER is required', async () => {
    const gatedDir = mkdtempSync(path.join(tmpdir(), 'pinalove-auth-'))
    const gated = createApp({
      sqlitePath: path.join(gatedDir, 'pinalove.sqlite'),
      fixturesPath,
      seedOnEmpty: true,
      staticDir: dir,
      authProxyHeader: 'X-Viajes-User',
    })
    const url: string = await new Promise((resolve) => {
      gated.server.listen(0, '127.0.0.1', () => {
        const addr = gated.server.address()
        if (!addr || typeof addr === 'string') throw new Error('no addr')
        resolve(`http://127.0.0.1:${addr.port}`)
      })
    })
    try {
      const home = await fetch(`${url}/pinalove/`, { redirect: 'manual' })
      assert.equal(home.status, 302)
      assert.equal(home.headers.get('location'), '/login')
      const api = await fetch(`${url}/pinalove/api/profiles`)
      assert.equal(api.status, 401)
      const apiText = await api.text()
      assert.equal(/demo_ana|username|draftMessage|primaryPhotoUrl/i.test(apiText), false)
      const health = await fetch(`${url}/pinalove/healthz`)
      assert.equal(health.status, 200)
      const ok = await fetch(`${url}/pinalove/api/dashboard/stats`, {
        headers: { 'X-Viajes-User': 'tester' },
      })
      assert.equal(ok.status, 200)
      const stats = await ok.json()
      assert.equal(typeof stats.total, 'number')
      const session = await fetch(`${url}/pinalove/api/session`, {
        headers: { 'X-Viajes-User': 'tester' },
      })
      assert.equal(session.status, 200)
      assert.equal((await session.json()).user, 'tester')
      const sessionAnon = await fetch(`${url}/pinalove/api/session`)
      assert.equal(sessionAnon.status, 401)
    } finally {
      gated.close()
      rmSync(gatedDir, { recursive: true, force: true })
    }
  })

  it('ingress and deploy keep ForwardAuth on /pinalove and /pinalove/api', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const ingress = readFileSync(join(process.cwd(), 'deploy/k3s/02-ingress.yaml'), 'utf8')
    assert.match(ingress, /tool4trip-tool4trip-forwardauth@kubernetescrd/)
    assert.match(ingress, /path: \/pinalove/)
    assert.match(ingress, /pathType: Prefix/)
    const deploy = readFileSync(join(process.cwd(), 'deploy/k3s/00-deployment.yaml'), 'utf8')
    assert.match(deploy, /AUTH_PROXY_HEADER/)
    assert.match(deploy, /X-Viajes-User/)
  })

  it('manual discard is SQLite-only, keeps the row, and leaves the message queues', async () => {
    const base = await listen()
    const imported = await fetch(`${base}/pinalove/api/profiles/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profiles: [
          {
            externalId: 'discard-manual-1',
            username: 'DiscardMe',
            profileUrl: 'https://www.pinalove.com/DiscardMe',
            source: 'PINALOVE',
            location: 'Cebu',
            country: 'PH',
            lastActivityAt: '2026-09-16T12:00:00.000Z',
            faceVerified: 'YES',
            photoVerified: true,
            hasChildren: 'NO',
            maritalHistory: 'NEVER_MARRIED',
            occupation: 'nurse',
            facts: [
              {
                field: 'occupation',
                value: 'nurse',
                source: 'DESCRIPTION',
                evidence: 'nurse',
                confidence: 'EXPLICIT',
              },
            ],
            reviewStatus: 'PRESELECTED',
          },
        ],
      }),
    })
    assert.equal((await imported.json()).imported, 1)
    app.store.applyLocalWorkflow(Date.parse('2026-09-16T19:00:00.000Z'))
    const listed = await (await fetch(`${base}/pinalove/api/profiles`)).json()
    const row = listed.profiles.find((p: { username: string }) => p.username === 'DiscardMe')
    assert.equal(row.contactStatus, 'READY_TO_CONTACT')
    assert.ok(row.draftMessage)
    const factsBefore = JSON.stringify(row.facts)
    const photoBefore = row.primaryPhotoUrl
    const statsBefore = await (await fetch(`${base}/pinalove/api/dashboard/stats`)).json()

    const discarded = await fetch(`${base}/pinalove/api/profiles/${row.id}/contact`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'discard' }),
    })
    const after = await discarded.json()
    assert.equal(after.reviewStatus, 'DISCARDED')
    assert.equal(after.contactStatus, 'NONE')
    assert.equal(after.decisionReason, 'Manual discard')
    assert.ok(after.lastHumanActionAt)
    assert.equal(JSON.stringify(after.facts), factsBefore)
    assert.equal(after.draftMessage, row.draftMessage)
    assert.ok(app.store.getById(row.id))
    const statsAfter = await (await fetch(`${base}/pinalove/api/dashboard/stats`)).json()
    assert.equal(statsAfter.discarded, statsBefore.discarded + 1)
    assert.equal(statsAfter.readyToContact, statsBefore.readyToContact - 1)
    assert.equal(statsAfter.preselected, statsBefore.preselected - 1)
    const sendmessage = await fetch(`${base}/pinalove/api/sendmessage`, { method: 'POST' })
    assert.equal(sendmessage.status, 404)
    void photoBefore

    const restored = await fetch(`${base}/pinalove/api/profiles/${row.id}/contact`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'restore' }),
    })
    const back = await restored.json()
    assert.equal(back.reviewStatus, 'PRESELECTED')
    assert.equal(back.contactStatus, 'READY_TO_CONTACT')
    assert.ok(back.lastHumanActionAt)
    const history = await (await fetch(`${base}/pinalove/api/profiles/${row.id}/history`)).json()
    assert.ok(history.history.some((h: { reason: string }) => /manual discard/i.test(h.reason)))
    assert.ok(history.history.some((h: { reason: string }) => /restored by user/i.test(h.reason)))
  })

  it('STALE_LOCAL_PROBE discard leaves the local probe queue', async () => {
    const base = await listen()
    const imported = await fetch(`${base}/pinalove/api/profiles/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profiles: [
          {
            externalId: 'discard-stale-1',
            username: 'StaleDiscard',
            profileUrl: 'https://www.pinalove.com/StaleDiscard',
            source: 'PINALOVE_BROWSE',
            location: 'Mexico City',
            country: 'Mexico',
            lastActivityAt: '2025-01-01T00:00:00.000Z',
            faceVerified: 'YES',
            photoVerified: true,
            hasChildren: 'UNKNOWN',
            maritalHistory: 'UNKNOWN',
            reviewStatus: 'NEEDS_DETAIL',
          },
        ],
      }),
    })
    assert.equal((await imported.json()).imported, 1)
    app.store.applyLocalWorkflow(Date.parse('2026-09-16T19:00:00.000Z'))
    const listed = await (await fetch(`${base}/pinalove/api/profiles`)).json()
    const row = listed.profiles.find((p: { username: string }) => p.username === 'StaleDiscard')
    assert.equal(row.contactStatus, 'STALE_LOCAL_PROBE')
    assert.equal(row.reviewStatus, 'NEEDS_DETAIL')
    const after = await (
      await fetch(`${base}/pinalove/api/profiles/${row.id}/contact`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'discard' }),
      })
    ).json()
    assert.equal(after.reviewStatus, 'DISCARDED')
    assert.equal(after.contactStatus, 'NONE')
    const stats = await (await fetch(`${base}/pinalove/api/dashboard/stats`)).json()
    assert.equal(
      (await (await fetch(`${base}/pinalove/api/profiles?contactStatus=STALE_LOCAL_PROBE`)).json()).profiles.some(
        (p: { username: string }) => p.username === 'StaleDiscard',
      ),
      false,
    )
    assert.ok(stats.staleLocalProbe >= 0)
  })

  it('UI logout uses existing /logout and Discard stays local', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const shell = readFileSync(join(process.cwd(), 'frontend/src/AppShell.tsx'), 'utf8')
    assert.match(shell, /href="\/logout"/)
    assert.equal(/window\.location\s*=\s*['"]\/login['"]/.test(shell), false)
    const draftUi = readFileSync(join(process.cwd(), 'frontend/src/ProbeDraft.tsx'), 'utf8')
    assert.match(draftUi, />\s*Discard\s*</)
    assert.match(draftUi, /Copy message/)
    assert.match(draftUi, /Open profile/)
    assert.match(draftUi, /Mark as sent/)
    assert.equal(/sendmessage|playlikeuser|hideuser|playhideuser|blockuser/i.test(draftUi), false)
    const confirm = readFileSync(join(process.cwd(), 'frontend/src/discard.ts'), 'utf8')
    assert.match(confirm, /Discard this profile from your review queue\?/)
    assert.match(confirm, /already marked as sent/)
    assert.match(confirm, /recorded reply/)
    const ui = readFileSync(join(process.cwd(), 'frontend/src/ActionRequiredList.tsx'), 'utf8')
    assert.match(ui, /NEW INBOUND — REVIEW FIRST/)
    assert.match(ui, /INTERESTED/)
    assert.match(ui, /DISCARD/)
    assert.match(ui, /OPEN PROFILE/)
    assert.match(ui, /REPLIES \/ INBOX/)
    assert.match(ui, /Women who wrote to you/)
    assert.match(ui, /Open conversation/)
    assert.match(ui, /Mark replied/)
    assert.match(ui, /Ignore \/ Archive/)
    assert.equal(/sendmessage|mailboxnew|convonew|markasread|hideuser|blockuser|playhideuser/i.test(ui), false)
    assert.equal(/\bSend\b/.test(ui), false)
  })

  it('merges mailbox inbox by username without inventing externalId or reclassifying', async () => {
    await listen()
    const before = app.store.list({})
    const ana = before.find((p) => p.username === 'demo_ana')
    assert.ok(ana)
    const anaStatus = ana.reviewStatus
    const anaContact = ana.contactStatus
    const anaExternal = ana.externalId
    const result = app.store.ingestMailbox([
      {
        username: 'demo_ana',
        mailid: 'mail-ana-1',
        sender: 1,
        text: 'Hi, are you still in CDMX?',
        time: 1758086400,
        lastactivity: 1758086400,
        unread: true,
        age: 99,
        city: 'ShouldNotOverwrite',
        gender: 'female',
        faceVerified: 'YES',
        primaryPhotoUrl: 'https://www.pinalove.com/p/x.jpg',
        replied: 0,
        premium: 0,
      },
      {
        username: 'BrandNewInbox',
        mailid: 'mail-new-1',
        sender: 1,
        text: 'hello good morning',
        time: 1758086500,
        lastactivity: 1758086500,
        unread: true,
        age: 28,
        city: 'Cebu',
        gender: 'female',
        faceVerified: 'UNKNOWN',
        primaryPhotoUrl: 'https://www.pinalove.com/p/n.jpg',
        replied: 0,
        premium: 0,
      },
    ])
    assert.equal(result.messages, 2)
    assert.equal(result.merged, 1)
    assert.equal(result.inserted, 1)
    const after = app.store.list({})
    const anaAfter = after.find((p) => p.username === 'demo_ana')
    assert.ok(anaAfter)
    assert.equal(anaAfter.id, ana.id)
    assert.equal(anaAfter.externalId, anaExternal)
    assert.equal(anaAfter.reviewStatus, anaStatus)
    assert.equal(anaAfter.contactStatus, anaContact)
    assert.equal(anaAfter.age, ana.age)
    assert.equal(anaAfter.location, ana.location)
    assert.equal(anaAfter.inboundUnread, true)
    assert.equal(anaAfter.inboundReviewStatus, 'PENDING')
    assert.equal(anaAfter.conversationNeedsReply, false)
    assert.match(anaAfter.lastInboundPreview ?? '', /CDMX/)
    const fresh = after.find((p) => p.username === 'BrandNewInbox')
    assert.ok(fresh)
    assert.equal(fresh.externalId, null)
    assert.equal(fresh.inboxIdentity, 'BrandNewInbox')
    assert.equal(fresh.inboxMailId, 'mail-new-1')
    assert.equal(fresh.source, 'PINALOVE_INBOX')
    assert.equal(fresh.reviewStatus, 'UNREVIEWED')
    assert.equal(fresh.contactStatus, 'NONE')
    assert.equal(fresh.inboundReviewStatus, 'PENDING')
    assert.equal(fresh.conversationNeedsReply, false)
    assert.equal(fresh.inboundUnread, true)
    assert.equal(result.needsReply, 0)
    app.store.applyLocalWorkflow(Date.parse('2026-09-17T04:00:00.000Z'))
    assert.equal(app.store.getById(fresh.id)?.contactStatus, 'NONE')
    assert.equal(app.store.getById(anaAfter.id)?.reviewStatus, anaStatus)
    const archived = await fetch(`${(await listen())}/pinalove/api/profiles/${fresh.id}/contact`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'archive' }),
    })
    const archivedJson = await archived.json()
    assert.equal(archived.status, 200)
    assert.equal(archivedJson.conversationNeedsReply, false)
    const again = app.store.ingestMailbox([
      {
        username: 'BrandNewInbox',
        mailid: 'mail-new-1',
        sender: 1,
        text: 'hello again',
        time: 1758086600,
        lastactivity: 1758086600,
        unread: true,
        age: 28,
        city: 'Cebu',
        gender: 'female',
        faceVerified: 'UNKNOWN',
        primaryPhotoUrl: 'https://www.pinalove.com/p/n.jpg',
        replied: 0,
        premium: 0,
      },
    ])
    assert.equal(again.inserted, 0)
    assert.equal(again.merged, 1)
    assert.equal(app.store.list({}).filter((p) => p.username === 'BrandNewInbox').length, 1)
  })

  it('inbound review: PENDING first, INTERESTED to REPLIES, DISCARD local only', async () => {
    const base = await listen()
    const mailbox = (username: string, text: string) => ({
      username,
      mailid: `mail-${username}`,
      sender: 1,
      text,
      time: 1758087000,
      lastactivity: 1758087000,
      unread: true,
      age: 41,
      city: 'Cebu City',
      gender: 'female',
      faceVerified: 'UNKNOWN' as const,
      primaryPhotoUrl: `https://www.pinalove.com/p/${username}.jpg`,
      replied: 0,
      premium: 0,
    })

    const unknown = app.store.ingestMailbox([mailbox('UnknownInbound', 'hi from cebu')])
    assert.equal(unknown.inserted, 1)
    assert.equal(unknown.needsReply, 0)
    const pending = app.store.list({}).find((p) => p.username === 'UnknownInbound')
    assert.ok(pending)
    assert.equal(pending.inboundReviewStatus, 'PENDING')
    assert.equal(pending.inboundUnread, true)
    assert.equal(pending.conversationNeedsReply, false)
    const statsPending = app.store.stats()
    assert.ok(statsPending.pendingInbound >= 1)
    assert.equal(
      statsPending.needsReply,
      app.store.list({}).filter((p) => p.conversationNeedsReply).length,
    )

    const interestedRes = await fetch(`${base}/pinalove/api/profiles/${pending.id}/contact`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'interested' }),
    })
    const interestedJson = await interestedRes.json()
    assert.equal(interestedRes.status, 200)
    assert.equal(interestedJson.inboundReviewStatus, 'INTERESTED')
    assert.equal(interestedJson.conversationNeedsReply, true)
    assert.equal(interestedJson.inboundUnread, true)
    assert.equal(interestedJson.lastInboundPreview, 'hi from cebu')
    const statsInterested = app.store.stats()
    assert.ok(statsInterested.interestedInbound >= 1)
    assert.ok(statsInterested.needsReply >= 1)

    const toDiscard = app.store.ingestMailbox([mailbox('DiscardInbound', 'hello good morning')])
    assert.equal(toDiscard.inserted, 1)
    const discardRow = app.store.list({}).find((p) => p.username === 'DiscardInbound')
    assert.ok(discardRow)
    const discardedRes = await fetch(`${base}/pinalove/api/profiles/${discardRow.id}/contact`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'discard' }),
    })
    const discardedJson = await discardedRes.json()
    assert.equal(discardedRes.status, 200)
    assert.equal(discardedJson.inboundReviewStatus, 'DISCARDED')
    assert.equal(discardedJson.reviewStatus, 'DISCARDED')
    assert.equal(discardedJson.conversationNeedsReply, false)
    assert.equal(discardedJson.lastInboundPreview, 'hello good morning')
    assert.equal(discardedJson.inboundUnread, true)

    const imported = await fetch(`${base}/pinalove/api/profiles/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profiles: [
          {
            externalId: 'known-sent-1',
            username: 'KnownSentInbox',
            profileUrl: 'https://www.pinalove.com/KnownSentInbox',
            source: 'PINALOVE',
            age: 36,
            location: 'Cebu',
            reviewStatus: 'PRESELECTED',
          },
        ],
      }),
    })
    assert.equal((await imported.json()).imported, 1)
    const known = app.store.list({}).find((p) => p.username === 'KnownSentInbox')
    assert.ok(known)
    const sent = await fetch(`${base}/pinalove/api/profiles/${known.id}/contact`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark-sent' }),
    })
    assert.equal((await sent.json()).contactStatus, 'MESSAGE_SENT')
    const knownIngest = app.store.ingestMailbox([mailbox('KnownSentInbox', 'thanks for writing')])
    assert.equal(knownIngest.merged, 1)
    assert.equal(knownIngest.needsReply, 1)
    const knownAfter = app.store.getById(known.id)
    assert.ok(knownAfter)
    assert.equal(knownAfter.inboundReviewStatus, 'INTERESTED')
    assert.equal(knownAfter.conversationNeedsReply, true)
    assert.equal(knownAfter.inboundUnread, true)

    const juliaEmma = app.store.ingestMailbox([
      mailbox('Julia9346', 'hi'),
      mailbox('Emma7093', 'Hello good morning'),
    ])
    assert.equal(juliaEmma.inserted, 2)
    const db = (app.store as unknown as { db: { prepare: (sql: string) => { run: (...a: unknown[]) => void } } }).db
    db.prepare(
      `UPDATE profiles SET inbound_review_status = NULL, conversation_needs_reply = 1
       WHERE username IN (?, ?)`,
    ).run('Julia9346', 'Emma7093')
    app.store.applyInboundReviewMigration()
    app.store.applyInboundReviewMigration()
    for (const name of ['Julia9346', 'Emma7093']) {
      const row = app.store.list({}).find((p) => p.username === name)
      assert.ok(row)
      assert.equal(row.inboundReviewStatus, 'PENDING')
      assert.equal(row.conversationNeedsReply, false)
      assert.ok(row.lastInboundPreview)
    }

    assert.equal(isForbiddenApiPath('/pinalove/api/profiles/x/contact'), false)
    assert.equal(isForbiddenApiPath('/pinalove/api/sendmessage'), true)
    assert.equal(isForbiddenApiPath('/pinalove/api/mailboxnew'), true)
    assert.equal(isForbiddenApiPath('/pinalove/api/convonew'), true)
    assert.equal(isForbiddenApiPath('/pinalove/api/markasread'), true)
    const { readFileSync } = await import('node:fs')
    const storeSrc = readFileSync(new URL('./store.ts', import.meta.url), 'utf8')
    assert.match(storeSrc, /markInboundInterested/)
    assert.equal(/apiRequest|sendmessage|mailboxnew|convonew|markasread|hideuser|blockuser/.test(storeSrc), false)
    const ui = readFileSync(path.join(process.cwd(), 'frontend/src/ActionRequiredList.tsx'), 'utf8')
    assert.equal(/sendmessage|mailboxnew|convonew|markasread|hideuser|blockuser/.test(ui), false)
  })
})
