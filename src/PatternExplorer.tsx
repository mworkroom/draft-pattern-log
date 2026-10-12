import { useMemo, useState } from 'react'
import { EMPTY_FILTERS, explorePatterns, filterReviews, mbtiDistribution } from './analytics'
import { MBTI_OPTIONS, REWORK_LABELS, STRUCTURE_LABELS, TYPE_KEYS, TYPE_LABELS, type Mbti, type ReviewRecordV1, type TypeKey } from './model'
import { FrequencyBars, MbtiBars, RevisionBars } from './PatternCharts'
import ReviewTable from './ReviewTable'

interface Props {
  records: ReviewRecordV1[]
  selectedId: string | null
  onSelect: (record: ReviewRecordV1) => void
  onGoToInput: () => void
  onEdit: (record: ReviewRecordV1) => void
  onDelete: (record: ReviewRecordV1) => void
}

export default function PatternExplorer({ records, selectedId, onSelect, onGoToInput, onEdit, onDelete }: Props) {
  const [selection, setSelection] = useState<{ mbti: Mbti; type: TypeKey | '' }>({ mbti: '', type: '' })
  const selected = useMemo(() => filterReviews(records, { ...EMPTY_FILTERS, ...selection }), [records, selection])
  const stats = useMemo(() => explorePatterns(selected, selection.type), [selected, selection.type])
  const mbtiStats = useMemo(() => mbtiDistribution(selected), [selected])
  const small = stats.total < 5

  return <section className="pattern-explorer" aria-label="Pattern Explorer">
    <div className="explorer-heading"><h2>Pattern Explorer</h2><button type="button" className="text-button explorer-form-link" onClick={onGoToInput}>Go to input ↓</button></div>
    <div className="explorer-controls">
      <label className="filter-select"><span>MBTI</span><select aria-label="Explorer MBTI" value={selection.mbti} onChange={event => setSelection(current => ({ ...current, mbti: event.target.value as Mbti }))}>
        <option value="">All groups</option>{MBTI_OPTIONS.map(value => <option key={value} value={value}>{value}</option>)}
      </select></label>
      <label className="filter-select"><span>Problem Type</span><select aria-label="Explorer Problem Type" value={selection.type} onChange={event => setSelection(current => ({ ...current, type: event.target.value as TypeKey | '' }))}>
        <option value="">All types</option>{TYPE_KEYS.map(value => <option key={value} value={value}>{TYPE_LABELS[value]}</option>)}
      </select></label>
      <button className="text-button" type="button" onClick={() => setSelection({ mbti: '', type: '' })}>Clear</button>
    </div>
    <div className="explorer-selection" aria-live="polite"><strong>{selection.mbti || 'All groups'} AND {selection.type ? TYPE_LABELS[selection.type] : 'All types'}</strong>
      <span>{stats.total} {stats.total === 1 ? 'review' : 'reviews'} · {stats.rounds.map(item => `Round ${item.round}: ${item.count}`).join(' / ')}</span>
    </div>
    {!stats.total ? <div className="explorer-empty"><p>No matching reviews</p>
      {selection.mbti ? <button className="tool-button" type="button" onClick={() => setSelection(current => ({ ...current, mbti: '' }))}>Clear MBTI</button> : null}
      {selection.type ? <button className="tool-button" type="button" onClick={() => setSelection(current => ({ ...current, type: '' }))}>Clear Problem Type</button> : null}
    </div> : null}
    <div className="explorer-time"><span>Median Time <strong>{stats.total ? stats.medianTime : '—'}</strong> · {stats.total} reviews</span>
      <details><summary>By round</summary><ul>{stats.rounds.map(item => <li key={item.round}>Round {item.round}: <strong>{item.medianTime}</strong> · {item.count} reviews</li>)}</ul></details>
    </div>
    <div className="explorer-charts-grid">
      <section className="explorer-chart" aria-label="Draft Patterns"><h4>Draft Patterns</h4><h5>{selection.type ? 'Other types recorded together' : 'Most observed types'}</h5>
        {stats.types.length ? <FrequencyBars items={stats.types.map(item => ({ ...item, label: TYPE_LABELS[item.key] }))} total={stats.total} showPercent={!small}/> : <p>No other types recorded</p>}
        <h5>Structure scored 0 or 1</h5>
        {stats.weakStructure.length ? <FrequencyBars items={stats.weakStructure.map(item => ({ ...item, label: STRUCTURE_LABELS[item.key].label }))} total={stats.total} showPercent={!small}/> : <p>No structure items scored 0 or 1</p>}
      </section>
      <section className="explorer-chart" aria-label="Common Actions"><h4>Common Actions</h4><h5>Major Rework recorded</h5>
        {stats.rework.length ? <FrequencyBars items={stats.rework.map(item => ({ ...item, label: REWORK_LABELS[item.key] }))} total={stats.total} showPercent={!small}/> : <p>No rework selected</p>}
        <h5>Revision Focus</h5><RevisionBars stats={stats} showPercent={!small}/>
      </section>
      <MbtiBars stats={mbtiStats}/>
    </div>
    <ReviewTable records={selected} title="Matching Reviews" selectedId={selectedId} onSelect={onSelect} onEdit={onEdit} onDelete={onDelete}/>
    <details className="explorer-info"><summary>About recorded values</summary>
      <p>MBTI groups are manually assigned writing-pattern labels. Each revision round counts as a review. Type and rework rates use the selected reviews and may add up to more than 100%.</p>
      <p>Revision Focus shows stored values. Older records without these fields may have been filled with “none”. These counts describe past work; they do not establish which action was effective or predict the next review’s time.</p>
    </details>
  </section>
}
