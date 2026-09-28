import { describe, expect, it } from 'vitest'
import { BACKGROUND_OPTIONS, blankDraft, FIELD_OPTIONS, REWORK_KEYS, REVISION_KEYS, TYPE_HELP, TYPE_KEYS, TYPE_LABELS, recordToDraft, toRecord, validateDraft } from './model'
import { EMPTY_FILTERS, filterReviews, medianTime, reworkMedian, revisionFocusCounts, revisionRebuildPercent, scoreMedian, typeCounts } from './analytics'
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

  it('keeps Background separate from Field and optional in new reviews', () => {
    expect(BACKGROUND_OPTIONS).toEqual([
      'Public Sector / Civil Service', 'Corporate', 'NGO / International Development',
      'Fresh Graduate', 'Other',
    ])
    const draft = completeDraft()
    draft.field = 'Development Studies'
    expect(draft.background).toBe('')
    expect(validateDraft(draft)).toBeNull()
    draft.background = 'Public Sector / Civil Service'
    const record = toRecord(draft)
    expect([record.field, record.background]).toEqual(['Development Studies', 'Public Sector / Civil Service'])
    expect(recordToDraft(record).background).toBe('Public Sector / Civil Service')
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

  it('saves Type 5 alongside existing types in the requested order', () => {
    expect(TYPE_KEYS).toEqual(['type1', 'type2', 'type3', 'type4', 'type5', 'unclassified'])
    expect(TYPE_LABELS.type5).toBe('Type 5 · Career-summary / CV-style')
    expect(TYPE_HELP.type5).toBe('경력 전체를 업무 분야로 요약해 구체적 사례와 학업 동기가 드러나지 않음')
    const draft = completeDraft()
    draft.problemTypes = ['type1', 'type3', 'type4', 'type5']
    expect(validateDraft(draft)).toBeNull()
    expect(recordToDraft(toRecord(draft)).problemTypes).toEqual(draft.problemTypes)
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

  it('restores Type 5 while preserving old records and counts only matching filtered reviews', () => {
    const legacy = create('Legacy', 'English', '60m', 1)
    legacy.problemTypes = ['type3']
    const current = create('Career Summary', 'Korean', '30m', 1)
    current.problemTypes = ['type3', 'type5']
    const restored = parseBackup({ schemaVersion: 1, exportedAt: new Date().toISOString(), records: [legacy, current] }).records
    expect(restored.map(record => record.problemTypes)).toEqual([['type3'], ['type3', 'type5']])
    expect(JSON.parse(backupJson(restored)).records[1].problemTypes).toEqual(['type3', 'type5'])
    expect(filterReviews(restored, { ...EMPTY_FILTERS, type: 'type5' }).map(record => record.studentName)).toEqual(['Career Summary'])
    expect(typeCounts(restored).map(({ key, count }) => [key, count])).toEqual([
      ['type1', 0], ['type2', 0], ['type3', 2], ['type4', 0], ['type5', 1], ['unclassified', 0],
    ])
    expect(typeCounts(filterReviews(restored, { ...EMPTY_FILTERS, language: 'English' })).find(item => item.key === 'type5')?.count).toBe(0)
    const [headers, oldRow, currentRow] = exportCsv(restored).slice(1).split('\r\n').map(line => line.split(','))
    const type5Index = headers.indexOf('"type5"')
    expect(type5Index).toBe(headers.indexOf('"unclassified"') - 1)
    expect([oldRow[type5Index], currentRow[type5Index]]).toEqual(['"0"', '"1"'])
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

  it('restores legacy records without Background as blank and exports the new CSV column', () => {
    const record = create('Legacy', 'English', '60m', 1)
    const { background: _omitted, ...legacy } = record
    const current = { ...create('Current', 'Korean', '30m', 1), background: 'NGO / International Development' as const, problemTypes: ['type5'] as const }
    const exportedAt = new Date().toISOString()
    const restored = parseBackup({ schemaVersion: 1, exportedAt, records: [legacy, current] }).records
    expect(restored.map(item => item.background)).toEqual(['', 'NGO / International Development'])
    expect(recordToDraft(restored[0]).background).toBe('')
    expect(JSON.parse(backupJson(restored)).records.map((item: { background: string }) => item.background))
      .toEqual(['', 'NGO / International Development'])
    expect(filterReviews(restored, { ...EMPTY_FILTERS, background: '__missing' })).toEqual([restored[0]])
    expect(filterReviews(restored, { ...EMPTY_FILTERS, background: 'NGO / International Development', type: 'type5' })).toEqual([restored[1]])
    expect(filterReviews(restored, { ...EMPTY_FILTERS, background: 'Corporate' })).toEqual([])
    const [headers, oldRow, currentRow] = exportCsv(restored).slice(1).split('\r\n').map(line => line.split(','))
    const index = headers.indexOf('"background"')
    expect(index).toBe(headers.indexOf('"field"') + 1)
    expect([oldRow[index], currentRow[index]]).toEqual(['""', '"NGO / International Development"'])
    expect(() => parseBackup({ schemaVersion: 1, exportedAt, records: [{ ...record, background: 'Academic / Research' }] })).toThrow()
    expect(() => parseBackup({ schemaVersion: 1, exportedAt, records: [{ ...record, background: null }] })).toThrow()
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
