import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { generateOpeningDraft } from './drafts.ts'
import { assignContact, generateStaleProbeDraft } from './workflow.ts'

const now = Date.parse('2026-09-16T19:00:00.000Z')

function assertQuestion(draft: string) {
  assert.match(draft, /\?/)
}

function assertNoPermissionAsk(draft: string) {
  assert.equal(/would you like to (chat|talk)/i.test(draft), false)
}

function assertNoSensitive(draft: string) {
  assert.equal(
    /children|kids|haschildren|wantschildren|married|never married|marital|religion|catholic|unknown|verified|score|filter|provenance/i.test(
      draft,
    ),
    false,
  )
}

describe('normal opening drafts', () => {
  it('does not ask permission to chat or talk', () => {
    const draft = generateOpeningDraft({
      username: 'Nechn',
      location: 'Cebu City',
      headline: null,
      bio: null,
      occupation: null,
    })
    assertNoPermissionAsk(draft)
    assertQuestion(draft)
  })

  it('contains an easy question', () => {
    const draft = generateOpeningDraft({
      username: 'Someone',
      location: null,
      headline: null,
      bio: null,
      occupation: null,
    })
    assertQuestion(draft)
    assert.match(draft, /Hi /)
  })

  it('personalizes from EXPLICIT_BIO occupation', () => {
    const draft = generateOpeningDraft({
      username: 'Anjie619',
      location: 'Cebu',
      headline: null,
      bio: 'I am a head nurse at a private hospital.',
      occupation: 'Head nurse',
      occupationConfidence: 'EXPLICIT',
      facts: [
        {
          field: 'occupation',
          value: 'Head nurse',
          source: 'DESCRIPTION',
          evidence: 'head nurse',
          confidence: 'EXPLICIT',
        },
      ],
    })
    assert.match(draft, /head nurse/i)
    assertQuestion(draft)
    assertNoPermissionAsk(draft)
    assertNoSensitive(draft)
  })

  it('ignores occupation that is not EXPLICIT_BIO', () => {
    const draft = generateOpeningDraft({
      username: 'Nechn',
      location: 'Cebu City',
      headline: null,
      bio: null,
      occupation: 'nurse',
      occupationConfidence: 'STRUCTURED',
    })
    assert.equal(/nurse/i.test(draft), false)
    assert.match(draft, /Cebu City/)
  })

  it('personalizes from city', () => {
    const draft = generateOpeningDraft({
      username: 'Nechn',
      location: 'Cebu City',
      headline: null,
      bio: null,
      occupation: null,
    })
    assert.match(draft, /Cebu City/)
    assertQuestion(draft)
    assertNoPermissionAsk(draft)
  })

  it('unsafe or odd headline falls back to city', () => {
    const draft = generateOpeningDraft({
      username: 'AdaLocal',
      location: 'Manila',
      headline: 'Catch me if you can ;)',
      bio: 'no no no hate this stupid site...',
      occupation: null,
    })
    assert.equal(/caught my attention|Catch me if you can/i.test(draft), false)
    assert.match(draft, /Manila/)
    assertQuestion(draft)
  })

  it('never mentions children', () => {
    const draft = generateOpeningDraft({
      username: 'AdaLocal',
      location: 'Cebu',
      headline: 'No kids, family oriented',
      bio: 'I have children and I am a mom',
      occupation: null,
    })
    assert.equal(/child|kid|mom/i.test(draft), false)
  })

  it('never mentions marital / never married', () => {
    const draft = generateOpeningDraft({
      username: 'AdaLocal',
      location: 'Cebu',
      headline: 'Never married',
      bio: 'I want a husband',
      occupation: null,
    })
    assert.equal(/married|husband|marital/i.test(draft), false)
    assert.match(draft, /Cebu/)
  })

  it('never mentions religion', () => {
    const draft = generateOpeningDraft({
      username: 'AdaLocal',
      location: 'Cebu',
      headline: 'Catholic and God fearing',
      bio: 'I go to church',
      occupation: null,
    })
    assert.equal(/catholic|religion|church|god/i.test(draft), false)
  })

  it('does not turn UNKNOWN into a stated fact', () => {
    const draft = generateOpeningDraft({
      username: 'AdaLocal',
      location: 'UNKNOWN',
      headline: 'UNKNOWN',
      bio: 'status UNKNOWN',
      occupation: 'UNKNOWN',
      occupationConfidence: 'EXPLICIT',
    })
    assert.equal(/\bUNKNOWN\b/i.test(draft), false)
    assertQuestion(draft)
  })
})

describe('STALE_LOCAL_PROBE drafts', () => {
  it('uses the activity-check template', () => {
    const draft = generateStaleProbeDraft('Mexico City')
    assert.match(draft, /Mexico City/)
    assert.match(draft, /still using this app/i)
    assert.equal(/logged in|stale|year|children|married|religion/i.test(draft), false)
  })

  it('does not convert a local stale account into PRESELECTED', () => {
    const contact = assignContact({
      reviewStatus: 'NEEDS_DETAIL',
      location: 'Mexico City',
      country: 'Mexico',
      lastActivityAt: '2025-01-01T00:00:00.000Z',
      faceVerified: 'YES',
      hasChildren: 'UNKNOWN',
      now,
    })
    assert.equal(contact.contactStatus, 'STALE_LOCAL_PROBE')
    assert.notEqual(contact.contactStatus, 'READY_TO_CONTACT')
  })
})
