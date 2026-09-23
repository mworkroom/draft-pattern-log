import { describe, expect, it } from 'vitest'
import { blankDraft, FIELD_OPTIONS, REWORK_KEYS, REVISION_KEYS, recordToDraft, toRecord, validateDraft } from './model'
import { EMPTY_FILTERS, filterReviews, medianTime, reworkMedian, revisionFocusCounts, revisionRebuildPercent, scoreMedian } from './analytics'
import { backupJson, exportCsv, parseBackup } from './storage'

function completeDraft() {
  const draft = blankDraft('2026-09-23')
  draft.studentName = '홍길동'
  for (const key of Object.keys(draft.structure) as (keyof typeof draft.structure)[]) draft.structure[key] = 1
  return draft
}

describe('review entry', () => {
  it('keeps only distinct rework actions and orders revision areas as requested', () => {
    expect(REWORK_KEYS).toEqual(['mergeParagraphs', 'moveContent', 'compressExperience', 'inferHiddenLogic'])
    expect(REVISION_KEYS).toEqual(['revision_experience_closing', 'revision_academic_plan', 'revision_conclusion'])
  })

  it('keeps the current Field choices in one list, with separate problem fields', () => {
    expect(FIELD_OPTIONS).toEqual([
      'Business', 'STEM', 'Sport', 'Development Studies', 'International Relations',
      'Education', 'Social Sciences', 'UCAS', 'Foundation', 'Other',
    ])
  })

  it('starts with J’s chosen defaults but no structure scores', () => {
    const draft = blankDraft('2026-09-23')
    expect([draft.draftLanguage, draft.level, draft.schoolTier, draft.aiUsage, draft.timeSpent])
      .toEqual(['English', "Master's", 'Mid', 'Yes', '60m'])
    expect(validateDraft(draft)).toMatch(/Student Name/)
    draft.studentName = '홍길동'
    expect(validateDraft(draft)).toMatch(/Structure Score/)
    expect([draft.revision_academic_plan, draft.revision_conclusion, draft.revision_experience_closing])
      .toEqual(['none', 'none', 'none'])
  })

  it('records revision levels independently of Problem Types and Major Rework', () => {
    const draft = completeDraft()
    draft.revision_academic_plan = 'rebuild'
    draft.revision_conclusion = 'refine'
    draft.revision_experience_closing = 'refine'
    expect(validateDraft(draft)).toBeNull()
    const record = toRecord(draft)
    expect(record.problemTypes).toEqual([])
    expect(record.rework).toEqual([])
    expect(recordToDraft(record).revision_academic_plan).toBe('rebuild')
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

  it('normalizes only missing revision fields in legacy JSON backups', () => {
    const record = create('Legacy', 'English', '60m', 1)
    const legacy = Object.fromEntries(Object.entries(record).filter(([key]) => !key.startsWith('revision_')))
    const exportedAt = new Date().toISOString()
    const restored = parseBackup({ schemaVersion: 1, exportedAt, records: [legacy] }).records[0]
    expect([restored.revision_academic_plan, restored.revision_conclusion, restored.revision_experience_closing])
      .toEqual(['none', 'none', 'none'])
    expect(JSON.parse(backupJson([restored])).records[0]).toMatchObject({
      revision_academic_plan: 'none', revision_conclusion: 'none', revision_experience_closing: 'none',
    })
    expect(() => parseBackup({ schemaVersion: 1, exportedAt, records: [{ ...legacy, revision_conclusion: 'invalid' }] })).toThrow()
    expect(() => parseBackup({ schemaVersion: 1, exportedAt, records: [{ ...legacy, revision_conclusion: null }] })).toThrow()
  })

  it('drops retired rework checks from old records while retaining the remaining actions', () => {
    const record = create('Legacy Rework', 'English', '60m', 1)
    const oldRecord = {
      ...record,
      rework: ['mergeParagraphs', 'addMotivationBridge', 'rebuildAcademicPlan', 'rebuildConclusion'],
    }
    const exportedAt = new Date().toISOString()
    const restored = parseBackup({ schemaVersion: 1, exportedAt, records: [oldRecord] }).records[0]
    expect(restored.rework).toEqual(['mergeParagraphs'])
    expect(exportCsv([restored])).not.toMatch(/addMotivationBridge|rebuildAcademicPlan|rebuildConclusion/)
    expect(() => parseBackup({ schemaVersion: 1, exportedAt, records: [{ ...record, rework: ['unknownAction'] }] })).toThrow()
  })

  it('counts revision levels only within the filtered reviews', () => {
    const first = { ...create('A', 'English', '30m', 1), revision_academic_plan: 'rebuild' as const }
    const second = { ...create('B', 'Korean', '60m', 1), revision_academic_plan: 'refine' as const }
    const all = revisionFocusCounts([first, second])
    expect(all[1].key).toBe('revision_academic_plan')
    expect(all[1].levels.map(item => [item.count, item.percent])).toEqual([[0, 0], [1, 50], [1, 50]])
    const filtered = filterReviews([first, second], { ...EMPTY_FILTERS, language: 'English' })
    expect(revisionFocusCounts(filtered)[1].levels.map(item => [item.count, item.percent])).toEqual([[0, 0], [0, 0], [1, 100]])
    expect(revisionRebuildPercent(filtered, 'revision_academic_plan')).toEqual({ count: 1, total: 1, percent: 100 })
  })

  it('preserves a previously typed Field through backup and editing', () => {
    const oldRecord = { ...create('Legacy', 'English', '60m', 1), field: 'Psychology' }
    const backup = { schemaVersion: 1, exportedAt: new Date().toISOString(), records: [oldRecord] }
    expect(parseBackup(backup).records[0].field).toBe('Psychology')
    expect(recordToDraft(oldRecord).field).toBe('Psychology')
  })

  it('exports Korean text and embedded CSV punctuation safely', () => {
    const record = create('홍,\"길동\"', 'English', '60m', 1)
    expect(exportCsv([record])).toContain('"\uD64D,""\uAE38\uB3D9"""')
    expect(exportCsv([record]).charCodeAt(0)).toBe(0xfeff)
    expect(exportCsv([record])).toContain('"revision_experience_closing","revision_academic_plan","revision_conclusion"')
    expect(exportCsv([record])).toContain('"none","none","none"')
  })
})
