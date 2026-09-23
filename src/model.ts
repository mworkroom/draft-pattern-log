export const STRUCTURE_KEYS = [
  'overallStructure',
  'paragraphFunction',
  'experienceSelection',
  'logicConnection',
  'academicPlan',
  'moduleConnection',
  'shortTermPlan',
  'readerContext',
] as const

export const REWORK_KEYS = [
  'mergeParagraphs',
  'moveContent',
  'compressExperience',
  'addMotivationBridge',
  'rebuildAcademicPlan',
  'rebuildConclusion',
  'inferHiddenLogic',
] as const

export const TYPE_KEYS = ['type1', 'type2', 'type3', 'type4', 'unclassified'] as const
export const TIME_OPTIONS = ['20m', '30m', '45m', '60m', '90m', '120m+'] as const
export const LANGUAGES = ['English', 'Korean'] as const
export const LEVELS = ["Master's", "Bachelor's", 'Other'] as const
export const TIERS = ['Top', 'Mid', 'Other'] as const
export const AI_USAGE = ['Yes', 'No', 'Unsure'] as const
export const ENGLISH_QUALITY = ['Good', 'Average', 'Poor'] as const
// Add or reorder Field dropdown choices here; existing free-text records remain readable.
export const FIELD_OPTIONS = [
  'Business',
  'STEM',
  'Sport',
  'Development Studies',
  'International Relations',
  'Education',  
  'Social Sciences',
  'UCAS',
  'Foundation',
  'Other',
] as const

export type StructureKey = typeof STRUCTURE_KEYS[number]
export type ReworkKey = typeof REWORK_KEYS[number]
export type TypeKey = typeof TYPE_KEYS[number]
export type TimeOption = typeof TIME_OPTIONS[number]
export type Language = typeof LANGUAGES[number]
export type Level = typeof LEVELS[number]
export type Tier = typeof TIERS[number]
export type AiUsage = typeof AI_USAGE[number]
export type EnglishQuality = typeof ENGLISH_QUALITY[number]
export type StructureScores = Record<StructureKey, 0 | 1 | 2 | null>

export interface ReviewRecordV1 {
  id: string
  reviewDate: string
  createdAt: string
  updatedAt: string
  studentName: string
  draftLanguage: Language
  level: Level | null
  field: string
  schoolTier: Tier | null
  wordLimit: number | null
  draftLength: number | null
  aiUsage: AiUsage | null
  structure: Record<StructureKey, 0 | 1 | 2>
  rework: ReworkKey[]
  problemTypes: TypeKey[]
  unclassifiedNote: string
  timeSpent: TimeOption
  surfaceEnglishQuality: EnglishQuality | null
  notes: string
}

export interface ReviewDraft extends Omit<ReviewRecordV1, 'id' | 'createdAt' | 'updatedAt' | 'structure' | 'wordLimit' | 'draftLength'> {
  structure: StructureScores
  wordLimit: string
  draftLength: string
}

export interface BackupV1 {
  schemaVersion: 1
  exportedAt: string
  records: ReviewRecordV1[]
}

export const STRUCTURE_LABELS: Record<StructureKey, { label: string; help: string }> = {
  overallStructure: { label: 'Overall Structure', help: '서론, 경험, 학업 계획, 결론이 기능적으로 이어지나요?' },
  paragraphFunction: { label: 'Paragraph Function', help: '각 단락이 하나의 명확한 역할을 하나요?' },
  experienceSelection: { label: 'Experience Selection', help: '필요한 경험을 선별하고 불필요한 나열을 줄였나요?' },
  logicConnection: { label: 'Logic Connection', help: '경험과 의미, 지원 동기 사이의 논리가 글에 드러나나요?' },
  academicPlan: { label: 'Academic Plan Exists', help: '지원 과정에서 공부할 내용이 별도로 있나요?' },
  moduleConnection: { label: 'Module Connection', help: '모듈·연구·프로젝트가 경험 또는 목표와 연결되나요?' },
  shortTermPlan: { label: 'Short-term Plan', help: '졸업 직후 약 1–3년의 방향이 구체적인가요?' },
  readerContext: { label: 'Reader Context', help: '외부 심사위원이 배경과 중간 논리를 이해할 수 있나요?' },
}

export const REWORK_LABELS: Record<ReworkKey, string> = {
  mergeParagraphs: 'Merge Paragraphs',
  moveContent: 'Move Content',
  compressExperience: 'Compress Experience',
  addMotivationBridge: 'Add Motivation Bridge',
  rebuildAcademicPlan: 'Rebuild Academic Plan',
  rebuildConclusion: 'Rebuild Conclusion',
  inferHiddenLogic: 'Infer Hidden Logic',
}

export const TYPE_LABELS: Record<TypeKey, string> = {
  type1: 'Type 1 · Length + Structure',
  type2: 'Type 2 · Structure',
  type3: 'Type 3 · Experience / Plan',
  type4: 'Type 4 · Delayed-point',
  unclassified: 'Unclassified / New Pattern',
}

export const TYPE_HELP: Record<TypeKey, string> = {
  type1: '분량 초과와 구조 문제가 함께 발생',
  type2: '분량보다 단락 역할·배치가 주요 문제',
  type3: '과거 경험과 학업 계획의 분량 불균형',
  type4: '핵심 의미가 뒤늦게 등장하는 서사형 구조',
  unclassified: '기존 Type으로 충분히 설명되지 않는 문제',
}

export function localToday(): string {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

export function blankDraft(reviewDate = localToday()): ReviewDraft {
  return {
    reviewDate,
    studentName: '',
    draftLanguage: 'English',
    level: "Master's",
    field: '',
    schoolTier: 'Mid',
    wordLimit: '',
    draftLength: '',
    aiUsage: 'Yes',
    structure: Object.fromEntries(STRUCTURE_KEYS.map(key => [key, null])) as StructureScores,
    rework: [],
    problemTypes: [],
    unclassifiedNote: '',
    timeSpent: '60m',
    surfaceEnglishQuality: null,
    notes: '',
  }
}

export function recordToDraft(record: ReviewRecordV1): ReviewDraft {
  return {
    ...record,
    wordLimit: record.wordLimit?.toString() ?? '',
    draftLength: record.draftLength?.toString() ?? '',
  }
}

export function structureTotal(structure: StructureScores): number {
  return STRUCTURE_KEYS.reduce((sum, key) => sum + (structure[key] ?? 0), 0)
}

export function validateDraft(draft: ReviewDraft): string | null {
  if (!draft.studentName.trim()) return 'Student Name을 입력해 주세요.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.reviewDate) || Number.isNaN(Date.parse(draft.reviewDate))) return '유효한 Review Date를 선택해 주세요.'
  if (!STRUCTURE_KEYS.every(key => draft.structure[key] !== null)) return 'Structure Score 8개를 모두 선택해 주세요.'
  if (draft.problemTypes.includes('unclassified') && !draft.unclassifiedNote.trim()) return 'Unclassified의 새 패턴 메모를 입력해 주세요.'
  for (const value of [draft.wordLimit, draft.draftLength]) {
    if (value && (!/^\d+$/.test(value) || Number(value) > 100000)) return 'Word Limit과 Draft Length는 0–100000의 정수로 입력해 주세요.'
  }
  return null
}

export function toRecord(draft: ReviewDraft, original?: ReviewRecordV1): ReviewRecordV1 {
  const now = new Date().toISOString()
  return {
    id: original?.id ?? crypto.randomUUID(),
    createdAt: original?.createdAt ?? now,
    updatedAt: now,
    reviewDate: draft.reviewDate,
    studentName: draft.studentName.trim(),
    draftLanguage: draft.draftLanguage,
    level: draft.level,
    field: draft.field.trim(),
    schoolTier: draft.schoolTier,
    wordLimit: draft.wordLimit === '' ? null : Number(draft.wordLimit),
    draftLength: draft.draftLength === '' ? null : Number(draft.draftLength),
    aiUsage: draft.aiUsage,
    structure: draft.structure as ReviewRecordV1['structure'],
    rework: [...draft.rework],
    problemTypes: [...draft.problemTypes],
    unclassifiedNote: draft.problemTypes.includes('unclassified') ? draft.unclassifiedNote.trim() : '',
    timeSpent: draft.timeSpent,
    surfaceEnglishQuality: draft.draftLanguage === 'English' ? draft.surfaceEnglishQuality : null,
    notes: draft.notes.trim(),
  }
}
