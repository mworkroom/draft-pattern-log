import { useMemo, useState } from 'react'
import PatternExplorer from './PatternExplorer'
import ReviewTable from './ReviewTable'
import {
  ArrowRight, BookOpenCheck, ChartNoAxesColumnIncreasing, Clock3, FileText, ListFilter,
  Wrench,
} from 'lucide-react'
import {
  averageStructure, EMPTY_FILTERS, filterReviews, formatMedian, groupLanguage, medianTime,
  reworkCounts, reworkMedian, revisionFocusCounts, revisionRebuildPercent, scoreMedian, sortRecent, type Filters,
  typeCounts,
} from './analytics'
import {
  CAREER_STAGE_OPTIONS, SECTOR_OPTIONS, LANGUAGES, LEVELS, REWORK_KEYS, REWORK_LABELS, REVISION_LABELS, REVISION_LEVELS, REVISION_ROUNDS, STRUCTURE_KEYS, STRUCTURE_LABELS, TIERS,
  TYPE_KEYS, TYPE_LABELS, MBTI_OPTIONS, type ReviewRecordV1,
} from './model'

type Tab = 'structure' | 'patterns' | 'comparison'
export type DashboardView = 'overview' | 'explorer' | 'statistics'

interface Props {
  records: ReviewRecordV1[]
  view: DashboardView
  selectedId: string | null
  onSelect: (record: ReviewRecordV1) => void
  onGoToInput: () => void
  onEdit: (record: ReviewRecordV1) => void
  onDelete: (record: ReviewRecordV1) => void
}

function SelectFilter({ label, value, options, onChange, allLabel = 'All' }: {
  label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void; allLabel?: string
}) {
  return <label className="filter-select"><span>{label}</span><select aria-label={label} value={value} onChange={event => onChange(event.target.value)}>
    <option value="">{allLabel}</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
  </select></label>
}

function RevisionRoundBadge({ round }: { round: ReviewRecordV1['revisionRound'] }) {
  return round === 1 ? null : <span className="revision-round-badge" title={'Revision Round ' + round}>{round}차</span>
}

function Kpi({ icon, label, value, foot, tone }: {
  icon: React.ReactNode; label: string; value: string; foot: string; tone: string
}) {
  return <div className={'kpi-card ' + tone}><div className="kpi-icon">{icon}</div><span className="kpi-label">{label}</span><strong>{value}</strong><small>{foot}</small></div>
}

function PairBars({ title, korean, english, max, suffix = '', note }: {
  title: string; korean: number | null; english: number | null; max: number; suffix?: string; note?: string
}) {
  const display = (value: number | null) => value === null ? '—' : Number.isInteger(value) ? String(value) + suffix : value.toFixed(1) + suffix
  return <div className="chart-card"><div className="chart-title">{title}</div>
    <div className="bars">
      <div className="bar-column"><strong>{display(korean)}</strong><div className="bar-track"><div className="bar blue" style={{ height: korean === null || korean === 0 ? 0 : Math.max(5, korean / max * 100) + '%' }} /></div><span>Korean</span></div>
      <div className="bar-column"><strong>{display(english)}</strong><div className="bar-track"><div className="bar purple" style={{ height: english === null || english === 0 ? 0 : Math.max(5, english / max * 100) + '%' }} /></div><span>English</span></div>
    </div>
    {note ? <div className="chart-note">{note}</div> : null}
  </div>
}

export default function Dashboard({ records, view, selectedId, onSelect, onGoToInput, onEdit, onDelete }: Props) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [tab, setTab] = useState<Tab>('structure')
  const [showFilters, setShowFilters] = useState(false)
  const updateFilter = (key: keyof Filters, value: string) => setFilters(current => ({ ...current, [key]: value }))
  const filtered = useMemo(() => filterReviews(records, filters), [records, filters])
  const korean = useMemo(() => groupLanguage(filtered, 'Korean'), [filtered])
  const english = useMemo(() => groupLanguage(filtered, 'English'), [filtered])
  const fields = useMemo(() => [...new Set(records.map(record => record.field.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [records])
  const activeFilters = Object.values(filters).filter(Boolean).length
  const structureMedian = scoreMedian(filtered)
  const medianRework = reworkMedian(filtered)
  const academicKr = revisionRebuildPercent(korean, 'revision_academic_plan')
  const academicEn = revisionRebuildPercent(english, 'revision_academic_plan')
  const conclusionKr = revisionRebuildPercent(korean, 'revision_conclusion')
  const conclusionEn = revisionRebuildPercent(english, 'revision_conclusion')
  const topIssues = reworkCounts(filtered).filter(issue => issue.count > 0).slice(0, 4)
  const unclassified = sortRecent(filtered.filter(record => record.problemTypes.includes('unclassified')))
  const filterButton = <button className={'filter-button ' + (showFilters || activeFilters ? 'active' : '')} type="button" onClick={() => setShowFilters(value => !value)}><ListFilter size={16}/> Filters {activeFilters ? <b>{activeFilters}</b> : null}</button>
  const filterPanel = (
showFilters ? <div className="filters-panel">
        <div className="filter-top"><strong>Filter reviews</strong><button type="button" className="text-button" onClick={() => setFilters(EMPTY_FILTERS)}>Clear all</button></div>
        <div className="filter-grid">
          <label className="filter-select"><span>From</span><input aria-label="From date" type="date" value={filters.from} onChange={event => updateFilter('from', event.target.value)} /></label>
          <label className="filter-select"><span>To</span><input aria-label="To date" type="date" value={filters.to} onChange={event => updateFilter('to', event.target.value)} /></label>
          <SelectFilter label="Language" value={filters.language} onChange={value => updateFilter('language', value)} options={LANGUAGES.map(value => ({ value, label: value }))} />
          <SelectFilter label="Level" value={filters.level} onChange={value => updateFilter('level', value)} options={[...LEVELS.map(value => ({ value, label: value })), { value: '__missing', label: 'Not specified' }]} />
          <SelectFilter label="Field" value={filters.field} onChange={value => updateFilter('field', value)} options={[...fields.map(value => ({ value, label: value })), { value: '__missing', label: 'Not specified' }]} />
          <SelectFilter label="Career Stage" value={filters.careerStage} onChange={value => updateFilter('careerStage', value)} options={[{ value: '__missing', label: 'Not specified' }, ...CAREER_STAGE_OPTIONS.map(value => ({ value, label: value }))]} />
          <SelectFilter label="Sector" value={filters.sector} onChange={value => updateFilter('sector', value)} options={[{ value: '__missing', label: 'Not specified' }, ...SECTOR_OPTIONS.map(value => ({ value, label: value }))]} />
          <SelectFilter label="School Tier" value={filters.tier} onChange={value => updateFilter('tier', value)} options={[...TIERS.map(value => ({ value, label: value })), { value: '__missing', label: 'Not specified' }]} />
          <SelectFilter label="Revision Round" value={filters.revisionRound} onChange={value => updateFilter('revisionRound', value)} options={REVISION_ROUNDS.map(value => ({ value: String(value), label: String(value) }))} />
          <SelectFilter label="MBTI" value={filters.mbti} onChange={value => updateFilter('mbti', value)} options={[...MBTI_OPTIONS.map(value => ({ value, label: value })), { value: '__missing', label: 'Not specified' }]} />
          <SelectFilter label="Problem Type" value={filters.type} onChange={value => updateFilter('type', value)} options={TYPE_KEYS.map(value => ({ value, label: TYPE_LABELS[value] }))} />
        </div>
      </div> : null
  )
  return <section className="dashboard-panel" aria-label="Dashboard">
    <div className="dashboard-scroll dashboard-workspace">
      <section className="dashboard-view overview-view" hidden={view !== 'overview'} aria-label="Review Overview">
        <div className="dashboard-intro"><div><h2>Review Statistics</h2></div><div className="view-tools"><button type="button" className="text-button explorer-form-link" onClick={onGoToInput}>Go to input ↓</button>{filterButton}</div></div>
        {view === 'overview' ? filterPanel : null}
      <div className="kpi-grid">
        <Kpi icon={<FileText size={18}/>} label="Total Reviews" value={String(filtered.length)} foot="in selected range" tone="tone-blue" />
        <Kpi icon={<BookOpenCheck size={18}/>} label="Korean Reviews" value={String(korean.length)} foot={filtered.length ? Math.round(korean.length / filtered.length * 100) + '% of total' : 'No data'} tone="tone-red" />
        <Kpi icon={<BookOpenCheck size={18}/>} label="English Reviews" value={String(english.length)} foot={filtered.length ? Math.round(english.length / filtered.length * 100) + '% of total' : 'No data'} tone="tone-sky" />
        <Kpi icon={<ChartNoAxesColumnIncreasing size={18}/>} label="Median Structure" value={structureMedian === null ? '—' : formatMedian(structureMedian) + ' / 16'} foot="out of 16" tone="tone-green" />
        <Kpi icon={<Wrench size={18}/>} label="Median Rework" value={medianRework === null ? '—' : formatMedian(medianRework) + ' / ' + REWORK_KEYS.length} foot={'out of ' + REWORK_KEYS.length} tone="tone-purple" />
        <Kpi icon={<Clock3 size={18}/>} label="Median Time" value={medianTime(filtered)} foot="selected time band" tone="tone-amber" />
      </div>

        {topIssues.length ? <div className="issue-strip"><div><strong>Frequent Rework</strong><small>Most common rework in selected reviews</small></div><div className="issue-tags">{topIssues.map(issue => <span key={issue.key}>{REWORK_LABELS[issue.key]} <b>{issue.count}</b></span>)}</div></div> : null}
        <ReviewTable records={filtered} title="Recent Reviews" overview selectedId={selectedId} onSelect={onSelect} onEdit={onEdit} onDelete={onDelete} toolbar={<>
          <SelectFilter label="Problem Type" allLabel="All types" value={filters.type} onChange={value => updateFilter('type', value)} options={TYPE_KEYS.map(value => ({ value, label: TYPE_LABELS[value] }))}/>
          <div className="recent-mbti-filter"><SelectFilter label="MBTI" allLabel="All groups" value={filters.mbti} onChange={value => updateFilter('mbti', value)} options={[...MBTI_OPTIONS.map(value => ({ value, label: value })), { value: '__missing', label: 'Not specified' }]}/></div>
        </>}/>
      </section>
      <div className="dashboard-view explorer-view" hidden={view !== 'explorer'}>
        <PatternExplorer records={records} selectedId={selectedId} onSelect={onSelect} onGoToInput={onGoToInput} onEdit={onEdit} onDelete={onDelete}/>
      </div>
      <section className="dashboard-view statistics-view" hidden={view !== 'statistics'} aria-label="Statistics">
        <div className="dashboard-intro"><div><h2>Review Analysis</h2></div>{filterButton}</div>
        {view === 'statistics' ? filterPanel : null}
      <div className="analysis-head"><p>{filtered.length} {filtered.length === 1 ? 'review' : 'reviews'} in current filters</p><div className="language-key"><span><i className="key-blue"/>Korean</span><span><i className="key-purple"/>English</span></div></div>
      <div className="tab-row" role="tablist" aria-label="Analysis">
        <button role="tab" aria-selected={tab === 'structure'} className={tab === 'structure' ? 'active' : ''} onClick={() => setTab('structure')}>Structure details</button>
        <button role="tab" aria-selected={tab === 'patterns'} className={tab === 'patterns' ? 'active' : ''} onClick={() => setTab('patterns')}>Problem patterns</button>
        <button role="tab" aria-selected={tab === 'comparison'} className={tab === 'comparison' ? 'active' : ''} onClick={() => setTab('comparison')}>Language comparison</button>
      </div>
      {tab === 'comparison' ? <div className="comparison-grid">
        <PairBars title="Structure Score (out of 16)" korean={scoreMedian(korean)} english={scoreMedian(english)} max={16} note={'n=' + korean.length + ' / n=' + english.length} />
        <PairBars title={'Rework Count (out of ' + REWORK_KEYS.length + ')'} korean={reworkMedian(korean)} english={reworkMedian(english)} max={REWORK_KEYS.length} note={'n=' + korean.length + ' / n=' + english.length} />
        <PairBars title="Academic Plan Rebuild Rate" korean={korean.length ? academicKr.percent : null} english={english.length ? academicEn.percent : null} max={100} suffix="%" note={academicKr.count + '/' + academicKr.total + ' · ' + academicEn.count + '/' + academicEn.total} />
        <PairBars title="Conclusion Rebuild Rate" korean={korean.length ? conclusionKr.percent : null} english={english.length ? conclusionEn.percent : null} max={100} suffix="%" note={conclusionKr.count + '/' + conclusionKr.total + ' · ' + conclusionEn.count + '/' + conclusionEn.total} />
      </div> : null}
      {tab === 'structure' ? <div className="detail-table-wrap"><table className="detail-table"><thead><tr><th>Structure item</th><th>Korean avg. <small>n={korean.length}</small></th><th>English avg. <small>n={english.length}</small></th></tr></thead><tbody>
        {STRUCTURE_KEYS.map(key => <tr key={key}><td title={STRUCTURE_LABELS[key].help}>{STRUCTURE_LABELS[key].label}</td><td><span className="dot blue-dot"/> {averageStructure(korean, key)}</td><td><span className="dot purple-dot"/> {averageStructure(english, key)}</td></tr>)}
      </tbody></table><p className="table-footnote">Average score per item · 0 to 2</p></div> : null}
      {tab === 'patterns' ? <div className="pattern-grid">
        <div className="analysis-card"><div className="card-head"><h4>Problem Type Distribution</h4><span>Multiple types per review</span></div>{typeCounts(filtered).map(({ key, count }) => <div className="progress-row" key={key}><span title={TYPE_LABELS[key]}>{TYPE_LABELS[key]}</span><div className="progress-track"><i style={{ width: filtered.length ? count / filtered.length * 100 + '%' : '0%' }}/></div><strong>{count}</strong></div>)}</div>
        <div className="analysis-card"><div className="card-head"><h4>Major Rework Trends</h4><span>Changes made in review</span></div>{reworkCounts(filtered).map(({ key, count }) => <div className="progress-row" key={key}><span>{REWORK_LABELS[key]}</span><div className="progress-track violet"><i style={{ width: filtered.length ? count / filtered.length * 100 + '%' : '0%' }}/></div><strong>{count}</strong></div>)}</div>
        <div className="analysis-card revision-card">
          <div className="card-head"><h4>Revision Focus</h4><span>{filtered.length ? `${filtered.length} reviews in current filters` : 'No data in current filters'}</span></div>
          <div className="revision-stats-wrap"><table className="revision-stats-table">
            <thead><tr><th scope="col">Area</th>{REVISION_LEVELS.map(level => <th scope="col" key={level}>{level[0].toUpperCase() + level.slice(1)}</th>)}</tr></thead>
            <tbody>{revisionFocusCounts(filtered).map(({ key, levels }) => <tr key={key}>
              <th scope="row">{REVISION_LABELS[key]}</th>
              {levels.map(({ level, count, percent }) => <td key={level}>{filtered.length ? `${count} (${percent}%)` : '—'}</td>)}
            </tr>)}</tbody>
          </table></div>
        </div>
        <div className="analysis-card unclassified-card"><div className="card-head"><h4>Unclassified / New Pattern</h4><strong>{unclassified.length} <small>of {filtered.length} ({filtered.length ? Math.round(unclassified.length / filtered.length * 100) : 0}%)</small></strong></div>
          {unclassified.length ? unclassified.slice(0, 5).map(record => <button className="pattern-record" type="button" key={record.id} onClick={() => onSelect(record)}><span><strong>{record.studentName} <RevisionRoundBadge round={record.revisionRound} /></strong><small>{record.reviewDate}</small></span><span>{record.unclassifiedNote}</span><ArrowRight size={15}/></button>) : <p className="empty-pattern">No new patterns in this range.</p>}
        </div>
      </div> : null}

      </section>
    </div>
  </section>
}
