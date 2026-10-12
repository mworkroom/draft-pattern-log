import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { EMPTY_FILTERS, explorePatterns, filterReviews, sortRecent } from './analytics'
import {
  GENRE_MISMATCH_LABELS, MBTI_OPTIONS, REWORK_LABELS, REVISION_KEYS, REVISION_LABELS,
  STRUCTURE_KEYS, STRUCTURE_LABELS, TYPE_KEYS, TYPE_LABELS,
  type Mbti, type ReviewRecordV1, type TypeKey,
} from './model'
import { focusReviewForm } from './reviewNavigation'

interface Props {
  records: ReviewRecordV1[]
  onEdit: (record: ReviewRecordV1) => void
}

function ReviewCases({ records, onEdit }: Props) {
  const [showAll, setShowAll] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const recent = useMemo(() => sortRecent(records), [records])
  const visible = showAll ? recent : recent.slice(0, 5)

  return <section className="explorer-cases" aria-label="Previous Reviews">
    <div className="explorer-subhead"><h4>Previous Reviews</h4>
      {records.length > 5 ? <button type="button" className="text-button" onClick={() => setShowAll(value => !value)}>{showAll ? 'Show fewer' : 'View all'}</button> : null}
    </div>
    {visible.map(record => {
      const open = expanded[record.id] ?? (records.length < 5 && record.id === recent[0]?.id)
      const weak = STRUCTURE_KEYS.filter(key => record.structure[key] <= 1)
      return <div className="explorer-case" key={record.id}>
        <button type="button" className="explorer-case-toggle" aria-expanded={open}
          aria-controls={'explorer-review-' + record.id}
          onClick={() => setExpanded(current => ({ ...current, [record.id]: !open }))}>
          <strong>{record.studentName}</strong><span>Round {record.revisionRound} · {record.reviewDate} · {record.timeSpent}</span>
          {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
        {open ? <div className="explorer-case-detail" id={'explorer-review-' + record.id}>
          <dl>
            <dt>Problem Types</dt><dd>{record.problemTypes.map(key => TYPE_LABELS[key]).join(' · ') || 'No types recorded'}</dd>
            <dt>Weak Structure</dt><dd>{weak.length ? weak.map(key => <span className="explorer-detail-item" key={key}>{STRUCTURE_LABELS[key].label}: {record.structure[key]} / 2</span>) : 'No structure items scored 0 or 1'}</dd>
            <dt>Major Rework</dt><dd>{record.rework.map(key => REWORK_LABELS[key]).join(' · ') || 'No rework selected'}</dd>
            <dt>Revision Focus</dt><dd>{REVISION_KEYS.map(key => <span className="explorer-detail-item" key={key}>{REVISION_LABELS[key]}: {record[key]}</span>)}</dd>
            {record.genreMismatchSubtypes.length ? <><dt>Genre Mismatch</dt><dd>{record.genreMismatchSubtypes.map(key => GENRE_MISMATCH_LABELS[key]).join(' · ')}</dd></> : null}
            {record.unclassifiedNote ? <><dt>New Pattern Note</dt><dd>{record.unclassifiedNote}</dd></> : null}
            <dt>Short Notes</dt><dd>{record.notes || 'No notes recorded'}</dd>
          </dl>
          <button type="button" className="tool-button" onClick={() => onEdit(record)}>Edit record</button>
        </div> : null}
      </div>
    })}
  </section>
}

export default function PatternExplorer({ records, onEdit }: Props) {
  const [selection, setSelection] = useState<{ mbti: Mbti; type: TypeKey | '' }>({ mbti: '', type: '' })
  const selected = useMemo(() => filterReviews(records, { ...EMPTY_FILTERS, ...selection }), [records, selection])
  const stats = useMemo(() => explorePatterns(selected, selection.type), [selected, selection.type])
  const small = stats.total < 5
  const rate = (count: number, percent: number) => `${count}/${stats.total} reviews${small ? '' : ` (${percent}%)`}`
  const cases = <ReviewCases key={selection.mbti + ':' + selection.type} records={selected} onEdit={onEdit} />

  return <section className="pattern-explorer" aria-label="Pattern Explorer">
    <div className="explorer-heading"><h3>Pattern Explorer</h3>
      <button type="button" className="text-button explorer-form-link" onClick={focusReviewForm}>Go to input ↓</button>
    </div>
    <div className="explorer-controls">
      <label className="filter-select"><span>MBTI</span><select aria-label="Explorer MBTI" value={selection.mbti}
        onChange={event => setSelection(current => ({ ...current, mbti: event.target.value as Mbti }))}>
        <option value="">All groups</option>{MBTI_OPTIONS.map(value => <option key={value} value={value}>{value}</option>)}
      </select></label>
      <label className="filter-select"><span>Problem Type</span><select aria-label="Explorer Problem Type" value={selection.type}
        onChange={event => setSelection(current => ({ ...current, type: event.target.value as TypeKey | '' }))}>
        <option value="">All types</option>{TYPE_KEYS.map(value => <option key={value} value={value}>{TYPE_LABELS[value]}</option>)}
      </select></label>
      <button className="text-button" type="button" onClick={() => setSelection({ mbti: '', type: '' })}>Clear</button>
    </div>
    <div className="explorer-selection" aria-live="polite">
      <strong>{selection.mbti || 'All groups'} AND {selection.type ? TYPE_LABELS[selection.type] : 'All types'}</strong>
      <span>{stats.total} {stats.total === 1 ? 'review' : 'reviews'} · {stats.rounds.map(item => `Round ${item.round}: ${item.count}`).join(' / ')}</span>
    </div>
    {!stats.total ? <div className="explorer-empty"><p>No matching reviews</p>
      {selection.mbti ? <button className="tool-button" type="button" onClick={() => setSelection(current => ({ ...current, mbti: '' }))}>Clear MBTI</button> : null}
      {selection.type ? <button className="tool-button" type="button" onClick={() => setSelection(current => ({ ...current, type: '' }))}>Clear Problem Type</button> : null}
      <span>Median Time: —</span>
    </div> : <>
      {small ? cases : null}
      <div className="explorer-summary-grid">
        <section className="explorer-summary" aria-label="Draft Patterns"><h4>Draft Patterns</h4>
          <h5>{selection.type ? 'Other types recorded together' : 'Most observed types'}</h5>
          {stats.types.length ? <ul>{stats.types.map(item => <li key={item.key}><span>{TYPE_LABELS[item.key]}</span><strong>{rate(item.count, item.percent)}</strong></li>)}</ul> : <p>No other types recorded</p>}
          <h5>Structure scored 0 or 1</h5>
          {stats.weakStructure.length ? <ul>{stats.weakStructure.map(item => <li key={item.key}><span>{STRUCTURE_LABELS[item.key].label}</span><strong>{rate(item.count, item.percent)}</strong></li>)}</ul> : <p>No structure items scored 0 or 1</p>}
        </section>
        <section className="explorer-summary" aria-label="Common Actions"><h4>Common Actions</h4>
          <h5>Major Rework recorded</h5>
          {stats.rework.length ? <ul>{stats.rework.map(item => <li key={item.key}><span>{REWORK_LABELS[item.key]}</span><strong>{rate(item.count, item.percent)}</strong></li>)}</ul> : <p>No rework selected</p>}
          <h5>Revision Focus</h5>
          <div className="explorer-revision">{stats.revisionFocus.map(item => <div key={item.key}><strong>{REVISION_LABELS[item.key]}</strong>
            <span>{item.levels.map(level => `${level.level}: ${level.count}/${stats.total}${small ? '' : ` (${level.percent}%)`}`).join(' · ')}</span>
          </div>)}</div>
        </section>
      </div>
      <div className="explorer-time"><span>Median Time <strong>{stats.medianTime}</strong> · {stats.total} reviews</span>
        <details><summary>By round</summary><ul>{stats.rounds.map(item => <li key={item.round}>Round {item.round}: <strong>{item.medianTime}</strong> · {item.count} reviews</li>)}</ul></details>
      </div>
      {!small ? cases : null}
      <details className="explorer-info"><summary>About recorded values</summary>
        <p>MBTI groups are manually assigned writing-pattern labels. Each revision round counts as a review. Type and rework percentages use the selected reviews and may add up to more than 100%.</p>
        <p>Revision Focus shows stored values. Older records without these fields may have been filled with “none”. These counts describe past work; they do not establish which action was effective or predict the next review’s time.</p>
      </details>
    </>}
  </section>
}
