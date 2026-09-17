import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { interpretDistance } from './geo.ts'
import { maritalFromProfileNewStatus } from './profileNew.ts'
import { extractExplicitDeclarations } from './localEnrichment.ts'
import { classifyListsNewMatch } from './classify.ts'
import { evaluateProfile } from './scoring.ts'
import { assignContact, conversationNeedsReply, dashboardSectionRank, generateStaleProbeDraft, messageQueueRank, scoreShouldBeWithheld } from './workflow.ts'
import { generateOpeningDraft } from './drafts.ts'

const staleIso = '2025-09-16T12:00:00.000Z'
const now = Date.parse('2026-09-16T19:00:00.000Z')

describe('local + stale workflow', () => {
  it('local + stale is not discarded', () => {
    const classified = classifyListsNewMatch({
      gender: null,
      faceVerified: 'YES',
      hasChildren: 'UNKNOWN',
      maritalHistory: 'UNKNOWN',
      religion: null,
      occupation: null,
    })
    const contact = assignContact({
      reviewStatus: classified.status,
      location: 'Mexico City',
      country: 'Mexico',
      lastActivityAt: staleIso,
      faceVerified: 'YES',
      now,
    })
    assert.equal(classified.status, 'NEEDS_DETAIL')
    assert.notEqual(classified.status, 'DISCARDED')
    assert.equal(contact.contactStatus, 'STALE_LOCAL_PROBE')
    assert.equal(contact.logisticPriority, 'HIGH_LOCAL')
    assert.ok(contact.priorityReasons.includes('HIGH LOCAL LOGISTIC VALUE'))
    assert.ok(contact.uncertaintyReasons.includes('STALE ACCOUNT'))
  })

  it('local + stale PRESELECTED still becomes STALE_LOCAL_PROBE, not discarded', () => {
    const contact = assignContact({
      reviewStatus: 'PRESELECTED',
      location: 'Mexico City',
      country: 'Mexico',
      lastActivityAt: staleIso,
      faceVerified: 'YES',
      now,
    })
    assert.equal(contact.contactStatus, 'STALE_LOCAL_PROBE')
    assert.notEqual(contact.contactStatus, 'READY_TO_CONTACT')
  })

  it('STALE_LOCAL_PROBE generates a draft with no network action', () => {
    const draft = generateStaleProbeDraft('Mexico City')
    assert.match(draft, /Mexico City/)
    assert.match(draft, /still using this app/i)
    assert.equal(/never married|children|religion|logged in|stale/i.test(draft), false)
  })
})

describe('READY TO MESSAGE queue', () => {
  it('PRESELECTED is rank 1', () => {
    const contact = assignContact({
      reviewStatus: 'PRESELECTED',
      location: 'Cebu',
      country: 'PH',
      lastActivityAt: '2026-09-16T12:00:00.000Z',
      faceVerified: 'YES',
      hasChildren: 'NO',
      now,
    })
    assert.equal(contact.contactStatus, 'READY_TO_CONTACT')
    assert.equal(
      messageQueueRank({
        contactStatus: contact.contactStatus,
        reviewStatus: 'PRESELECTED',
        faceVerified: 'YES',
        hasChildren: 'NO',
      }),
      1,
    )
  })

  it('photo verified + children NO is rank 2 even if marital UNKNOWN', () => {
    const contact = assignContact({
      reviewStatus: 'NEEDS_DETAIL',
      location: 'Manila',
      country: 'PH',
      lastActivityAt: '2026-09-16T12:00:00.000Z',
      faceVerified: 'YES',
      hasChildren: 'NO',
      now,
    })
    assert.equal(contact.contactStatus, 'READY_TO_CONTACT')
    assert.equal(
      messageQueueRank({
        contactStatus: contact.contactStatus,
        reviewStatus: 'NEEDS_DETAIL',
        faceVerified: 'YES',
        hasChildren: 'NO',
      }),
      2,
    )
  })

  it('other non-discarded matches are rank 3', () => {
    const contact = assignContact({
      reviewStatus: 'NEEDS_DETAIL',
      location: 'Manila',
      country: 'PH',
      lastActivityAt: '2026-09-16T12:00:00.000Z',
      faceVerified: 'YES',
      hasChildren: 'UNKNOWN',
      now,
    })
    assert.equal(contact.contactStatus, 'READY_TO_CONTACT')
    assert.equal(
      messageQueueRank({
        contactStatus: contact.contactStatus,
        reviewStatus: 'NEEDS_DETAIL',
        faceVerified: 'YES',
        hasChildren: 'UNKNOWN',
      }),
      3,
    )
  })

  it('opening drafts personalize from persisted facts and skip kids/marriage/religion', () => {
    const withJob = generateOpeningDraft({
      username: 'AdaLocal',
      location: 'Cebu',
      headline: 'Hello',
      bio: 'I like quiet weekends',
      occupation: 'nurse',
      occupationConfidence: 'EXPLICIT',
      facts: [
        {
          field: 'occupation',
          value: 'nurse',
          source: 'DESCRIPTION',
          evidence: 'nurse',
          confidence: 'EXPLICIT',
        },
      ],
    })
    assert.match(withJob, /nurse/i)
    assert.match(withJob, /\?/)
    assert.equal(/would you like to (chat|talk)/i.test(withJob), false)
    const withCity = generateOpeningDraft({
      username: 'BeaLocal',
      location: 'Manila',
      headline: null,
      bio: null,
      occupation: null,
    })
    assert.match(withCity, /Manila/)
    assert.match(withCity, /\?/)
    const withHeadline = generateOpeningDraft({
      username: 'CoraLocal',
      location: null,
      headline: 'Looking for a serious relationship',
      bio: null,
      occupation: null,
    })
    assert.match(withHeadline, /serious|real|hoping/i)
    assert.equal(/would you like to (chat|talk)/i.test(withHeadline), false)
    assert.notEqual(withJob, withCity)
    for (const draft of [withJob, withCity, withHeadline]) {
      assert.equal(/children|kids|married|religion|catholic|logged in/i.test(draft), false)
    }
  })
})

describe('hard facts stay explicit', () => {
  it('UNKNOWN children is not converted to NO', () => {
    const text = extractExplicitDeclarations('Hi', 'Looking for a serious relationship.')
    assert.equal(text.hasChildren, null)
    const classified = classifyListsNewMatch({
      gender: 'F',
      faceVerified: 'YES',
      hasChildren: 'UNKNOWN',
      maritalHistory: 'UNKNOWN',
      religion: null,
      occupation: null,
    })
    assert.notEqual(classified.status, 'DISCARDED')
    assert.ok(classified.missingDetail.includes('children'))
  })

  it('single is not NEVER_MARRIED', () => {
    const text = extractExplicitDeclarations(null, 'Filipina Single / no kids')
    assert.notEqual(text.maritalHistory?.value, 'NEVER_MARRIED')
    assert.equal(text.hasChildren?.value, 'NO')
  })

  it('explicit never been married promotes marital history', () => {
    const text = extractExplicitDeclarations(null, "I've never been married and I don't have children.")
    assert.equal(text.maritalHistory?.value, 'NEVER_MARRIED')
  })

  it('explicit no kids promotes children NO', () => {
    const text = extractExplicitDeclarations(null, 'Filipina Single / no kids')
    assert.equal(text.hasChildren?.value, 'NO')
  })

  it('single mom promotes children YES and discards', () => {
    const text = extractExplicitDeclarations('Hi', 'Single mom of 3 grown up kids')
    assert.equal(text.hasChildren?.value, 'YES')
    const classified = classifyListsNewMatch({
      gender: 'F',
      faceVerified: 'YES',
      hasChildren: 'YES',
      maritalHistory: 'UNKNOWN',
      religion: null,
      occupation: null,
    })
    assert.equal(classified.status, 'DISCARDED')
  })

  it('profilenew status=Active is not marital', () => {
    assert.equal(maritalFromProfileNewStatus('Active'), 'UNKNOWN')
    assert.equal(maritalFromProfileNewStatus(3), 'UNKNOWN')
  })
})

describe('distanceRaw anomalies', () => {
  it('does not score proximity from anomalous listsnew raw', () => {
    const interpreted = interpretDistance({
      distanceRaw: 13304,
      distanceKm: null,
      location: 'Mexico City',
      country: 'Mexico',
    })
    assert.equal(interpreted.scoringKm, null)
    assert.equal(interpreted.trust, 'UNTRUSTED')
    assert.equal(interpreted.displayKm, 13)
    const scored = evaluateProfile({
      age: 23,
      location: 'Mexico City',
      country: 'Mexico',
      distanceKm: interpreted.scoringKm,
      relationshipStatus: 'UNKNOWN',
      maritalHistory: 'UNKNOWN',
      hasChildren: 'UNKNOWN',
      religion: null,
      religionPracticeLevel: 'UNKNOWN',
      headline: null,
      bio: null,
      photoVerified: true,
      profileVerified: false,
      primaryPhotoUrl: 'https://example.com/p.jpg',
    })
    assert.equal(scored.reasons.some((r) => r.code === 'proximity'), false)
    assert.ok(scored.reasons.some((r) => r.code === 'mexicoBonus'))
    const leakedRaw = evaluateProfile({
      age: 23,
      location: 'Mexico City',
      country: 'Mexico',
      distanceKm: 13304,
      relationshipStatus: 'UNKNOWN',
      maritalHistory: 'UNKNOWN',
      hasChildren: 'UNKNOWN',
      religion: null,
      religionPracticeLevel: 'UNKNOWN',
      headline: null,
      bio: null,
      photoVerified: true,
      profileVerified: false,
      primaryPhotoUrl: 'https://example.com/p.jpg',
    })
    assert.equal(leakedRaw.reasons.some((r) => r.code === 'proximity'), false)
  })
})

describe('inbox conversationNeedsReply', () => {
  it('is true when inbound is after the last outbound', () => {
    assert.equal(
      conversationNeedsReply({
        lastInboundAt: '2026-09-16T18:00:00.000Z',
        lastOutboundAt: '2026-09-16T12:00:00.000Z',
      }),
      true,
    )
    assert.equal(
      conversationNeedsReply({
        lastInboundAt: '2026-09-16T10:00:00.000Z',
        lastOutboundAt: '2026-09-16T12:00:00.000Z',
      }),
      false,
    )
    assert.equal(conversationNeedsReply({ lastInboundAt: null, lastOutboundAt: '2026-09-16T12:00:00.000Z' }), false)
    assert.equal(conversationNeedsReply({ lastInboundAt: '2026-09-16T18:00:00.000Z', lastOutboundAt: null }), true)
  })

  it('ranks new inbound review above replies, probes and ready', () => {
    assert.equal(
      dashboardSectionRank({
        inboundReviewStatus: 'PENDING',
        lastInboundAt: '2026-09-16T18:00:00.000Z',
        inboundUnread: true,
        conversationNeedsReply: false,
        contactStatus: 'NONE',
        reviewStatus: 'UNREVIEWED',
      }),
      1,
    )
    assert.equal(
      dashboardSectionRank({
        conversationNeedsReply: true,
        contactStatus: 'READY_TO_CONTACT',
        reviewStatus: 'PRESELECTED',
      }),
      2,
    )
    assert.equal(
      dashboardSectionRank({
        conversationNeedsReply: false,
        contactStatus: 'STALE_LOCAL_PROBE',
        reviewStatus: 'NEEDS_DETAIL',
      }),
      3,
    )
    assert.equal(
      dashboardSectionRank({
        conversationNeedsReply: false,
        contactStatus: 'READY_TO_CONTACT',
        reviewStatus: 'PRESELECTED',
      }),
      4,
    )
  })

  it('keeps MESSAGE_SENT terminal so workflow does not revert to READY', () => {
    const contact = assignContact({
      reviewStatus: 'PRESELECTED',
      contactStatus: 'MESSAGE_SENT',
      location: 'Cebu',
      country: 'PH',
      lastActivityAt: '2026-09-16T12:00:00.000Z',
      faceVerified: 'YES',
      now,
    })
    assert.equal(contact.contactStatus, 'MESSAGE_SENT')
  })

  it('does not put inbox-only rows on READY or PROBE queues', () => {
    const contact = assignContact({
      reviewStatus: 'UNREVIEWED',
      contactStatus: 'NONE',
      location: 'Mexico City',
      country: 'Mexico',
      lastActivityAt: '2025-01-01T00:00:00.000Z',
      faceVerified: 'YES',
      now,
      inboxOnly: true,
    })
    assert.equal(contact.contactStatus, 'NONE')
    assert.notEqual(contact.contactStatus, 'READY_TO_CONTACT')
    assert.notEqual(contact.contactStatus, 'STALE_LOCAL_PROBE')
  })
})

describe('score withholding', () => {
  it('withholds a precise score for NEEDS_DETAIL and stale probes', () => {
    assert.equal(
      scoreShouldBeWithheld({
        reviewStatus: 'NEEDS_DETAIL',
        hasChildren: 'NO',
        maritalHistory: 'UNKNOWN',
      }),
      true,
    )
    assert.equal(
      scoreShouldBeWithheld({
        reviewStatus: 'PRESELECTED',
        hasChildren: 'NO',
        maritalHistory: 'NEVER_MARRIED',
        contactStatus: 'STALE_LOCAL_PROBE',
      }),
      true,
    )
  })
})
