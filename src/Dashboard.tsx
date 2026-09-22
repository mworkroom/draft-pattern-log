import { useMemo, useState } from 'react'
import {
  ArrowRight, BookOpenCheck, ChartNoAxesColumnIncreasing, Clock3, FileText, ListFilter,
  Pencil, Search, Trash2, Wrench,
} from 'lucide-react'
import {
  averageStructure, EMPTY_FILTERS, filterReviews, formatMedian, groupLanguage, medianTime,
  percentWithCount, reworkCounts, reworkMedian, scoreMedian, sortRecent, type Filters,
  typeCounts,
} from './analytics'
import {
  LANGUAGES, LEVELS, REWORK_LABELS, STRUCTURE_KEYS, STRUCTURE_LABELS, TIERS,
  TYPE_KEYS, TYPE_LABELS, type ReviewRecordV1,
} from './model'

type Tab = 'comparison' | 'structure' | 'patterns'

interface Props {
  records: ReviewRecordV1[]
  onEdit: (record: ReviewRecordV1) => void
  onDelete: (record: ReviewRecordV1) => void
}

function SelectFilter({ label, value, options, onChange }: {
  label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void
}) {
  return <label className="filter-select"><span>{label}</span><select aria-label={label} value={value} onChange={event => onChange(event.target.value)}>
    <option value="">All</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
  </select></label>
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

export default function Dashboard({ records, onEdit, onDelete }: Props) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [tab, setTab] = useState<Tab>('comparison')
  const [showAll, setShowAll] = useState(false)
  const [search, setSearch] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const updateFilter = (key: keyof Filters, value: string) => setFilters(current => ({ ...current, [key]: value }))

  const filtered = useMemo(() => filterReviews(records, filters), [records, filters])
  const korean = useMemo(() => groupLanguage(filtered, 'Korean'), [filtered])
  const english = useMemo(() => groupLanguage(filtered, 'English'), [filtered])
  const fields = useMemo(() => [...new Set(records.map(record => record.field.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [records])
  const tableRows = useMemo(() => sortRecent(filtered).filter(record =>
    record.studentName.toLocaleLowerCase().includes(search.toLocaleLowerCase()) ||
    record.field.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  ), [filtered, search])
  const visibleRows = showAll ? tableRows : tableRows.slice(0, 5)
  const activeFilters = Object.values(filters).filter(Boolean).length
  const noData = filtered.length === 0
  const structureMedian = scoreMedian(filtered)
  const medianRework = reworkMedian(filtered)
  const academicKr = percentWithCount(korean, 'rebuildAcademicPlan')
  const academicEn = percentWithCount(english, 'rebuildAcademicPlan')
  const conclusionKr = percentWithCount(korean, 'rebuildConclusion')
  const conclusionEn = percentWithCount(english, 'rebuildConclusion')
  const topIssues = reworkCounts(filtered).filter(issue => issue.count > 0).slice(0, 4)
  const unclassified = sortRecent(filtered.filter(record => record.problemTypes.includes('unclassified')))

  return <section className="dashboard-panel" aria-label="Dashboard">
    <div className="dashboard-scroll">
      <div className="dashboard-intro">
        <div><h2>Dashboard</h2><p>Key metrics and comparisons</p></div>
        <button className={'filter-button ' + (showFilters || activeFilters ? 'active' : '')} type="button" onClick={() => setShowFilters(!showFilters)}><ListFilter size={16} /> Filters {activeFilters ? <b>{activeFilters}</b> : null}</button>
      </div>
      {showFilters ? <div className="filters-panel">
        <div className="filter-top"><strong>Filter reviews</strong><button type="button" className="text-button" onClick={() => setFilters(EMPTY_FILTERS)}>Clear all</button></div>
        <div className="filter-grid">
          <label className="filter-select"><span>From</span><input aria-label="From date" type="date" value={filters.from} onChange={event => updateFilter('from', event.target.value)} /></label>
          <label className="filter-select"><span>To</span><input aria-label="To date" type="date" value={filters.to} onChange={event => updateFilter('to', event.target.value)} /></label>
          <SelectFilter label="Language" value={filters.language} onChange={value => updateFilter('language', value)} options={LANGUAGES.map(value => ({ value, label: value }))} />
          <SelectFilter label="Level" value={filters.level} onChange={value => updateFilter('level', value)} options={[...LEVELS.map(value => ({ value, label: value })), { value: '__missing', label: 'Not specified' }]} />
          <SelectFilter label="Field" value={filters.field} onChange={value => updateFilter('field', value)} options={[...fields.map(value => ({ value, label: value })), { value: '__missing', label: 'Not specified' }]} />
          <SelectFilter label="School Tier" value={filters.tier} onChange={value => updateFilter('tier', value)} options={[...TIERS.map(value => ({ value, label: value })), { value: '__missing', label: 'Not specified' }]} />
          <SelectFilter label="Problem Type" value={filters.type} onChange={value => updateFilter('type', value)} options={TYPE_KEYS.map(value => ({ value, label: TYPE_LABELS[value] }))} />
        </div>
      </div> : null}

      <div className="kpi-grid">
        <Kpi icon={<FileText size={18}/>} label="Total Reviews" value={String(filtered.length)} foot="in selected range" tone="tone-blue" />
        <Kpi icon={<BookOpenCheck size={18}/>} label="Korean Reviews" value={String(korean.length)} foot={filtered.length ? Math.round(korean.length / filtered.length * 100) + '% of total' : 'No data'} tone="tone-red" />
        <Kpi icon={<BookOpenCheck size={18}/>} label="English Reviews" value={String(english.length)} foot={filtered.length ? Math.round(english.length / filtered.length * 100) + '% of total' : 'No data'} tone="tone-sky" />
        <Kpi icon={<ChartNoAxesColumnIncreasing size={18}/>} label="Median Structure" value={structureMedian === null ? '—' : formatMedian(structureMedian) + ' / 16'} foot="out of 16" tone="tone-green" />
        <Kpi icon={<Wrench size={18}/>} label="Median Rework" value={medianRework === null ? '—' : formatMedian(medianRework) + ' / 7'} foot="out of 7" tone="tone-purple" />
        <Kpi icon={<Clock3 size={18}/>} label="Median Time" value={medianTime(filtered)} foot="selected time band" tone="tone-amber" />
      </div>

      <div className="analysis-head">
        <div><h3>Review Analysis</h3><p>Patterns across the selected reviews</p></div>
        <div className="language-key"><span><i className="key-blue"/>Korean</span><span><i className="key-purple"/>English</span></div>
      </div>
      <div className="tab-row" role="tablist" aria-label="Analysis">
        <button role="tab" aria-selected={tab === 'comparison'} className={tab === 'comparison' ? 'active' : ''} onClick={() => setTab('comparison')}>Language comparison</button>
        <button role="tab" aria-selected={tab === 'structure'} className={tab === 'structure' ? 'active' : ''} onClick={() => setTab('structure')}>Structure details</button>
        <button role="tab" aria-selected={tab === 'patterns'} className={tab === 'patterns' ? 'active' : ''} onClick={() => setTab('patterns')}>Problem patterns</button>
      </div>
      {tab === 'comparison' ? <div className="comparison-grid">
        <PairBars title="Structure Score (out of 16)" korean={scoreMedian(korean)} english={scoreMedian(english)} max={16} note={'n=' + korean.length + ' / n=' + english.length} />
        <PairBars title="Rework Count (out of 7)" korean={reworkMedian(korean)} english={reworkMedian(english)} max={7} note={'n=' + korean.length + ' / n=' + english.length} />
        <PairBars title="Academic Plan Rebuild Rate" korean={korean.length ? academicKr.percent : null} english={english.length ? academicEn.percent : null} max={100} suffix="%" note={academicKr.count + '/' + academicKr.total + ' · ' + academicEn.count + '/' + academicEn.total} />
        <PairBars title="Conclusion Rebuild Rate" korean={korean.length ? conclusionKr.percent : null} english={english.length ? conclusionEn.percent : null} max={100} suffix="%" note={conclusionKr.count + '/' + conclusionKr.total + ' · ' + conclusionEn.count + '/' + conclusionEn.total} />
      </div> : null}
      {tab === 'structure' ? <div className="detail-table-wrap"><table className="detail-table"><thead><tr><th>Structure item</th><th>Korean avg. <small>n={korean.length}</small></th><th>English avg. <small>n={english.length}</small></th></tr></thead><tbody>
        {STRUCTURE_KEYS.map(key => <tr key={key}><td title={STRUCTURE_LABELS[key].help}>{STRUCTURE_LABELS[key].label}</td><td><span className="dot blue-dot"/> {averageStructure(korean, key)}</td><td><span className="dot purple-dot"/> {averageStructure(english, key)}</td></tr>)}
      </tbody></table><p className="table-footnote">Average score per item · 0 to 2</p></div> : null}
      {tab === 'patterns' ? <div className="pattern-grid">
        <div className="analysis-card"><div className="card-head"><h4>Problem Type Distribution</h4><span>Multiple types per review</span></div>{typeCounts(filtered).map(({ key, count }) => <div className="progress-row" key={key}><span title={TYPE_LABELS[key]}>{TYPE_LABELS[key]}</span><div className="progress-track"><i style={{ width: filtered.length ? count / filtered.length * 100 + '%' : '0%' }}/></div><strong>{count}</strong></div>)}</div>
        <div className="analysis-card"><div className="card-head"><h4>Major Rework Trends</h4><span>Changes made in review</span></div>{reworkCounts(filtered).map(({ key, count }) => <div className="progress-row" key={key}><span>{REWORK_LABELS[key]}</span><div className="progress-track violet"><i style={{ width: filtered.length ? count / filtered.length * 100 + '%' : '0%' }}/></div><strong>{count}</strong></div>)}</div>
        <div className="analysis-card unclassified-card"><div className="card-head"><h4>Unclassified / New Pattern</h4><strong>{unclassified.length} <small>of {filtered.length} ({filtered.length ? Math.round(unclassified.length / filtered.length * 100) : 0}%)</small></strong></div>
          {unclassified.length ? unclassified.slice(0, 5).map(record => <button className="pattern-record" type="button" key={record.id} onClick={() => onEdit(record)}><span><strong>{record.studentName}</strong><small>{record.reviewDate}</small></span><span>{record.unclassifiedNote}</span><ArrowRight size={15}/></button>) : <p className="empty-pattern">No new patterns in this range.</p>}
        </div>
      </div> : null}

      <div className="recent-head"><div><h3>Recent Reviews</h3><p>{filtered.length} {filtered.length === 1 ? 'review' : 'reviews'} in current filters</p></div><div className="recent-actions"><label className="table-search"><Search size={15}/><input aria-label="Search recent reviews" placeholder="Search name or field" value={search} onChange={event => setSearch(event.target.value)} /></label><button type="button" className="text-button" onClick={() => setShowAll(value => !value)}>{showAll ? 'Show fewer' : 'View all reviews'} <ArrowRight size={15}/></button></div></div>
      <div className="table-wrap"><table className="reviews-table"><thead><tr><th>Date</th><th>Student</th><th>Lang</th><th>Level</th><th>Field</th><th>Structure</th><th>Rework</th><th>Type</th><th>Time</th><th aria-label="Actions"/></tr></thead><tbody>
        {visibleRows.map(record => <tr key={record.id}><td>{record.reviewDate}</td><td><button className="student-link" type="button" onClick={() => onEdit(record)}>{record.studentName}</button></td><td><span className={'language-pill ' + (record.draftLanguage === 'Korean' ? 'korean' : 'english')}>{record.draftLanguage}</span></td><td>{record.level ?? '—'}</td><td>{record.field || '—'}</td><td>{STRUCTURE_KEYS.reduce((sum, key) => sum + record.structure[key], 0)} / 16</td><td>{record.rework.length} / 7</td><td className="type-cell">{record.problemTypes.length ? record.problemTypes.map(key => key === 'unclassified' ? 'New' : key.replace('type', 'T')).join(', ') : '—'}</td><td>{record.timeSpent}</td><td><div className="row-actions"><button type="button" aria-label={'Edit ' + record.studentName} onClick={() => onEdit(record)}><Pencil size={14}/></button><button type="button" aria-label={'Delete ' + record.studentName} onClick={() => onDelete(record)}><Trash2 size={14}/></button></div></td></tr>)}
        {visibleRows.length === 0 ? <tr><td className="empty-table" colSpan={10}>{noData && records.length === 0 ? 'No reviews yet. Save the first review to start tracking.' : 'No reviews match the current filters or search.'}</td></tr> : null}
      </tbody></table></div>
      {topIssues.length ? <div className="issue-strip"><div className="issue-icon">✦</div><div><strong>Top issue trends</strong><small>Most common rework in selected reviews</small></div><div className="issue-tags">{topIssues.map(issue => <span key={issue.key}>{REWORK_LABELS[issue.key]} <b>{issue.count}</b></span>)}</div></div> : null}
    </div>
  </section>
}
