import { useRef, type ReactNode } from 'react'
import { CircleHelp, RotateCcw } from 'lucide-react'
import {
  AI_USAGE, ENGLISH_QUALITY, FIELD_OPTIONS, LANGUAGES, LEVELS, REWORK_KEYS, REWORK_LABELS,
  REVISION_HELP, REVISION_KEYS, REVISION_LABELS, REVISION_LEVELS,
  STRUCTURE_KEYS, STRUCTURE_LABELS, TIERS, TIME_OPTIONS, TYPE_HELP, TYPE_KEYS, TYPE_LABELS,
  structureTotal, type ReviewDraft, type ReviewRecordV1, type ReworkKey, type StructureKey, type TypeKey,
} from './model'

interface Props {
  draft: ReviewDraft
  onChange: (draft: ReviewDraft) => void
  onSave: () => void
  onCancelEdit: () => void
  editing: ReviewRecordV1 | null
  error: string
}

function SectionHeading({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return <div className="section-heading"><h3>{children}</h3><span>{aside}</span></div>
}

function Segmented<T extends string>({ options, value, onChange, label }: {
  options: readonly T[]; value: T | null; onChange: (value: T) => void; label: string
}) {
  return <div className="segmented" role="group" aria-label={label}>
    {options.map(option => <button type="button" key={option} className={value === option ? 'selected' : ''} aria-pressed={value === option} onClick={() => onChange(option)}>{option}</button>)}
  </div>
}

export default function ReviewForm({ draft, onChange, onSave, onCancelEdit, editing, error }: Props) {
  const nameRef = useRef<HTMLInputElement>(null)
  const hasLegacyField = draft.field !== '' && !FIELD_OPTIONS.some(option => option === draft.field)
  const update = <K extends keyof ReviewDraft>(key: K, value: ReviewDraft[K]) => onChange({ ...draft, [key]: value })
  const toggleRework = (key: ReworkKey) => update('rework', draft.rework.includes(key) ? draft.rework.filter(item => item !== key) : [...draft.rework, key])
  const toggleType = (key: TypeKey) => {
    let next = draft.problemTypes.includes(key)
      ? draft.problemTypes.filter(item => item !== key)
      : [...draft.problemTypes, key]
    if (key === 'type1' && next.includes('type1')) next = next.filter(item => item !== 'type2')
    if (key === 'type2' && next.includes('type2')) next = next.filter(item => item !== 'type1')
    onChange({ ...draft, problemTypes: next, unclassifiedNote: next.includes('unclassified') ? draft.unclassifiedNote : '' })
  }
  const selectedTypes = draft.problemTypes.length
    ? draft.problemTypes.map(key => key === 'unclassified' ? 'New Pattern' : key.replace('type', 'Type ')).join(', ')
    : 'None'

  return <section className="form-panel" aria-label="Review editor">
    <div className="form-scroll">
      <div className="panel-intro">
        <div><h2>{editing ? 'Edit Review' : 'New Review'}</h2><p>{editing ? 'Update this SOP review record' : 'Enter a new SOP review record'}</p></div>
        {editing ? <button className="text-button" type="button" onClick={onCancelEdit}><RotateCcw size={15}/> Cancel</button> : null}
      </div>

      <div className="field-block">
        <label htmlFor="student-name">Student Name <span className="required">*</span></label>
        <input ref={nameRef} id="student-name" autoComplete="off" placeholder="Student name" value={draft.studentName} onChange={event => update('studentName', event.target.value)} />
      </div>

      <div className="form-grid two">
        <div className="field-block"><label>Draft Language <span className="required">*</span></label>
          <Segmented options={LANGUAGES} value={draft.draftLanguage} label="Draft Language" onChange={value => onChange({ ...draft, draftLanguage: value, surfaceEnglishQuality: value === 'Korean' ? null : draft.surfaceEnglishQuality })} />
        </div>
        <div className="field-block"><label>Level</label><Segmented options={LEVELS} value={draft.level} label="Level" onChange={value => update('level', value)} /></div>
      </div>

      <div className="form-grid two">
        <div className="field-block"><label htmlFor="field">Field</label><select id="field" value={draft.field} onChange={event => update('field', event.target.value)}>
          <option value="">Select a field</option>
          {hasLegacyField ? <option value={draft.field}>Existing: {draft.field}</option> : null}
          {FIELD_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
        </select></div>
        <div className="field-block"><label>School Tier</label><Segmented options={TIERS} value={draft.schoolTier} label="School Tier" onChange={value => update('schoolTier', value)} /></div>
      </div>

      <div className="form-grid three">
        <div className="field-block"><label htmlFor="word-limit">Word Limit</label><input id="word-limit" type="number" inputMode="numeric" min="0" max="100000" placeholder="e.g. 800" value={draft.wordLimit} onChange={event => update('wordLimit', event.target.value)} /></div>
        <div className="field-block"><label htmlFor="draft-length">Draft Length</label><input id="draft-length" type="number" inputMode="numeric" min="0" max="100000" placeholder="e.g. 950" value={draft.draftLength} onChange={event => update('draftLength', event.target.value)} /></div>
        <div className="field-block"><label>AI Usage</label><Segmented options={AI_USAGE} value={draft.aiUsage} label="AI Usage" onChange={value => update('aiUsage', value)} /></div>
      </div>

      <div className="form-divider" />
      <SectionHeading aside={'Total: ' + structureTotal(draft.structure) + ' / 16'}>Structure Score <small>(0 / 1 / 2)</small></SectionHeading>
      <p className="section-hint">0 없음·심각한 문제 · 1 상당한 수정 필요 · 2 큰 구조 수정 불필요</p>
      <div className="form-grid score-work">
        <div className="score-list">
          {STRUCTURE_KEYS.map((key, index) => <div className="score-row" key={key}>
            <span className="score-number">{index + 1}.</span>
            <label title={STRUCTURE_LABELS[key].help}>{STRUCTURE_LABELS[key].label}<CircleHelp size={13} aria-label={STRUCTURE_LABELS[key].help} /></label>
            <div className="score-choices" role="group" aria-label={STRUCTURE_LABELS[key].label}>
              {([0, 1, 2] as const).map(score => <button key={score} type="button" className={draft.structure[key] === score ? 'selected' : ''} aria-pressed={draft.structure[key] === score} onClick={() => update('structure', { ...draft.structure, [key as StructureKey]: score })}>{score}</button>)}
            </div>
          </div>)}
        </div>
        <div className="choice-box">
          <h4>Major Rework <span>(select all that apply)</span></h4>
          <div className="check-list">{REWORK_KEYS.map(key => <label key={key} className="check-row"><input type="checkbox" checked={draft.rework.includes(key)} onChange={() => toggleRework(key)} /><span>{REWORK_LABELS[key]}</span></label>)}</div>
        </div>
      </div>

      <div className="form-divider" />
      <SectionHeading aside={draft.problemTypes.length + ' selected'}>Problem Types</SectionHeading>
      <div className="type-grid">{TYPE_KEYS.map(key => <label key={key} className={'type-choice ' + (draft.problemTypes.includes(key) ? 'checked' : '')} title={TYPE_HELP[key]}>
        <input type="checkbox" checked={draft.problemTypes.includes(key)} onChange={() => toggleType(key)} />
        <span><strong>{TYPE_LABELS[key]}</strong><small>{TYPE_HELP[key]}</small></span>
      </label>)}</div>
      {draft.problemTypes.includes('unclassified') ? <div className="field-block pattern-note"><label htmlFor="pattern-note">New Pattern Note <span className="required">*</span></label><input id="pattern-note" placeholder="기존 유형으로 설명되지 않는 패턴을 적어주세요" value={draft.unclassifiedNote} onChange={event => update('unclassifiedNote', event.target.value)} /></div> : null}

      <div className="form-divider" />
      <SectionHeading>Revision Focus</SectionHeading>
      <p className="section-hint">각 영역을 실제로 얼마나 수정했는지 기록합니다.</p>
      <div className="revision-table-wrap"><table className="revision-table">
        <thead><tr><th scope="col">Area</th>{REVISION_LEVELS.map(level => <th scope="col" key={level}>{level[0].toUpperCase() + level.slice(1)}</th>)}</tr></thead>
        <tbody>{REVISION_KEYS.map(key => <tr key={key}>
          <th scope="row">{REVISION_LABELS[key]}</th>
          {REVISION_LEVELS.map(level => <td key={level}>
            <label title={REVISION_HELP[key][level]}>
              <input type="radio" name={key} value={level} checked={draft[key] === level} aria-label={`${REVISION_LABELS[key]}: ${level}`} onChange={() => update(key, level)} />
            </label>
          </td>)}
        </tr>)}</tbody>
      </table></div>

      <div className="form-divider" />
      <div className="form-grid two">
        <div className="field-block"><label>Time Spent <span className="required">*</span></label><Segmented options={TIME_OPTIONS} value={draft.timeSpent} label="Time Spent" onChange={value => update('timeSpent', value)} /></div>
        <div className="field-block"><label>Surface English Quality</label>{draft.draftLanguage === 'English'
          ? <Segmented options={ENGLISH_QUALITY} value={draft.surfaceEnglishQuality} label="Surface English Quality" onChange={value => update('surfaceEnglishQuality', value)} />
          : <div className="disabled-field">English drafts only</div>}</div>
      </div>
      <div className="form-grid two notes-date">
        <div className="field-block"><label htmlFor="review-date">Review Date <span className="required">*</span></label><input id="review-date" type="date" value={draft.reviewDate} onChange={event => update('reviewDate', event.target.value)} /></div>
        <div className="field-block"><label htmlFor="short-notes">Short Notes</label><textarea id="short-notes" placeholder="e.g. Clear language, but the academic plan needs rebuilding." value={draft.notes} onChange={event => update('notes', event.target.value)} /></div>
      </div>
    </div>
    <div className="form-footer">
      {error ? <div className="form-error" role="alert">{error}</div> : null}
      <div className="footer-summary">
        <div className="summary-box blue"><span>Structure</span><strong>{structureTotal(draft.structure)} <small>/ 16</small></strong></div>
        <div className="summary-box red"><span>Rework</span><strong>{draft.rework.length} <small>/ 7</small></strong></div>
        <div className="summary-box violet"><span>Problem Types</span><strong title={selectedTypes}>{selectedTypes}</strong></div>
        <button className="primary-button" type="button" onClick={onSave}>{editing ? 'Update Review' : 'Save Review'}</button>
      </div>
    </div>
  </section>
}
