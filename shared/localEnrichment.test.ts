import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  extractExplicitDeclarations,
  mergeStructuredAndText,
} from './localEnrichment.ts'

describe('extractExplicitDeclarations', () => {
  it('promotes never married and no children from explicit bio', () => {
    const text = extractExplicitDeclarations(
      'Hello',
      "I’ve never been married and I don’t have children.",
    )
    assert.equal(text.maritalHistory?.value, 'NEVER_MARRIED')
    assert.equal(text.hasChildren?.value, 'NO')
    assert.match(text.maritalHistory?.evidence ?? '', /never been married/i)
  })

  it('does not treat single as never married', () => {
    const text = extractExplicitDeclarations(null, 'I am proud, even as a single person, to help my parents.')
    assert.equal(text.maritalHistory, null)
    assert.equal(text.relationshipStatus?.value, 'SINGLE')
  })

  it('does not convert Christian or God fearing to Catholic', () => {
    const text = extractExplicitDeclarations(
      'Cristian my religion is free Methodist',
      'I am God fearing and family oriented.',
    )
    assert.notEqual(text.religion?.value, 'Catholic')
    assert.equal(text.religionIsCatholic, false)
    assert.equal(text.religion?.value?.toLowerCase().includes('methodist'), true)
    assert.ok(text.signals.some((s) => s.code === 'GOD_FEARING'))
    assert.ok(text.signals.some((s) => s.code === 'FAMILY_ORIENTED'))
    assert.ok(text.signals.some((s) => s.code === 'CHRISTIAN_UNSPECIFIED'))
  })

  it('does not infer gender from Filipina in bio', () => {
    const text = extractExplicitDeclarations('Hello', 'Filipina Single / no kids')
    assert.equal(text.gender, null)
    const merged = mergeStructuredAndText({
      structuredChildren: 'UNKNOWN',
      structuredChildrenRaw: '0',
      structuredMarital: 'UNKNOWN',
      structuredReligion: null,
      structuredOccupation: null,
      structuredGender: null,
      structuredFaceVerified: 'YES',
      structuredFaceRaw: 1,
      structuredRelationship: 'UNKNOWN',
      text,
    })
    assert.equal(merged.gender, null)
    assert.equal(merged.hasChildren, 'NO')
  })

  it('extracts no kids and single mom', () => {
    const none = extractExplicitDeclarations('Serious', 'Filipina Single / no kids')
    assert.equal(none.hasChildren?.value, 'NO')
    assert.notEqual(none.maritalHistory?.value, 'NEVER_MARRIED')
    assert.equal(none.gender, null)

    const mom = extractExplicitDeclarations('Singlemom', 'Single mom of 3 grown up kids')
    assert.equal(mom.hasChildren?.value, 'YES')
  })

  it('does not infer children from silence', () => {
    const text = extractExplicitDeclarations('Hi', 'Looking for a serious relationship.')
    assert.equal(text.hasChildren, null)
    assert.equal(text.maritalHistory, null)
    assert.equal(text.religion, null)
  })

  it('extracts nurse occupation and Catholic only when named', () => {
    const nurse = extractExplicitDeclarations(null, 'I am now a head nurse on a team of dietitians.')
    assert.equal(nurse.occupation?.value, 'Head nurse')
    const catholic = extractExplicitDeclarations(null, 'I am Catholic and I go to mass.')
    assert.equal(catholic.religion?.value, 'Catholic')
    assert.equal(catholic.religionIsCatholic, true)
  })
})

describe('mergeStructuredAndText', () => {
  it('keeps structured no-children over matching bio', () => {
    const merged = mergeStructuredAndText({
      structuredChildren: 'NO',
      structuredChildrenRaw: '2',
      structuredMarital: 'UNKNOWN',
      structuredReligion: null,
      structuredOccupation: null,
      structuredGender: null,
      structuredFaceVerified: 'YES',
      structuredFaceRaw: 1,
      structuredRelationship: 'UNKNOWN',
      text: extractExplicitDeclarations(null, "I don't have children. I've never been married."),
    })
    assert.equal(merged.hasChildren, 'NO')
    assert.equal(merged.maritalHistory, 'NEVER_MARRIED')
    assert.equal(merged.dataConflicts.length, 0)
    assert.ok(
      merged.facts.some(
        (f) =>
          f.field === 'hasChildren' &&
          f.source === 'LISTSNEW_STRUCTURED_FIELD' &&
          f.confidence === 'STRUCTURED',
      ),
    )
  })

  it('marks DATA_CONFLICT when structured and bio disagree', () => {
    const merged = mergeStructuredAndText({
      structuredChildren: 'NO',
      structuredChildrenRaw: '2',
      structuredMarital: 'UNKNOWN',
      structuredReligion: null,
      structuredOccupation: null,
      structuredGender: null,
      structuredFaceVerified: 'YES',
      structuredFaceRaw: 1,
      structuredRelationship: 'UNKNOWN',
      text: extractExplicitDeclarations('Singlemom', 'I am a single mom of 2 kids'),
    })
    assert.equal(merged.hasChildren, 'NO')
    assert.equal(merged.dataConflicts.length, 1)
    assert.equal(merged.dataConflicts[0].field, 'hasChildren')
  })

  it('promotes UNKNOWN structured children when bio is explicit', () => {
    const merged = mergeStructuredAndText({
      structuredChildren: 'UNKNOWN',
      structuredChildrenRaw: '0',
      structuredMarital: 'UNKNOWN',
      structuredReligion: null,
      structuredOccupation: null,
      structuredGender: null,
      structuredFaceVerified: 'YES',
      structuredFaceRaw: 1,
      structuredRelationship: 'UNKNOWN',
      text: extractExplicitDeclarations(null, 'Filipina Single / no kids'),
    })
    assert.equal(merged.hasChildren, 'NO')
    assert.equal(merged.facts.some((f) => f.field === 'hasChildren' && f.confidence === 'EXPLICIT'), true)
  })
})
