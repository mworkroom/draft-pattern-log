import { mbtiDistribution, narrativeSubtypeCounts, type explorePatterns } from './analytics'
import { REVISION_LABELS, type ReviewRecordV1 } from './model'

export function FrequencyBars({ items, total, showPercent }: {
  items: { key: string; label: string; count: number; percent: number }[]
  total: number
  showPercent: boolean
}) {
  return <div className="frequency-bars">{items.map(item => <div className="frequency-row" key={item.key}>
    <div className="frequency-label"><span>{item.label}</span><strong>{item.count}/{total}{showPercent ? ` (${item.percent}%)` : ''}</strong></div>
    <div className="frequency-track" role="progressbar" aria-label={item.label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={item.count}>
      <span style={{ width: `${total ? item.count / total * 100 : 0}%` }}/>
    </div>
  </div>)}</div>
}

export function RevisionBars({ stats, showPercent }: { stats: ReturnType<typeof explorePatterns>; showPercent: boolean }) {
  return <div className="revision-bars">{stats.revisionFocus.map(area => <div className="revision-bar-row" key={area.key}>
    <strong>{REVISION_LABELS[area.key]}</strong>
    <div className="revision-stack" role="img" aria-label={REVISION_LABELS[area.key] + ': ' + area.levels.map(item => `${item.level} ${item.count}`).join(', ')}>
      {area.levels.map(item => <span key={item.level} className={'revision-segment ' + item.level} style={{ width: `${stats.total ? item.count / stats.total * 100 : 0}%` }}/>) }
    </div>
    <div className="revision-legend">{area.levels.map(item => <span key={item.level}><i className={'legend-dot ' + item.level}/>{item.level}: {item.count}/{stats.total}{showPercent ? ` (${item.percent}%)` : ''}</span>)}</div>
  </div>)}</div>
}

export function MbtiBars({ stats }: { stats: ReturnType<typeof mbtiDistribution> }) {
  return <section className="explorer-chart mbti-distribution" aria-label="MBTI Distribution">
    <div className="card-head"><h4>MBTI Distribution</h4><span>{stats.classifiedCount} classified {stats.classifiedCount === 1 ? 'review' : 'reviews'}</span></div>
    <div className="mbti-bars">{stats.groups.map(item => <div className="mbti-stat" key={item.key}>
      <strong>{item.key}</strong><span>{item.count} {item.count === 1 ? 'review' : 'reviews'}</span><small>{Number(item.percent.toFixed(1))}%</small>
      <div className="frequency-track" role="progressbar" aria-label={item.key} aria-valuemin={0} aria-valuemax={stats.classifiedCount || 1} aria-valuenow={item.count}><span style={{ width: item.percent + '%' }}/></div>
    </div>)}</div>
    <p className="mbti-note">Each revision round counts as a review. Percentages exclude reviews with no MBTI classification.</p>
  </section>
}

export function NarrativeSubtypeBars({ records, showPercent = true }: { records: ReviewRecordV1[]; showPercent?: boolean }) {
  const stats = narrativeSubtypeCounts(records)
  return <section className="analysis-card" aria-label="Narrative / Indirect subtypes">
    <div className="card-head"><h4>Narrative / Indirect subtypes</h4><span>{stats.total} Type 4 reviews</span></div>
    {stats.total ? <FrequencyBars items={stats.items} total={stats.total} showPercent={showPercent} /> : <p className="table-footnote">No Type 4 reviews in current filters.</p>}
    <p className="table-footnote">Multiple subtypes per Type 4 review. Unspecified includes older records.</p>
  </section>
}
