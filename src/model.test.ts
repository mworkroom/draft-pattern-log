import { describe, expect, it } from 'vitest'
import { CAREER_STAGE_OPTIONS, SECTOR_OPTIONS, blankDraft, FIELD_OPTIONS, GENRE_MISMATCH_SUBTYPES, REWORK_KEYS, REWORK_LABELS, REVISION_KEYS, REVISION_ROUNDS, TYPE_HELP, TYPE_KEYS, TYPE_LABELS, recordToDraft, toRecord, validateDraft } from './model'
import { EMPTY_FILTERS, filterReviews, medianTime, reworkCounts, reworkMedian, revisionFocusCounts, revisionRebuildPercent, scoreMedian, typeCounts } from './analytics'
import { backupJson, exportCsv, parseBackup } from './storage'

function completeDraft() {
  const draft = blankDraft('2026-09-23')
  draft.studentName = '홍길동'
  for (const key of Object.keys(draft.structure) as (keyof typeof draft.structure)[]) draft.structure[key] = 1
  return draft
}

describe('review entry', () => {
  it('keeps only distinct rework actions and orders revision areas as requested', () => {
    expect(REWORK_KEYS).toEqual(['mergeParagraphs', 'moveContent', 'compressExperience', 'inferHiddenLogic', 'developMissingExamples'])
    expect(REWORK_LABELS.developMissingExamples).toBe('Develop Missing Examples')
    expect(REVISION_KEYS).toEqual(['revision_experience_closing', 'revision_academic_plan', 'revision_conclusion'])
  })

  it('keeps the current Field choices in one list, with separate problem fields', () => {
    expect(FIELD_OPTIONS).toEqual([
      'Business', 'STEM', 'Sport', 'Development Studies', 'International Relations',
      'Public Policy', 'Helping Professions', 'Social Sciences', 'UCAS', 'Foundation', 'Other',
    ])
  })

  it('stores optional Career Stage and Sector independently of Field', () => {
    expect(CAREER_STAGE_OPTIONS).toEqual(['Student / Fresh Graduate', 'Early Career', 'Experienced Professional'])
    expect(SECTOR_OPTIONS).toEqual(['Corporate', 'Public Sector', 'NGO / Nonprofit', 'Other'])
    const draft = completeDraft()
    draft.field = 'Development Studies'
    expect([draft.careerStage, draft.sector]).toEqual(['', ''])
    expect(validateDraft(draft)).toBeNull()
    draft.careerStage = 'Early Career'
    draft.sector = 'Public Sector'
    const record = toRecord(draft)
    expect([record.field, record.careerStage, record.sector]).toEqual(['Development Studies', 'Early Career', 'Public Sector'])
    expect(recordToDraft(record)).toMatchObject({ careerStage: 'Early Career', sector: 'Public Sector' })
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
    expect(TYPE_KEYS).toEqual(['type1', 'type2', 'type3', 'type4', 'type5', 'type6', 'type7', 'unclassified'])
    expect(TYPE_LABELS.type5).toBe('Type 5 — Career-summary / CV-style')
    expect(TYPE_HELP.type5).toBe('경력 전체를 CV처럼 요약해 구체적 사례와 학업 동기가 드러나지 않음')
    const draft = completeDraft()
    draft.problemTypes = ['type1', 'type3', 'type4', 'type5']
    expect(validateDraft(draft)).toBeNull()
    expect(recordToDraft(toRecord(draft)).problemTypes).toEqual(draft.problemTypes)
  })

  it('keeps Type 6 separate from structure scores and other problem types', () => {
    expect(GENRE_MISMATCH_SUBTYPES).toEqual(['researchProposal', 'promptResponse'])
    const lowScore = completeDraft()
    for (const key of Object.keys(lowScore.structure) as (keyof typeof lowScore.structure)[]) lowScore.structure[key] = 0
    expect(toRecord(lowScore).problemTypes).toEqual([])

    const draft = completeDraft()
    draft.problemTypes = ['type1', 'type3', 'type6']
    expect(validateDraft(draft)).toMatch(/Type 6/)
    draft.genreMismatchSubtypes = ['researchProposal', 'promptResponse']
    expect(validateDraft(draft)).toBeNull()
    draft.genreMismatchSubtypes = ['researchProposal']
    expect(validateDraft(draft)).toBeNull()
    draft.genreMismatchSubtypes = ['promptResponse']
    expect(validateDraft(draft)).toBeNull()
    draft.genreMismatchSubtypes = ['researchProposal', 'promptResponse']
    const record = toRecord(draft)
    expect(record.problemTypes).toEqual(['type1', 'type3', 'type6'])
    expect(record.genreMismatchSubtypes).toEqual(GENRE_MISMATCH_SUBTYPES)
    expect(record.rework).toEqual([])
    expect(recordToDraft(record).genreMismatchSubtypes).toEqual(GENRE_MISMATCH_SUBTYPES)
  })

  it('saves Type 7 alongside other types without a subtype or structure-score rule', () => {
    expect(TYPE_LABELS.type7).toBe('Type 7 · Weak English Writing')
    expect(TYPE_HELP.type7).toBe('직접 영작하거나 AI/번역 결과를 수정하여 문법, 표현, 의미 전달이 크게 저하된 경우')
    const draft = completeDraft()
    draft.problemTypes = ['type1', 'type3', 'type7']
    expect(validateDraft(draft)).toBeNull()
    const record = toRecord(draft)
    expect(record.problemTypes).toEqual(['type1', 'type3', 'type7'])
    expect(record.genreMismatchSubtypes).toEqual([])
    expect(recordToDraft(record).problemTypes).toEqual(draft.problemTypes)
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

  it('saves and restores the new rework action without changing older records', () => {
    const draft = completeDraft()
    draft.rework = ['inferHiddenLogic', 'developMissingExamples']
    const current = toRecord(draft)
    const legacy = { ...toRecord(completeDraft()), id: 'legacy', rework: ['mergeParagraphs'] as const }
    const restored = parseBackup({ schemaVersion: 1, exportedAt: new Date().toISOString(), records: [current, legacy] }).records
    expect(restored.map(record => record.rework)).toEqual([['inferHiddenLogic', 'developMissingExamples'], ['mergeParagraphs']])
    expect(recordToDraft(restored[0]).rework).toEqual(draft.rework)
    expect(JSON.parse(backupJson(restored)).records[0].rework).toEqual(draft.rework)
    expect(reworkCounts(restored).find(item => item.key === 'developMissingExamples')?.count).toBe(1)
    const [headers, newRow, oldRow] = exportCsv(restored).slice(1).split('\r\n').map(line => line.split(','))
    const index = headers.indexOf('"developMissingExamples"')
    expect(index).toBe(headers.indexOf('"rework_total"') - 1)
    expect([newRow[index], oldRow[index]]).toEqual(['"1"', '"0"'])
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
      ['type1', 0], ['type2', 0], ['type3', 2], ['type4', 0], ['type5', 1], ['type6', 0], ['type7', 0], ['unclassified', 0],
    ])
    expect(typeCounts(filterReviews(restored, { ...EMPTY_FILTERS, language: 'English' })).find(item => item.key === 'type5')?.count).toBe(0)
    const [headers, oldRow, currentRow] = exportCsv(restored).slice(1).split('\r\n').map(line => line.split(','))
    const type5Index = headers.indexOf('"type5"')
    expect(type5Index).toBe(headers.indexOf('"type6"') - 1)
    expect([oldRow[type5Index], currentRow[type5Index]]).toEqual(['"0"', '"1"'])
  })

  it('restores Type 6 subtypes and keeps older backups without the subtype field valid', () => {
    const legacyRecord = create('Legacy', 'English', '60m', 1)
    const { genreMismatchSubtypes: _omitted, ...legacy } = legacyRecord
    const draft = completeDraft()
    draft.studentName = 'Genre Mismatch'
    draft.problemTypes = ['type2', 'type6']
    draft.genreMismatchSubtypes = ['promptResponse']
    const current = toRecord(draft)
    const exportedAt = new Date().toISOString()
    const restored = parseBackup({ schemaVersion: 1, exportedAt, records: [legacy, current] }).records
    expect(restored.map(record => record.genreMismatchSubtypes)).toEqual([[], ['promptResponse']])
    expect(JSON.parse(backupJson(restored)).records[1].genreMismatchSubtypes).toEqual(['promptResponse'])
    expect(filterReviews(restored, { ...EMPTY_FILTERS, type: 'type6' })).toEqual([restored[1]])
    expect(typeCounts(restored).find(item => item.key === 'type6')?.count).toBe(1)
    const [headers, oldRow, newRow] = exportCsv(restored).slice(1).split('\r\n').map(line => line.split(','))
    const type6Index = headers.indexOf('"type6"')
    const proposalIndex = headers.indexOf('"researchProposal"')
    const promptIndex = headers.indexOf('"promptResponse"')
    expect([proposalIndex, promptIndex]).toEqual([headers.indexOf('"unclassified"') + 1, headers.indexOf('"unclassified"') + 2])
    expect([oldRow[type6Index], oldRow[proposalIndex], oldRow[promptIndex]]).toEqual(['"0"', '"0"', '"0"'])
    expect([newRow[type6Index], newRow[proposalIndex], newRow[promptIndex]]).toEqual(['"1"', '"0"', '"1"'])
    expect(() => parseBackup({ schemaVersion: 1, exportedAt, records: [{ ...current, genreMismatchSubtypes: [] }] })).toThrow()
    expect(() => parseBackup({ schemaVersion: 1, exportedAt, records: [{ ...current, genreMismatchSubtypes: ['unknown'] }] })).toThrow()
  })

  it('restores, filters, counts, and exports Type 7 without changing older records', () => {
    const legacy = create('Legacy', 'English', '60m', 1)
    legacy.problemTypes = ['type3']
    const current = create('Weak English', 'English', '30m', 1)
    current.problemTypes = ['type3', 'type7']
    const restored = parseBackup({ schemaVersion: 1, exportedAt: new Date().toISOString(), records: [legacy, current] }).records
    expect(restored.map(record => record.problemTypes)).toEqual([['type3'], ['type3', 'type7']])
    expect(JSON.parse(backupJson(restored)).records[1].problemTypes).toEqual(['type3', 'type7'])
    expect(filterReviews(restored, { ...EMPTY_FILTERS, type: 'type7' })).toEqual([restored[1]])
    expect(typeCounts(restored).find(item => item.key === 'type7')?.count).toBe(1)
    const [headers, legacyRow, currentRow] = exportCsv(restored).slice(1).split('\r\n').map(line => line.split(','))
    const index = headers.indexOf('"type7"')
    expect(index).toBe(headers.indexOf('"unclassified"') - 1)
    expect([legacyRow[index], currentRow[index]]).toEqual(['"0"', '"1"'])
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

  it('migrates every legacy Background without inferring the missing dimension', () => {
    const { careerStage: _career, sector: _sector, ...legacy } = create('Legacy', 'English', '60m', 1)
    const exportedAt = new Date().toISOString()
    const cases = [
      [undefined, '', ''], ['', '', ''], ['Not specified', '', ''],
      ['Fresh Graduate', 'Student / Fresh Graduate', ''], ['Corporate', '', 'Corporate'],
      ['Public Sector', '', 'Public Sector'], ['NGO', '', 'NGO / Nonprofit'], ['Other', '', 'Other'],
    ]
    for (const [background, careerStage, sector] of cases) {
      const input = background === undefined ? legacy : { ...legacy, background }
      const [restored] = parseBackup({ schemaVersion: 1, exportedAt, records: [input] }).records
      expect(restored).toMatchObject({ careerStage, sector })
      expect(restored).not.toHaveProperty('background')
      expect(recordToDraft(restored)).toMatchObject({ careerStage, sector })
      expect(parseBackup(JSON.parse(backupJson([restored]))).records).toEqual([restored])
    }
    for (const background of [null, 'Academic / Research']) {
      expect(() => parseBackup({ schemaVersion: 1, exportedAt, records: [{ ...legacy, background }] })).toThrow()
    }
    const [current] = parseBackup({ schemaVersion: 1, exportedAt, records: [{
      ...legacy, background: 'Fresh Graduate', careerStage: '', sector: 'Corporate',
    }] }).records
    expect(current).toMatchObject({ careerStage: '', sector: 'Corporate' })
    for (const field of ['careerStage', 'sector']) {
      for (const invalid of [null, 'Invalid']) {
        expect(() => parseBackup({ schemaVersion: 1, exportedAt, records: [{ ...current, [field]: invalid }] })).toThrow()
      }
    }
  })

  it('filters both dimensions independently and exports separate CSV columns', () => {
    const records = [
      { ...create('Early Public', 'English', '60m', 1), careerStage: 'Early Career' as const, sector: 'Public Sector' as const, revision_academic_plan: 'rebuild' as const },
      { ...create('Early Corporate', 'English', '30m', 1), careerStage: 'Early Career' as const, sector: 'Corporate' as const },
      { ...create('Unknown Public', 'Korean', '30m', 1), sector: 'Public Sector' as const },
      create('Unspecified', 'English', '30m', 1),
    ]
    const early = filterReviews(records, { ...EMPTY_FILTERS, careerStage: 'Early Career' })
    const publicSector = filterReviews(records, { ...EMPTY_FILTERS, sector: 'Public Sector' })
    expect(early).toEqual(records.slice(0, 2))
    expect(publicSector).toEqual([records[0], records[2]])
    expect(revisionRebuildPercent(early, 'revision_academic_plan').percent).toBe(50)
    expect(revisionRebuildPercent(publicSector, 'revision_academic_plan').percent).toBe(50)
    expect(filterReviews(records, { ...EMPTY_FILTERS, careerStage: 'Early Career', sector: 'Public Sector' })).toEqual([records[0]])
    expect(filterReviews(records, { ...EMPTY_FILTERS, careerStage: '__missing' })).toEqual(records.slice(2))
    expect(filterReviews(records, { ...EMPTY_FILTERS, sector: '__missing' })).toEqual([records[3]])
    const [headers, row] = exportCsv(records).slice(1).split('\r\n').map(line => line.split(','))
    const index = headers.indexOf('"career_stage"')
    expect(index).toBe(headers.indexOf('"field"') + 1)
    expect(headers[index + 1]).toBe('"sector"')
    expect([row[index], row[index + 1]]).toEqual(['"Early Career"', '"Public Sector"'])
    expect(headers).not.toContain('"background"')
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


describe('revision rounds and stable Type 4 identity', () => {
  it('preserves Type 4 and normalizes only missing rounds to numeric 1', () => {
    expect(TYPE_LABELS.type4).toBe('Type 4 — Narrative / Indirect')
    expect(TYPE_HELP.type4).toBe('핵심 의미를 늦추거나 숨기고, 극적 효과를 위해 우회적으로 서술')
    expect(blankDraft().revisionRound).toBe(1)
    const draft = completeDraft()
    draft.problemTypes = ['type4']
    const record = toRecord(draft)
    const { revisionRound: _round, ...legacy } = record
    const exportedAt = new Date().toISOString()
    const [restored] = parseBackup({ schemaVersion: 1, exportedAt, records: [legacy] }).records
    expect(restored).toEqual(record)
    expect(restored.problemTypes).toEqual(['type4'])
    expect(recordToDraft(restored).revisionRound).toBe(1)
    for (const round of REVISION_ROUNDS) {
      const current = { ...record, revisionRound: round }
      expect(parseBackup(JSON.parse(backupJson([current]))).records[0]).toEqual(current)
    }
    for (const revisionRound of [0, 4, 1.5, '2', null, undefined]) {
      expect(() => parseBackup({ schemaVersion: 1, exportedAt, records: [{ ...record, revisionRound }] })).toThrow()
    }
    const [headers, row] = exportCsv([record]).slice(1).split('\r\n').map(line => line.split(','))
    const index = headers.indexOf('"revision_round"')
    expect(index).toBe(headers.indexOf('"student_name"') + 1)
    expect(row[index]).toBe('"1"')
    expect(row[headers.indexOf('"type4"')]).toBe('"1"')
  })

  it('applies the same problem classification rules in every round', () => {
    expect(REVISION_ROUNDS).toEqual([1, 2, 3])
    for (const round of REVISION_ROUNDS) {
      for (const key of TYPE_KEYS) {
        const draft = completeDraft()
        draft.revisionRound = round
        draft.problemTypes = [key]
        draft.genreMismatchSubtypes = key === 'type6' ? ['researchProposal'] : []
        draft.unclassifiedNote = key === 'unclassified' ? '새 패턴' : ''
        expect(validateDraft(draft)).toBeNull()
        const record = toRecord(draft)
        expect(record).toMatchObject({ studentName: '홍길동', revisionRound: round, problemTypes: [key] })
        expect(recordToDraft(record).revisionRound).toBe(round)
      }
      const draft = completeDraft()
      draft.revisionRound = round
      draft.problemTypes = ['type6']
      expect(validateDraft(draft)).toMatch(/Type 6/)
    }
    const draft = completeDraft()
    Object.assign(draft, { revisionRound: 4 })
    expect(validateDraft(draft)).toMatch(/Revision Round/)
  })

  it('filters round counts and recurring problem types independently of other dimensions', () => {
    const records = REVISION_ROUNDS.map(round => {
      const draft = completeDraft()
      draft.revisionRound = round
      draft.problemTypes = ['type4', 'type7']
      return toRecord(draft)
    })
    for (const round of REVISION_ROUNDS) {
      const filtered = filterReviews(records, { ...EMPTY_FILTERS, revisionRound: String(round) })
      expect(filtered).toEqual([records[round - 1]])
      expect(typeCounts(filtered).find(item => item.key === 'type4')?.count).toBe(1)
      expect(typeCounts(filtered).find(item => item.key === 'type7')?.count).toBe(1)
    }
    expect(filterReviews(records, { ...EMPTY_FILTERS, revisionRound: '2', type: 'type4' })).toEqual([records[1]])
    expect(filterReviews(records, { ...EMPTY_FILTERS, revisionRound: '2', type: 'type3' })).toEqual([])
    expect(filterReviews(records, EMPTY_FILTERS)).toEqual(records)
  })
})
