import {
  REWORK_KEYS, STRUCTURE_KEYS, TIME_OPTIONS, TYPE_KEYS,
  type ReviewRecordV1, type ReworkKey, type StructureKey, type TypeKey,
} from './model'

export interface Filters {
  from: string
  to: string
  language: string
  level: string
  field: string
  tier: string
  type: string
}

export const EMPTY_FILTERS: Filters = {
  from: '', to: '', language: '', level: '', field: '', tier: '', type: '',
}

export function filterReviews(records: ReviewRecordV1[], filters: Filters): ReviewRecordV1[] {
  return records.filter(record =>
    (!filters.from || record.reviewDate >= filters.from) &&
    (!filters.to || record.reviewDate <= filters.to) &&
    (!filters.language || record.draftLanguage === filters.language) &&
    (!filters.level || (record.level ?? '__missing') === filters.level) &&
    (!filters.field || (record.field || '__missing').toLocaleLowerCase() === filters.field.toLocaleLowerCase()) &&
    (!filters.tier || (record.schoolTier ?? '__missing') === filters.tier) &&
    (!filters.type || record.problemTypes.includes(filters.type as TypeKey)),
  )
}

export function median(values: number[]): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

export function medianTime(records: ReviewRecordV1[]): string {
  if (!records.length) return 'No data'
  const ordered = records.map(record => TIME_OPTIONS.indexOf(record.timeSpent)).sort((a, b) => a - b)
  const mid = Math.floor(ordered.length / 2)
  if (ordered.length % 2) return TIME_OPTIONS[ordered[mid]]
  const left = TIME_OPTIONS[ordered[mid - 1]]
  const right = TIME_OPTIONS[ordered[mid]]
  return left === right ? left : left + '–' + right
}

export function formatMedian(value: number | null): string {
  return value === null ? 'No data' : Number.isInteger(value) ? String(value) : value.toFixed(1)
}

export function averageStructure(records: ReviewRecordV1[], key: StructureKey): string {
  if (!records.length) return '—'
  return (records.reduce((sum, record) => sum + record.structure[key], 0) / records.length).toFixed(1)
}

export function percentWithCount(records: ReviewRecordV1[], key: ReworkKey): { percent: number; count: number; total: number } {
  const count = records.filter(record => record.rework.includes(key)).length
  return { count, total: records.length, percent: records.length ? Math.round(count / records.length * 100) : 0 }
}

export function typeCounts(records: ReviewRecordV1[]) {
  return TYPE_KEYS.map(key => ({ key, count: records.filter(record => record.problemTypes.includes(key)).length }))
}

export function reworkCounts(records: ReviewRecordV1[]) {
  return REWORK_KEYS.map(key => ({ key, count: records.filter(record => record.rework.includes(key)).length }))
    .sort((a, b) => b.count - a.count)
}

export function sortRecent(records: ReviewRecordV1[]): ReviewRecordV1[] {
  return [...records].sort((a, b) => b.reviewDate.localeCompare(a.reviewDate) || b.createdAt.localeCompare(a.createdAt))
}

export function groupLanguage(records: ReviewRecordV1[], language: 'English' | 'Korean'): ReviewRecordV1[] {
  return records.filter(record => record.draftLanguage === language)
}

export function scoreMedian(records: ReviewRecordV1[]): number | null {
  return median(records.map(record => STRUCTURE_KEYS.reduce((sum, key) => sum + record.structure[key], 0)))
}

export function reworkMedian(records: ReviewRecordV1[]): number | null {
  return median(records.map(record => record.rework.length))
}
