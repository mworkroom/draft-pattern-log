import { describe, expect, it } from 'vitest'
import { EMPTY_FILTERS, explorePatterns, filterReviews } from './analytics'
import { blankDraft, STRUCTURE_KEYS, toRecord, type ReviewRecordV1 } from './model'
import { backupJson, exportCsv, parseBackup } from './storage'

function review(overrides: Partial<ReviewRecordV1> = {}): ReviewRecordV1 {
  const draft = blankDraft('2026-10-13')
  draft.studentName = 'Same student'
  for (const key of STRUCTURE_KEYS) draft.structure[key] = 2
  return { ...toRecord(draft), ...overrides }
}

describe('Pattern Explorer selected-review evidence', () => {
  it('uses an AND subset, keeps rounds separate, and excludes the selected type from discoveries', () => {
    const records = [
      review({ mbti: 'xNFJ', problemTypes: ['type3', 'type5'], timeSpent: '60m', rework: ['inferHiddenLogic'] }),
      review({ mbti: 'xNFJ', problemTypes: ['type5', 'type7'], revisionRound: 2, timeSpent: '120m+', rework: ['inferHiddenLogic', 'moveContent'] }),
      review({ mbti: 'xNFJ', problemTypes: ['type3'], revisionRound: 3 }),
      review({ mbti: 'xNTP', problemTypes: ['type5'] }),
      review({ problemTypes: ['type5'] }),
    ]
    const before = JSON.stringify(records)
    const subset = filterReviews(records, { ...EMPTY_FILTERS, mbti: 'xNFJ', type: 'type5' })
    const stats = explorePatterns(subset, 'type5')
    expect(stats.total).toBe(2)
    expect(stats.types).toEqual([
      { key: 'type3', count: 1, total: 2, percent: 50 },
      { key: 'type7', count: 1, total: 2, percent: 50 },
    ])
    expect(stats.rework[0]).toEqual({ key: 'inferHiddenLogic', count: 2, total: 2, percent: 100 })
    expect(stats.medianTime).toBe('60m–120m+')
    expect(stats.rounds).toEqual([
      { round: 1, count: 1, medianTime: '60m' },
      { round: 2, count: 1, medianTime: '120m+' },
      { round: 3, count: 0, medianTime: '—' },
    ])
    expect(filterReviews(records, { ...EMPTY_FILTERS, type: 'type5' })).toHaveLength(4)
    expect(filterReviews(records, { ...EMPTY_FILTERS, mbti: 'xNFJ' })).toHaveLength(3)
    expect(explorePatterns(records).total).toBe(5)
    expect(JSON.stringify(records)).toBe(before)
  })

  it('counts 0 and 1 as weak structure and ranks with the selected reviews as denominator', () => {
    const base = review()
    const records = [
      review({ structure: { ...base.structure, logicConnection: 0, academicPlan: 1 } }),
      review({ structure: { ...base.structure, logicConnection: 1 } }),
      review({ structure: { ...base.structure, readerContext: 0 } }),
      base,
    ]
    expect(explorePatterns(records).weakStructure).toEqual([
      { key: 'logicConnection', count: 2, total: 4, percent: 50 },
      { key: 'academicPlan', count: 1, total: 4, percent: 25 },
      { key: 'readerContext', count: 1, total: 4, percent: 25 },
    ])
    expect(explorePatterns([base]).weakStructure).toEqual([])
    expect(explorePatterns([base]).rework).toEqual([])
  })

  it('does not normalize multi-select percentages into a share of tags', () => {
    const stats = explorePatterns([review({ problemTypes: ['type3', 'type4', 'type5'] })])
    expect(stats.types.map(item => item.percent)).toEqual([100, 100, 100])
    expect(stats.revisionFocus.every(item => item.levels[0].count === 1)).toBe(true)
  })

  it('handles an empty selection without invented counts or times', () => {
    const stats = explorePatterns([])
    expect(stats).toMatchObject({ total: 0, types: [], weakStructure: [], rework: [], medianTime: 'No data' })
    expect(stats.rounds.every(item => item.count === 0 && item.medianTime === '—')).toBe(true)
    expect(stats.revisionFocus.flatMap(item => item.levels).every(item => item.count === 0 && item.percent === 0)).toBe(true)
  })

  it('leaves legacy normalization and JSON/CSV round trips unchanged after exploring', () => {
    const current = review({ problemTypes: ['type6', 'unclassified'], genreMismatchSubtypes: ['researchProposal'], unclassifiedNote: 'A new pattern', notes: 'Existing notes' })
    const { mbti: _mbti, revision_academic_plan: _focus, ...legacy } = current
    const restored = parseBackup({ schemaVersion: 1, exportedAt: new Date().toISOString(), records: [legacy] }).records
    const csvBefore = exportCsv(restored)
    const jsonBefore = JSON.stringify(restored)
    explorePatterns(restored, 'type6')
    expect(JSON.stringify(restored)).toBe(jsonBefore)
    expect(exportCsv(restored)).toBe(csvBefore)
    expect(parseBackup(JSON.parse(backupJson(restored))).records).toEqual(restored)
    expect(restored[0]).toMatchObject({ mbti: '', revision_academic_plan: 'none', notes: 'Existing notes' })
    expect(Object.keys(restored[0]).sort()).toEqual(Object.keys(current).sort())
  })
})
