import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DEFAULT_RULE_CONFIG } from './defaultRules.ts'
import { evaluateProfile } from './scoring.ts'

function base(
  overrides: Partial<Parameters<typeof evaluateProfile>[0]> = {},
): Parameters<typeof evaluateProfile>[0] {
  return {
    age: 34,
    location: 'Roma Norte, CDMX',
    country: 'Mexico',
    distanceKm: 12,
    relationshipStatus: 'SINGLE',
    maritalHistory: 'NEVER_MARRIED',
    hasChildren: 'NO',
    religion: 'Catholic',
    religionPracticeLevel: 'PRACTICING',
    headline: 'Looking for a serious relationship',
    bio: 'Faith and family matter. Family oriented.',
    photoVerified: true,
    profileVerified: true,
    primaryPhotoUrl: 'https://example.com/photo.jpg',
    ...overrides,
  }
}

describe('evaluateProfile', () => {
  it('scores a strong declared match with explanations', () => {
    const result = evaluateProfile(base(), DEFAULT_RULE_CONFIG)
    assert.ok(result.score >= 70, `expected high score, got ${result.score}`)
    assert.ok(result.reasons.some((r) => r.code === 'mexicoBonus'))
    assert.ok(result.reasons.some((r) => r.code === 'cdmxBonus'))
    assert.ok(result.reasons.some((r) => r.code === 'neverMarried'))
    assert.ok(result.reasons.some((r) => r.code === 'noChildren'))
    assert.ok(result.reasons.some((r) => r.code === 'catholicBonus'))
    assert.equal(result.flags.includes('HAS_CHILDREN'), false)
  })

  it('does not treat SINGLE as NEVER_MARRIED', () => {
    const result = evaluateProfile(
      base({ maritalHistory: 'UNKNOWN', relationshipStatus: 'SINGLE' }),
    )
    assert.equal(result.reasons.some((r) => r.code === 'neverMarried'), false)
    assert.ok(result.flags.includes('MISSING_MARITAL_STATUS'))
    assert.ok(
      result.reasons.some((r) =>
        r.message.toLowerCase().includes('never-married was not assumed'),
      ),
    )
  })

  it('uses UNKNOWN for missing children instead of assuming no', () => {
    const result = evaluateProfile(base({ hasChildren: 'UNKNOWN' }))
    assert.equal(result.reasons.some((r) => r.code === 'noChildren'), false)
    assert.ok(result.flags.includes('MISSING_CHILDREN_INFO'))
  })

  it('flags possible scam language as an indicator, not a fact', () => {
    const result = evaluateProfile(
      base({ bio: 'Please send money via Western Union to meet me.' }),
    )
    assert.ok(result.flags.includes('POSSIBLE_SCAM'))
    assert.ok(
      result.reasons.some((r) =>
        r.message.toLowerCase().includes('possible scam indicators'),
      ),
    )
    assert.equal(
      result.reasons.some((r) => r.message.toLowerCase().includes('is a scammer')),
      false,
    )
  })

  it('marks declared children as a flag and penalty', () => {
    const result = evaluateProfile(base({ hasChildren: 'YES' }))
    assert.ok(result.flags.includes('HAS_CHILDREN'))
    assert.ok(result.reasons.some((r) => r.code === 'children' && r.direction === 'minus'))
  })

  it('labels inferred CDMX matching separately from declared country', () => {
    const result = evaluateProfile(
      base({ location: 'Polanco', country: 'Mexico' }),
    )
    const cdmx = result.reasons.find((r) => r.code === 'cdmxBonus')
    const mx = result.reasons.find((r) => r.code === 'mexicoBonus')
    assert.equal(cdmx?.kind, 'inferred')
    assert.equal(mx?.kind, 'declared')
  })

  it('does not score proximity when distanceKm is absent', () => {
    const result = evaluateProfile(base({ distanceKm: null }))
    assert.equal(result.reasons.some((r) => r.code === 'proximity'), false)
  })

  it('does not treat anomalous listsnew distanceRaw-as-km as proximity', () => {
    const result = evaluateProfile(base({ distanceKm: 13304 }))
    assert.equal(result.reasons.some((r) => r.code === 'proximity'), false)
  })
})
