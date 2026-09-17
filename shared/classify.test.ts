import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { classifyListsNewMatch } from './classify.ts'

describe('classifyListsNewMatch', () => {
  it('does not discard UNKNOWN children', () => {
    const result = classifyListsNewMatch({
      gender: null,
      faceVerified: 'YES',
      hasChildren: 'UNKNOWN',
      maritalHistory: 'UNKNOWN',
      religion: null,
      occupation: null,
    })
    assert.equal(result.status, 'NEEDS_DETAIL')
    assert.equal(result.reasons.some((r) => /has children/i.test(r)), false)
    assert.ok(result.missingDetail.includes('children'))
    assert.ok(result.missingDetail.includes('marital status'))
  })

  it('discards declared children YES', () => {
    const result = classifyListsNewMatch({
      gender: 'F',
      faceVerified: 'YES',
      hasChildren: 'YES',
      maritalHistory: 'UNKNOWN',
      religion: null,
      occupation: null,
    })
    assert.equal(result.status, 'DISCARDED')
    assert.ok(result.reasons.some((r) => /has children/i.test(r)))
  })

  it('discards when Photo Verified is not YES', () => {
    const unknown = classifyListsNewMatch({
      gender: 'F',
      faceVerified: 'UNKNOWN',
      hasChildren: 'NO',
      maritalHistory: 'UNKNOWN',
      religion: null,
      occupation: null,
    })
    assert.equal(unknown.status, 'DISCARDED')
    assert.ok(unknown.reasons.some((r) => /photo verified/i.test(r)))
  })

  it('keeps marital-unknown verified no-children as NEEDS_DETAIL, not PRESELECTED', () => {
    const result = classifyListsNewMatch({
      gender: 'F',
      faceVerified: 'YES',
      hasChildren: 'NO',
      maritalHistory: 'UNKNOWN',
      religion: null,
      occupation: null,
    })
    assert.equal(result.status, 'NEEDS_DETAIL')
    assert.ok(result.missingDetail.includes('marital status'))
    assert.ok(result.missingDetail.includes('religion'))
    assert.ok(result.missingDetail.includes('occupation'))
  })

  it('does not infer woman from missing gender', () => {
    const result = classifyListsNewMatch({
      gender: null,
      faceVerified: 'YES',
      hasChildren: 'NO',
      maritalHistory: 'NEVER_MARRIED',
      religion: 'Catholic',
      occupation: 'Teacher',
    })
    assert.equal(result.status, 'PRESELECTED')
    assert.ok(result.missingDetail.some((m) => m.startsWith('gender')))
  })

  it('PRESELECTED when verified, no children, and never married are confirmed', () => {
    const result = classifyListsNewMatch({
      gender: null,
      faceVerified: 'YES',
      hasChildren: 'NO',
      maritalHistory: 'NEVER_MARRIED',
      religion: null,
      occupation: null,
    })
    assert.equal(result.status, 'PRESELECTED')
    assert.ok(result.missingDetail.includes('religion'))
    assert.ok(result.missingDetail.includes('occupation'))
  })

  it('keeps DATA_CONFLICT as NEEDS_DETAIL instead of auto-resolving', () => {
    const result = classifyListsNewMatch({
      gender: 'F',
      faceVerified: 'YES',
      hasChildren: 'NO',
      maritalHistory: 'NEVER_MARRIED',
      religion: null,
      occupation: null,
      dataConflict: true,
    })
    assert.equal(result.status, 'NEEDS_DETAIL')
  })
})
