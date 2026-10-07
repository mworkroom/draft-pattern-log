import {
  AI_USAGE, CAREER_STAGE_OPTIONS, SECTOR_OPTIONS, ENGLISH_QUALITY, GENRE_MISMATCH_SUBTYPES, LANGUAGES, LEVELS, REWORK_KEYS, REVISION_KEYS, REVISION_LEVELS,
  STRUCTURE_KEYS, TIERS, TIME_OPTIONS, TYPE_KEYS, REVISION_ROUNDS, MBTI_OPTIONS,
  type BackupV1, type ReviewRecordV1,
} from './model'

export const STORAGE_KEY = 'sop-score-tracker:records:v1'
const BACKUP_KEY = 'sop-score-tracker:last-backup-at'
const RETIRED_REWORK_KEYS = new Set(['addMotivationBridge', 'rebuildAcademicPlan', 'rebuildConclusion'])

type UnknownObject = Record<string, unknown>
const isObject = (value: unknown): value is UnknownObject => typeof value === 'object' && value !== null && !Array.isArray(value)
const isOption = <T extends string>(value: unknown, options: readonly T[]): value is T => typeof value === 'string' && options.includes(value as T)
const isOptionalOption = <T extends string>(value: unknown, options: readonly T[]) => value === null || isOption(value, options)
const isDate = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))
const isTimestamp = (value: unknown) => typeof value === 'string' && !Number.isNaN(Date.parse(value))
const isOptionalCount = (value: unknown) => value === null || (Number.isInteger(value) && typeof value === 'number' && value >= 0 && value <= 100000)
const isKeyArray = <T extends string>(value: unknown, keys: readonly T[]): value is T[] =>
  Array.isArray(value) && value.every(item => isOption(item, keys)) && new Set(value).size === value.length

export function isReviewRecord(value: unknown): value is ReviewRecordV1 {
  if (!isObject(value) || !isObject(value.structure)) return false
  const structure = value.structure
  return typeof value.id === 'string' && value.id.length > 0 &&
    isDate(value.reviewDate) && isTimestamp(value.createdAt) && isTimestamp(value.updatedAt) &&
    typeof value.studentName === 'string' && value.studentName.trim().length > 0 &&
    REVISION_ROUNDS.some(round => value.revisionRound === round) &&
    (value.mbti === '' || isOption(value.mbti, MBTI_OPTIONS)) &&
    isOption(value.draftLanguage, LANGUAGES) &&
    isOptionalOption(value.level, LEVELS) &&
    typeof value.field === 'string' &&
    (value.careerStage === '' || isOption(value.careerStage, CAREER_STAGE_OPTIONS)) &&
    (value.sector === '' || isOption(value.sector, SECTOR_OPTIONS)) &&
    isOptionalOption(value.schoolTier, TIERS) &&
    isOptionalCount(value.wordLimit) && isOptionalCount(value.draftLength) &&
    isOptionalOption(value.aiUsage, AI_USAGE) &&
    STRUCTURE_KEYS.every(key => structure[key] === 0 || structure[key] === 1 || structure[key] === 2) &&
    isKeyArray(value.rework, REWORK_KEYS) &&
    isKeyArray(value.problemTypes, TYPE_KEYS) &&
    !(value.problemTypes.includes('type1') && value.problemTypes.includes('type2')) &&
    isKeyArray(value.genreMismatchSubtypes, GENRE_MISMATCH_SUBTYPES) &&
    (value.problemTypes.includes('type6') ? value.genreMismatchSubtypes.length > 0 : value.genreMismatchSubtypes.length === 0) &&
    typeof value.unclassifiedNote === 'string' &&
    (!value.problemTypes.includes('unclassified') || value.unclassifiedNote.trim().length > 0) &&
    REVISION_KEYS.every(key => isOption(value[key], REVISION_LEVELS)) &&
    isOption(value.timeSpent, TIME_OPTIONS) &&
    isOptionalOption(value.surfaceEnglishQuality, ENGLISH_QUALITY) &&
    (value.draftLanguage === 'English' || value.surfaceEnglishQuality === null) &&
    typeof value.notes === 'string'
}

function normalizeRecord(value: unknown): unknown {
  if (!isObject(value)) return value
  const missing = REVISION_KEYS.filter(key => !Object.hasOwn(value, key))
  const missingRevisionRound = !Object.hasOwn(value, 'revisionRound')
  const missingMbti = !Object.hasOwn(value, 'mbti')
  const missingCareerStage = !Object.hasOwn(value, 'careerStage')
  const missingSector = !Object.hasOwn(value, 'sector')
  const hasBackground = Object.hasOwn(value, 'background')
  const legacyBackground = value.background
  if (hasBackground && legacyBackground !== '' && legacyBackground !== 'Not specified' &&
    !isOption(legacyBackground, ['Fresh Graduate', 'Corporate', 'Public Sector', 'NGO', 'Other'])) {
    throw new Error('지원하지 않는 Background 값입니다.')
  }
  const careerStage = legacyBackground === 'Fresh Graduate' ? 'Student / Fresh Graduate' : ''
  const sector = legacyBackground === 'NGO' ? 'NGO / Nonprofit'
    : isOption(legacyBackground, SECTOR_OPTIONS) ? legacyBackground : ''
  const missingGenreSubtypes = !Object.hasOwn(value, 'genreMismatchSubtypes')
  const originalRework = value.rework
  const rework = Array.isArray(originalRework)
    ? originalRework.filter(item => typeof item !== 'string' || !RETIRED_REWORK_KEYS.has(item))
    : null
  const removedRework = Array.isArray(originalRework) && rework !== null && rework.length !== originalRework.length
  if (!missing.length && !missingMbti && !missingRevisionRound && !removedRework && !missingCareerStage && !missingSector && !hasBackground && !missingGenreSubtypes) return value
  const { background: _legacyBackground, ...current } = value
  return {
    ...current,
    ...(missingMbti ? { mbti: '' } : {}),
    ...(missingRevisionRound ? { revisionRound: 1 } : {}),
    ...(removedRework ? { rework } : {}),
    ...(missingCareerStage ? { careerStage } : {}),
    ...(missingSector ? { sector } : {}),
    ...(missingGenreSubtypes ? { genreMismatchSubtypes: [] } : {}),
    ...Object.fromEntries(missing.map(key => [key, 'none'])),
  }
}

export function parseBackup(value: unknown): BackupV1 {
  if (!isObject(value) || value.schemaVersion !== 1 || !isTimestamp(value.exportedAt) || !Array.isArray(value.records)) {
    throw new Error('지원하지 않는 백업 형식이거나 기록 데이터가 올바르지 않습니다.')
  }
  const records = value.records.map(normalizeRecord)
  if (!records.every(isReviewRecord)) throw new Error('지원하지 않는 백업 형식이거나 기록 데이터가 올바르지 않습니다.')
  const ids = records.map(record => record.id)
  if (new Set(ids).size !== ids.length) throw new Error('백업에 중복된 기록 ID가 있습니다.')
  return { schemaVersion: 1, exportedAt: value.exportedAt as string, records }
}

export function loadRecords(): ReviewRecordV1[] {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return []
  const backup = parseBackup(JSON.parse(raw))
  return backup.records
}

export function saveRecords(records: ReviewRecordV1[]): void {
  const backup: BackupV1 = { schemaVersion: 1, exportedAt: new Date().toISOString(), records }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(backup))
  localStorage.removeItem(BACKUP_KEY)
}

export interface ReviewRepository {
  load(): ReviewRecordV1[]
  save(records: ReviewRecordV1[]): void
}

export const localReviewRepository: ReviewRepository = {
  load: loadRecords,
  save: saveRecords,
}

export function lastBackupAt(): string | null {
  return localStorage.getItem(BACKUP_KEY)
}

export function markBackedUp(at: string): void {
  localStorage.setItem(BACKUP_KEY, at)
}

export function backupJson(records: ReviewRecordV1[]): string {
  const backup: BackupV1 = { schemaVersion: 1, exportedAt: new Date().toISOString(), records }
  return JSON.stringify(backup, null, 2)
}

function csvCell(value: string | number | null): string {
  const text = value === null ? '' : String(value)
  return '"' + text.replaceAll('"', '""') + '"'
}

export function exportCsv(records: ReviewRecordV1[]): string {
  const headers = [
    'id', 'review_date', 'created_at', 'updated_at', 'student_name', 'revision_round', 'mbti', 'draft_language', 'level', 'field', 'career_stage', 'sector',
    'school_tier', 'word_limit', 'draft_length', 'ai_usage',
    ...STRUCTURE_KEYS, 'structure_total', ...REWORK_KEYS, 'rework_total',
    ...TYPE_KEYS, ...GENRE_MISMATCH_SUBTYPES, 'unclassified_note', ...REVISION_KEYS, 'time_spent', 'surface_english_quality', 'notes',
  ]
  const rows = records.map(record => [
    record.id, record.reviewDate, record.createdAt, record.updatedAt, record.studentName, record.revisionRound, record.mbti,
    record.draftLanguage, record.level, record.field, record.careerStage, record.sector, record.schoolTier, record.wordLimit,
    record.draftLength, record.aiUsage,
    ...STRUCTURE_KEYS.map(key => record.structure[key]),
    STRUCTURE_KEYS.reduce((sum, key) => sum + record.structure[key], 0),
    ...REWORK_KEYS.map(key => record.rework.includes(key) ? 1 : 0),
    record.rework.length,
    ...TYPE_KEYS.map(key => record.problemTypes.includes(key) ? 1 : 0),
    ...GENRE_MISMATCH_SUBTYPES.map(key => record.genreMismatchSubtypes.includes(key) ? 1 : 0),
    record.unclassifiedNote, ...REVISION_KEYS.map(key => record[key]),
    record.timeSpent, record.surfaceEnglishQuality, record.notes,
  ])
  return '\uFEFF' + [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n')
}

export function downloadText(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
