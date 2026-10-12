import { useMemo, useState, type ReactNode } from 'react'
import { Pencil, Search, Trash2 } from 'lucide-react'
import { sortRecent } from './analytics'
import { REWORK_KEYS, STRUCTURE_KEYS, TYPE_LABELS, type ReviewRecordV1 } from './model'

interface Props {
  records: ReviewRecordV1[]
  title: string
  selectedId: string | null
  onSelect: (record: ReviewRecordV1) => void
  onEdit: (record: ReviewRecordV1) => void
  onDelete: (record: ReviewRecordV1) => void
  toolbar?: ReactNode
  overview?: boolean
}

export default function ReviewTable({ records, title, selectedId, onSelect, onEdit, onDelete, toolbar, overview = false }: Props) {
  const [search, setSearch] = useState('')
  const rows = useMemo(() => sortRecent(records).filter(record =>
    record.studentName.toLocaleLowerCase().includes(search.toLocaleLowerCase()) ||
    record.field.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  ), [records, search])
  return <section className="record-table-section" aria-label={title}>
    <div className="recent-head"><div><h3>{title}</h3><p>{records.length} {records.length === 1 ? 'review' : 'reviews'} in current filters</p></div></div>
    <div className={overview ? 'recent-toolbar' : 'matching-toolbar'}>{toolbar}
      <label className="table-search"><Search size={17}/><input aria-label={overview ? 'Search recent reviews' : 'Search matching reviews'} placeholder="Search name or field" value={search} onChange={event => setSearch(event.target.value)} /></label>
    </div>
    {search ? <p className="recent-filter-note">Showing {rows.length} of {records.length} matching reviews</p> : null}
    <div className="table-wrap record-table-scroll"><table className={'review-records-table ' + (overview ? 'reviews-table' : 'matching-reviews-table')}>
      <thead><tr><th scope="col">Date</th><th scope="col">Student</th><th scope="col">Round</th><th scope="col">Lang</th><th scope="col">Level</th><th scope="col">Field</th><th scope="col">Structure</th><th scope="col">Rework</th><th scope="col">Type</th><th scope="col">Time</th><th scope="col">Actions</th></tr></thead>
      <tbody>{rows.map(record => <tr key={record.id} className={selectedId === record.id ? 'selected-review' : undefined} aria-selected={selectedId === record.id}>
        <td>{record.reviewDate}</td><td><button className="student-link" type="button" onClick={() => onSelect(record)}>{record.studentName}</button></td>
        <td><span className="revision-round-badge">{record.revisionRound}차</span></td>
        <td><span className={'language-pill ' + record.draftLanguage.toLowerCase()}>{record.draftLanguage}</span></td>
        <td>{record.level ?? '—'}</td><td>{record.field || '—'}</td>
        <td>{STRUCTURE_KEYS.reduce((sum, key) => sum + record.structure[key], 0)} / 16</td><td>{record.rework.length} / {REWORK_KEYS.length}</td>
        <td className="type-cell" title={record.problemTypes.map(key => TYPE_LABELS[key]).join(' · ')}>{record.problemTypes.map(key => key === 'unclassified' ? 'New' : key.replace('type', 'T')).join(', ') || 'None'}</td>
        <td>{record.timeSpent}</td><td><div className="row-actions">
          <button type="button" aria-label={'Edit ' + record.studentName} onClick={() => onEdit(record)}><Pencil size={16}/></button>
          <button type="button" aria-label={'Delete ' + record.studentName} onClick={() => onDelete(record)}><Trash2 size={16}/></button>
        </div></td>
      </tr>)}
      {!rows.length ? <tr><td className="empty-table" colSpan={11}>No reviews match the current filters or search.</td></tr> : null}</tbody>
    </table></div>
  </section>
}
