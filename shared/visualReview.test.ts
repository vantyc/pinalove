import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { assignContact } from './workflow.ts'
import {
  inVisualReviewQueue,
  isPendingInboundReview,
  matchesVisualAgeMax,
  visualBlocksNormalWorkflow,
  visualReviewFromEvidence,
} from './visualReview.ts'

const now = Date.parse('2026-09-16T19:00:00.000Z')

describe('visual review', () => {
  it('new ordinary profile is PENDING and MATCH/BROWSE is not interest', () => {
    assert.equal(visualReviewFromEvidence({ contactStatus: 'NONE', reviewStatus: 'NEEDS_DETAIL' }), 'PENDING')
    assert.equal(visualReviewFromEvidence({ contactStatus: 'READY_TO_CONTACT', reviewStatus: 'PRESELECTED' }), 'PENDING')
    assert.equal(visualReviewFromEvidence({ contactStatus: 'NONE', reviewStatus: 'UNREVIEWED' }), 'PENDING')
  })

  it('PENDING blocks READY TO MESSAGE', () => {
    const contact = assignContact({
      reviewStatus: 'PRESELECTED',
      contactStatus: 'NONE',
      location: 'Cebu',
      country: 'PH',
      lastActivityAt: '2026-09-16T12:00:00.000Z',
      faceVerified: 'YES',
      hasChildren: 'NO',
      visualReviewStatus: 'PENDING',
      now,
    })
    assert.equal(contact.contactStatus, 'NONE')
    assert.notEqual(contact.contactStatus, 'READY_TO_CONTACT')
    assert.equal(visualBlocksNormalWorkflow('PENDING'), true)
  })

  it('PENDING is not actionable NEEDS_DETAIL', () => {
    assert.equal(
      inVisualReviewQueue({
        visualReviewStatus: 'PENDING',
        reviewStatus: 'NEEDS_DETAIL',
      }),
      true,
    )
    assert.equal(
      inVisualReviewQueue({
        visualReviewStatus: 'INTERESTED',
        reviewStatus: 'NEEDS_DETAIL',
      }),
      false,
    )
  })

  it('INTERESTED enters the normal contact workflow', () => {
    const contact = assignContact({
      reviewStatus: 'PRESELECTED',
      contactStatus: 'NONE',
      location: 'Cebu',
      country: 'PH',
      lastActivityAt: '2026-09-16T12:00:00.000Z',
      faceVerified: 'YES',
      hasChildren: 'NO',
      visualReviewStatus: 'INTERESTED',
      now,
    })
    assert.equal(contact.contactStatus, 'READY_TO_CONTACT')
  })

  it('grandfathered contact evidence is INTERESTED, not MATCH/BROWSE', () => {
    assert.equal(visualReviewFromEvidence({ contactStatus: 'MESSAGE_SENT' }), 'INTERESTED')
    assert.equal(visualReviewFromEvidence({ contactStatus: 'PROBE_SENT' }), 'INTERESTED')
    assert.equal(visualReviewFromEvidence({ contactStatus: 'REPLIED' }), 'INTERESTED')
    assert.equal(visualReviewFromEvidence({ reviewStatus: 'DISCARDED', contactStatus: 'NONE' }), 'DISCARDED')
    assert.equal(visualReviewFromEvidence({ contactStatus: 'NONE', reviewStatus: 'NEEDS_DETAIL' }), 'PENDING')
  })

  it('idempotent evidence does not overwrite a human visual decision', () => {
    assert.equal(
      visualReviewFromEvidence({ visualReviewStatus: 'PENDING', contactStatus: 'MESSAGE_SENT' }),
      'PENDING',
    )
    assert.equal(
      visualReviewFromEvidence({ visualReviewStatus: 'INTERESTED', reviewStatus: 'DISCARDED' }),
      'INTERESTED',
    )
  })

  it('inbound PENDING stays NEW INBOUND, not VISUAL REVIEW or REPLIES', () => {
    assert.equal(
      isPendingInboundReview({
        inboundReviewStatus: 'PENDING',
        inboundUnread: true,
        reviewStatus: 'UNREVIEWED',
      }),
      true,
    )
    assert.equal(
      inVisualReviewQueue({
        visualReviewStatus: 'PENDING',
        inboundReviewStatus: 'PENDING',
        inboundUnread: true,
        reviewStatus: 'UNREVIEWED',
      }),
      false,
    )
  })

  it('age max is a filter; UNKNOWN age is not 0 and stays visible', () => {
    assert.equal(matchesVisualAgeMax(41, 33), false)
    assert.equal(matchesVisualAgeMax(29, 33), true)
    assert.equal(matchesVisualAgeMax(null, 33), true)
    assert.equal(matchesVisualAgeMax(undefined, 33), true)
    assert.equal(matchesVisualAgeMax(null, undefined), true)
    assert.notEqual(null, 0)
  })
})
