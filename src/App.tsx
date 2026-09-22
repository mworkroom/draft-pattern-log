import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChartNoAxesCombined, ClipboardList, Download, FileJson, House, Save, ShieldCheck, Upload,
} from 'lucide-react'
import Dashboard from './Dashboard'
import ReviewForm from './ReviewForm'
import { blankDraft, recordToDraft, toRecord, validateDraft, type ReviewDraft, type ReviewRecordV1 } from './model'
import { backupJson, downloadText, exportCsv, lastBackupAt, localReviewRepository, markBackedUp, parseBackup } from './storage'

function readInitial(): { records: ReviewRecordV1[]; error: string } {
  try {
    return { records: localReviewRepository.load(), error: '' }
  } catch {
    return { records: [], error: '저장된 데이터가 손상되어 자동으로 열지 않았습니다. 유효한 JSON 백업을 복원해 주세요. 기존 데이터는 덮어쓰지 않았습니다.' }
  }
}

export default function App() {
  const [initial] = useState(readInitial)
  const [records, setRecords] = useState(initial.records)
  const [storageError, setStorageError] = useState(initial.error)
  const [draft, setDraft] = useState<ReviewDraft>(() => blankDraft())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')
  const [backupAt, setBackupAt] = useState(() => lastBackupAt())
  const importRef = useRef<HTMLInputElement>(null)
  const editing = records.find(record => record.id === editingId) ?? null
  const fieldSuggestions = useMemo(() => [...new Set(records.map(record => record.field.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [records])
  const needsBackup = records.length > 0 && (!backupAt || records.some(record => record.updatedAt > backupAt))

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 4500)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key?.startsWith('sop-score-tracker:')) {
        try {
          setRecords(localReviewRepository.load())
          setBackupAt(lastBackupAt())
          setStorageError('')
          setNotice('다른 탭에서 변경된 데이터를 다시 불러왔습니다.')
        } catch {
          setStorageError('다른 탭에서 저장된 데이터가 손상되었습니다. 복원하기 전까지 새 저장을 중단합니다.')
        }
      }
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])

  const persist = (next: ReviewRecordV1[]) => {
    try {
      localReviewRepository.save(next)
      setRecords(next)
      return true
    } catch {
      setFormError('브라우저 저장 공간에 기록하지 못했습니다. JSON 백업과 저장 공간을 확인해 주세요.')
      return false
    }
  }

  const saveReview = () => {
    if (storageError) {
      setFormError('저장 데이터 문제가 해결되기 전에는 새 기록을 저장할 수 없습니다.')
      return
    }
    const error = validateDraft(draft)
    if (error) {
      setFormError(error)
      return
    }
    const record = toRecord(draft, editing ?? undefined)
    const next = editing ? records.map(item => item.id === editing.id ? record : item) : [record, ...records]
    if (!persist(next)) return
    setDraft(blankDraft(draft.reviewDate))
    setEditingId(null)
    setFormError('')
    setNotice(editing ? 'Review updated.' : 'Review saved.')
  }

  const editReview = (record: ReviewRecordV1) => {
    setEditingId(record.id)
    setDraft(recordToDraft(record))
    setFormError('')
    document.querySelector('.form-scroll')?.scrollTo({ top: 0, behavior: 'smooth' })
    document.getElementById('student-name')?.focus()
  }

  const deleteReview = (record: ReviewRecordV1) => {
    if (storageError) return
    if (!window.confirm(record.studentName + '의 ' + record.reviewDate + ' Review를 삭제할까요? 이 작업은 되돌릴 수 없습니다.')) return
    if (!persist(records.filter(item => item.id !== record.id))) return
    if (editingId === record.id) {
      setEditingId(null)
      setDraft(blankDraft(draft.reviewDate))
    }
    setNotice('Review deleted.')
  }

  const exportBackup = () => {
    const content = backupJson(records)
    const exportedAt = JSON.parse(content).exportedAt as string
    downloadText('sop-score-tracker-backup-' + exportedAt.slice(0, 10) + '.json', content, 'application/json;charset=utf-8')
    markBackedUp(exportedAt)
    setBackupAt(exportedAt)
    setNotice('JSON backup downloaded.')
  }

  const exportSpreadsheet = () => {
    downloadText('sop-score-tracker-export-' + new Date().toISOString().slice(0, 10) + '.csv', exportCsv(records), 'text/csv;charset=utf-8')
    setNotice('CSV exported.')
  }

  const importBackup = async (file: File) => {
    try {
      const parsed = parseBackup(JSON.parse(await file.text()))
      const dates = parsed.records.map(record => record.reviewDate).sort()
      const range = dates.length ? '\n감수일: ' + dates[0] + ' ~ ' + dates[dates.length - 1] : ''
      const accepted = window.confirm(
        '이 백업으로 현재 ' + records.length + '건을 교체할까요?\n' +
        '백업 기록: ' + parsed.records.length + '건' + range +
        '\n확인하면 현재 기록의 복구용 JSON이 먼저 다운로드됩니다.',
      )
      if (!accepted) return
      if (records.length) downloadText('sop-score-tracker-before-restore-' + new Date().toISOString().replaceAll(':', '-') + '.json', backupJson(records), 'application/json;charset=utf-8')
      localReviewRepository.save(parsed.records)
      setRecords(parsed.records)
      setStorageError('')
      setEditingId(null)
      setDraft(blankDraft())
      setFormError('')
      setNotice('JSON backup restored: ' + parsed.records.length + ' reviews.')
    } catch (error) {
      const message = error instanceof Error ? error.message : '파일을 읽지 못했습니다.'
      setNotice('복원 실패: ' + message)
    } finally {
      if (importRef.current) importRef.current.value = ''
    }
  }

  const goTo = (target: string) => {
    const container = document.querySelector('.dashboard-scroll')
    const element = document.querySelector(target)
    if (!container || !element) return
    container.scrollTo({ top: element.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - 14, behavior: 'smooth' })
  }

  return <div className="app-shell">
    <header className="app-header">
      <div className="brand"><div className="brand-mark"><ClipboardList size={27} strokeWidth={2.2}/></div><div><h1>SOP Score Tracker</h1><p>Track review quality and rework patterns</p></div></div>
      <nav className="main-nav" aria-label="Main navigation">
        <button type="button" className="active" onClick={() => goTo('.dashboard-intro')}><House size={16}/> Dashboard</button>
        <button type="button" onClick={() => goTo('.recent-head')}><ClipboardList size={16}/> Reviews</button>
        <button type="button" onClick={() => goTo('.analysis-head')}><ChartNoAxesCombined size={16}/> Insights</button>
      </nav>
      <div className="header-tools">
        <span className={'backup-status ' + (needsBackup ? 'needed' : '')} title={backupAt ? 'Last JSON export started: ' + new Date(backupAt).toLocaleString() + ' · Check the downloaded file.' : 'No JSON backup yet'}><ShieldCheck size={15}/>{needsBackup ? 'Backup needed' : backupAt ? 'Exported ' + new Date(backupAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Local only'}</span>
        <div className="backup-menu">
          <button type="button" className="tool-button" onClick={exportBackup} title="Backup JSON"><FileJson size={16}/><span>Backup</span></button>
          <button type="button" className="icon-button" onClick={() => importRef.current?.click()} title="Restore JSON" aria-label="Restore JSON"><Upload size={17}/></button>
          <button type="button" className="icon-button" onClick={exportSpreadsheet} title="Export CSV" aria-label="Export CSV"><Download size={17}/></button>
          <input ref={importRef} hidden type="file" accept=".json,application/json" onChange={event => { const file = event.target.files?.[0]; if (file) void importBackup(file) }} />
        </div>
      </div>
    </header>
    {storageError ? <div className="storage-alert" role="alert">{storageError}</div> : null}
    {notice ? <div className="toast" role="status"><Save size={15}/>{notice}</div> : null}
    <main className="workspace">
      <ReviewForm draft={draft} onChange={value => { setDraft(value); if (formError) setFormError('') }} onSave={saveReview} onCancelEdit={() => { setEditingId(null); setDraft(blankDraft(draft.reviewDate)); setFormError('') }} editing={editing} error={formError} fieldSuggestions={fieldSuggestions} />
      <Dashboard records={records} onEdit={editReview} onDelete={deleteReview} />
    </main>
  </div>
}
