import { describe, expect, it } from 'vitest'
import { blankDraft, toRecord, validateDraft } from './model'
import { EMPTY_FILTERS, filterReviews, medianTime, reworkMedian, scoreMedian } from './analytics'
import { exportCsv, parseBackup } from './storage'

function completeDraft() {
  const draft = blankDraft('2026-09-23')
  draft.studentName = '홍길동'
  for (const key of Object.keys(draft.structure) as (keyof typeof draft.structure)[]) draft.structure[key] = 1
  return draft
}

describe('review entry', () => {
  it('starts with J’s chosen defaults but no structure scores', () => {
    const draft = blankDraft('2026-09-23')
    expect([draft.draftLanguage, draft.level, draft.schoolTier, draft.aiUsage, draft.timeSpent])
      .toEqual(['English', "Master's", 'Mid', 'Yes', '60m'])
    expect(validateDraft(draft)).toMatch(/Student Name/)
    draft.studentName = '홍길동'
    expect(validateDraft(draft)).toMatch(/Structure Score/)
  })

  it('requires a note for an unclassified pattern', () => {
    const draft = completeDraft()
    draft.problemTypes = ['type3', 'unclassified']
    expect(validateDraft(draft)).toMatch(/Unclassified/)
    draft.unclassifiedNote = '새 구조 패턴'
    expect(validateDraft(draft)).toBeNull()
  })
})

describe('analytics and backup', () => {
  const create = (name: string, language: 'English' | 'Korean', time: '30m' | '60m', score: 0 | 1 | 2) => {
    const draft = completeDraft()
    draft.studentName = name
    draft.draftLanguage = language
    draft.timeSpent = time
    for (const key of Object.keys(draft.structure) as (keyof typeof draft.structure)[]) draft.structure[key] = score
    return toRecord(draft)
  }

  it('computes median score and ordinal time range, respecting combined filters', () => {
    const records = [create('A', 'English', '30m', 0), create('B', 'Korean', '60m', 2)]
    expect(scoreMedian(records)).toBe(8)
    expect(reworkMedian(records)).toBe(0)
    expect(medianTime(records)).toBe('30m–60m')
    expect(filterReviews(records, { ...EMPTY_FILTERS, language: 'English', from: '2026-09-23' })).toHaveLength(1)
  })

  it('rejects an entire backup if a record is invalid', () => {
    const good = create('A', 'English', '60m', 1)
    const backup = { schemaVersion: 1, exportedAt: new Date().toISOString(), records: [good] }
    expect(parseBackup(backup).records).toHaveLength(1)
    expect(() => parseBackup({ ...backup, records: [good, { ...good, id: 'other', timeSpent: '61m' }] })).toThrow()
  })

  it('exports Korean text and embedded CSV punctuation safely', () => {
    const record = create('홍,\"길동\"', 'English', '60m', 1)
    expect(exportCsv([record])).toContain('"\uD64D,""\uAE38\uB3D9"""')
    expect(exportCsv([record]).charCodeAt(0)).toBe(0xfeff)
  })
})
