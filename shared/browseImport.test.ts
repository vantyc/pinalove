import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { activityCategory, isStaleForLocalProbe, lastActivityToIso, parseUnixSeconds } from './activity.ts'
import { browseRecordToImport } from './browseImport.ts'
import { interpretDistance } from './geo.ts'
import { assignContact, generateStaleProbeDraft } from './workflow.ts'

const NOW = Date.parse('2026-09-17T01:34:00.000Z')

function isoDaysAgo(days: number, now = NOW): string {
  return new Date(now - days * 86400000).toISOString()
}

describe('browse vs match distance', () => {
  it('Browse distance 13 -> trusted 13 km', () => {
    const interpreted = interpretDistance({
      distanceRaw: 13,
      distanceKm: 13,
      location: 'Mexico City',
      country: 'MX',
      source: 'PINALOVE_BROWSE',
    })
    assert.equal(interpreted.scoringKm, 13)
    assert.equal(interpreted.displayKm, 13)
    assert.equal(interpreted.trust, 'TRUSTED')
  })

  it('Match distance 13304 -> remains untrusted', () => {
    const interpreted = interpretDistance({
      distanceRaw: 13304,
      distanceKm: null,
      location: 'Mexico City',
      country: 'Mexico',
      source: 'PINALOVE_MATCH',
    })
    assert.equal(interpreted.scoringKm, null)
    assert.equal(interpreted.trust, 'UNTRUSTED')
    assert.equal(interpreted.displayKm, 13)
  })
})

describe('lastactivity epoch seconds', () => {
  it('parses unix seconds to ISO', () => {
    assert.equal(parseUnixSeconds('1700000000'), 1700000000)
    assert.equal(lastActivityToIso('1700000000'), '2023-11-14T22:13:20.000Z')
    assert.equal(lastActivityToIso('1600000000'), '2020-09-13T12:26:40.000Z')
  })

  it('180-day boundary', () => {
    assert.equal(activityCategory(isoDaysAgo(179.9), NOW), 'STALE_180D')
    assert.equal(isStaleForLocalProbe(isoDaysAgo(179.9), NOW), false)
    assert.equal(activityCategory(isoDaysAgo(180), NOW), 'STALE_365D')
    assert.equal(isStaleForLocalProbe(isoDaysAgo(180), NOW), true)
  })

  it('365-day boundary', () => {
    assert.equal(activityCategory(isoDaysAgo(364.9), NOW), 'STALE_365D')
    assert.equal(activityCategory(isoDaysAgo(365), NOW), 'STALE_OVER_365D')
    assert.equal(isStaleForLocalProbe(isoDaysAgo(365), NOW), true)
  })
})

describe('HIGH_LOCAL logistic value', () => {
  it('HIGH_LOCAL independent from activity', () => {
    const recent = assignContact({
      reviewStatus: 'NEEDS_DETAIL',
      location: 'Mexico City',
      country: 'MX',
      lastActivityAt: isoDaysAgo(2),
      faceVerified: 'YES',
      now: NOW,
    })
    assert.equal(recent.logisticPriority, 'HIGH_LOCAL')
    assert.equal(recent.contactStatus, 'READY_TO_CONTACT')
    assert.equal(recent.stale, false)
  })

  it('HIGH_LOCAL + stale -> STALE_LOCAL_PROBE', () => {
    const contact = assignContact({
      reviewStatus: 'NEEDS_DETAIL',
      location: 'Mexico City',
      country: 'MX',
      lastActivityAt: isoDaysAgo(200),
      faceVerified: 'YES',
      now: NOW,
    })
    assert.equal(contact.logisticPriority, 'HIGH_LOCAL')
    assert.equal(contact.contactStatus, 'STALE_LOCAL_PROBE')
    assert.ok(contact.priorityReasons.includes('HIGH LOCAL LOGISTIC VALUE'))
    assert.ok(contact.uncertaintyReasons.includes('STALE ACCOUNT'))
  })

  it('children UNKNOWN does not prevent probe', () => {
    const contact = assignContact({
      reviewStatus: 'NEEDS_DETAIL',
      location: 'Mexico City',
      country: 'MX',
      lastActivityAt: isoDaysAgo(200),
      faceVerified: 'YES',
      now: NOW,
    })
    assert.equal(contact.contactStatus, 'STALE_LOCAL_PROBE')
  })

  it('marital UNKNOWN does not prevent probe', () => {
    const contact = assignContact({
      reviewStatus: 'NEEDS_DETAIL',
      location: 'Mexico City',
      country: 'MX',
      lastActivityAt: isoDaysAgo(400),
      faceVerified: 'YES',
      now: NOW,
    })
    assert.equal(contact.contactStatus, 'STALE_LOCAL_PROBE')
  })

  it('probe does not mean PRESELECTED', () => {
    const contact = assignContact({
      reviewStatus: 'NEEDS_DETAIL',
      location: 'Mexico City',
      country: 'MX',
      lastActivityAt: isoDaysAgo(200),
      faceVerified: 'YES',
      now: NOW,
    })
    assert.equal(contact.contactStatus, 'STALE_LOCAL_PROBE')
    assert.notEqual(contact.contactStatus, 'READY_TO_CONTACT')
  })
})

describe('browse import mapping', () => {
  it('bg/asltxt does not create gender fact', () => {
    const mapped = browseRecordToImport(
      {
        externalId: '900001',
        username: 'AdaLocal',
        age: 29,
        city: 'Mexico City',
        country: 'MX',
        distance: 13,
        lastactivity: '1718000000',
        headline: 'Hello',
        description: 'Cooking',
        haschildren: '0',
        wantschildren: '1',
        faceverified: 1,
        education: '0',
        lookingfor: 'Man',
        primaryPhotoUri: '/p/2024-01/{username}/synthetic001',
        bg: 'f',
        asltxt: '29 · F · Mexico City · 13km',
      },
      '2026-09-17T01:34:00.000Z',
    )
    assert.equal(mapped.gender, null)
    assert.equal(mapped.source, 'PINALOVE_BROWSE')
    const genderFact = mapped.facts?.find((f) => f.field === 'gender')
    assert.equal(genderFact?.value, 'UNKNOWN')
    assert.match(String(genderFact?.evidence), /bg\/asltxt ignored/)
    assert.equal(mapped.reviewStatus, 'NEEDS_DETAIL')
    const draft = generateStaleProbeDraft(mapped.location ?? null)
    assert.equal(/children|married|religion|year|logged in|age|29/i.test(draft), false)
  })
})
