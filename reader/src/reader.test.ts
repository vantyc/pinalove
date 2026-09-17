import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ALLOWED_READ_ACTIONS,
  FORBIDDEN_ACTIONS,
  assertAllowedReadAction,
  isAllowedReadAction,
} from './allowlist.ts'
import { MAX_PROFILES, takeMaxProfiles, assertMaterializeLimit } from './maxProfiles.ts'
import { PinaLoveReader } from './pinaloveReader.ts'
import {
  normalizeFaceVerified,
  normalizeHasChildren,
  normalizeListsNewItem,
  normalizeWantsChildren,
} from './normalizer.ts'
import { assertNoSecretsInFacts, listsNewMatchToImport } from './toImport.ts'
import { stripSensitiveFields } from './sanitize.ts'

describe('reader allowlist', () => {
  it('allows listsnew, profilenew, and browsenew', () => {
    assert.deepEqual([...ALLOWED_READ_ACTIONS], ['listsnew', 'profilenew', 'browsenew'])
    assert.equal(isAllowedReadAction('listsnew'), true)
    assert.equal(isAllowedReadAction('profilenew'), true)
    assert.equal(isAllowedReadAction('browsenew'), true)
    assert.equal(ALLOWED_READ_ACTIONS.length, 3)
  })

  it('rejects known mutators and any other action', () => {
    for (const action of FORBIDDEN_ACTIONS) {
      assert.equal(isAllowedReadAction(action), false)
      assert.throws(() => assertAllowedReadAction(action))
    }
    for (const action of ['sendmessage', 'playlikeuser', 'revealvisit', 'editmyprofilenew', 'feedprofileview']) {
      assert.equal(isAllowedReadAction(action), false)
      assert.throws(() => assertAllowedReadAction(action))
    }
  })
})

describe('PinaLoveReader is read-only', () => {
  it('does not expose write operations', () => {
    const names = Object.getOwnPropertyNames(PinaLoveReader.prototype).filter(
      (n) => n !== 'constructor',
    )
    assert.equal(names.some((n) => /send/i.test(n)), false)
    assert.deepEqual(
      names.toSorted(),
      ['assertAuthenticatedShell', 'assertSpaReady', 'getMatches', 'getProfileNew', 'openSpaAndWait'].toSorted(),
    )
    const forbidden = [
      'sendMessage',
      'sendReply',
      'like',
      'unlike',
      'unmatch',
      'block',
      'report',
      'getProfile',
      'request',
    ]
    for (const name of forbidden) {
      assert.equal(names.includes(name), false, `must not expose ${name}`)
      assert.equal(name in PinaLoveReader.prototype, false)
    }
  })
})

describe('MAX_PROFILES', () => {
  it('materializes at most 25 from one listsnew page', () => {
    const items = Array.from({ length: 40 }, (_, i) => i)
    const slice = takeMaxProfiles(items)
    assert.equal(MAX_PROFILES, 25)
    assert.equal(slice.length, 25)
    assert.throws(() => assertMaterializeLimit(26))
  })
})

describe('children / marital semantics', () => {
  it('Want children => wantsChildren YES and hasChildren stays UNKNOWN', () => {
    const wants = normalizeWantsChildren('1')
    const has = normalizeHasChildren(undefined)
    assert.equal(wants.value, 'YES')
    assert.equal(wants.confidence, 'EXPLICIT')
    assert.equal(has.value, 'UNKNOWN')
    assert.notEqual(has.value, 'YES')
  })

  it('No children => hasChildren NO', () => {
    const has = normalizeHasChildren('2')
    assert.equal(has.value, 'NO')
    assert.equal(has.confidence, 'EXPLICIT')
  })

  it("Don't want children => wantsChildren NO and hasChildren remains UNKNOWN", () => {
    const wants = normalizeWantsChildren('2')
    const has = normalizeHasChildren(undefined)
    assert.equal(wants.value, 'NO')
    assert.equal(has.value, 'UNKNOWN')
  })

  it('Single does not become NEVER_MARRIED', () => {
    const n = normalizeListsNewItem({ name: 'x', status: 'Single' })
    assert.equal(n.relationshipStatus.value, 'UNKNOWN')
    assert.equal(n.maritalHistory.value, 'UNKNOWN')
    assert.notEqual(n.maritalHistory.value, 'NEVER_MARRIED')
  })

  it('missing values are UNKNOWN', () => {
    const n = normalizeListsNewItem({ name: 'x' })
    assert.equal(n.hasChildren.value, 'UNKNOWN')
    assert.equal(n.wantsChildren.value, 'UNKNOWN')
    assert.equal(n.faceVerified.value, 'UNKNOWN')
    assert.equal(n.religion.value, null)
    assert.equal(n.religion.confidence, 'NONE')
  })

  it('Maybe wants children is not YES or NO', () => {
    const wants = normalizeWantsChildren('3')
    assert.equal(wants.value, 'UNKNOWN')
    assert.equal(wants.sourceValue, '3')
  })

  it('haschildren 1 is UNKNOWN until demonstrated, not YES', () => {
    const has = normalizeHasChildren('1')
    assert.equal(has.value, 'UNKNOWN')
    assert.equal(has.sourceValue, '1')
    assert.notEqual(has.value, 'YES')
  })

  it('faceverified 0 is UNKNOWN not NO', () => {
    const v = normalizeFaceVerified(0)
    assert.equal(v.value, 'UNKNOWN')
    assert.notEqual(v.value, 'NO')
  })

  it('does not use avatar/nophoto as thumbnail', () => {
    const n = normalizeListsNewItem({
      name: 'x',
      avatar: '/i/nophoto.jpg',
      photos: [],
    })
    assert.equal(n.primaryPhotoUrl.value, null)
  })

  it('uses first photos[].Uri only', () => {
    const n = normalizeListsNewItem({
      name: 'x',
      avatar: '/i/nophoto.jpg',
      photos: [{ Uri: '/p/2026-09/x/abc' }],
    })
    assert.equal(n.primaryPhotoUrl.value, 'https://www.pinalove.com/p/2026-09/x/abc-medium.jpg')
  })
})

describe('listsnew ingest mapping', () => {
  it('does not treat distance as km and keeps UNKNOWN children', () => {
    const n = normalizeListsNewItem({
      id: 1,
      name: 'AdaLocal',
      age: 29,
      city: 'Mexico City',
      country: 'Mexico',
      haschildren: '0',
      wantschildren: '0',
      faceverified: 1,
      distance: 13304,
      photos: [{ Uri: '/p/2026-09/AdaLocal/abc' }],
    })
    const input = listsNewMatchToImport({
      raw: {
        sourceUrl: 'https://www.pinalove.com/AdaLocal',
        externalId: '1',
        extractedAt: '2026-09-16T00:00:00.000Z',
        sourceAction: 'listsnew',
        original: {
          haschildren: '0',
          wantschildren: '0',
          faceverified: 1,
          distance: 13304,
        },
      },
      presentFields: ['haschildren'],
      normalized: n,
    })
    assert.equal(input.distanceKm, null)
    assert.equal(input.distanceRaw, 13304)
    assert.equal(input.hasChildren, 'UNKNOWN')
    assert.equal(input.reviewStatus, 'NEEDS_DETAIL')
    assert.equal(input.source, 'PINALOVE')
    assert.equal(input.fieldFacts?.distance.normalizedValue, null)
    assertNoSecretsInFacts(input.fieldFacts ?? {})
  })

  it('refuses secret-like field fact keys', () => {
    assert.throws(() =>
      assertNoSecretsInFacts({
        authToken: { rawValue: 'x', normalizedValue: 'x' },
      }),
    )
  })
})

describe('stripSensitiveFields', () => {
  it('redacts tokens and emails without dropping profile id', () => {
    const stripped = stripSensitiveFields({
      id: 1001,
      name: 'AdaLocal',
      authToken: 'secret',
      email: 'hidden@example.com',
      nested: { PHPSESSID: 'abc', age: 35 },
    }) as Record<string, unknown>
    assert.equal(stripped.id, 1001)
    assert.equal(stripped.name, 'AdaLocal')
    assert.equal(stripped.authToken, '[REDACTED]')
    assert.equal(stripped.email, '[REDACTED]')
    assert.equal((stripped.nested as Record<string, unknown>).PHPSESSID, '[REDACTED]')
    assert.equal((stripped.nested as Record<string, unknown>).age, 35)
  })
})
