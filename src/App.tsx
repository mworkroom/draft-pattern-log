import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChartNoAxesCombined, ClipboardList, Download, FileJson, House, Save, ShieldCheck, Upload,
} from 'lucide-react'
import Dashboard from './Dashboard'
import ReviewForm from './ReviewForm'
import {
  hasWritePermission, pickBackupDirectory, readCurrentBackup, rememberedBackupDirectory,
  rememberBackupDirectory, requestWritePermission, SUGGESTED_BACKUP_FOLDER, supportsFolderBackup,
  writeCurrentBackup, writeSafetyBackup, type BackupDirectory,
} from './fileBackup'
import { blankDraft, recordToDraft, toRecord, validateDraft, type BackupV1, type ReviewDraft, type ReviewRecordV1 } from './model'
import { backupJson, downloadText, exportCsv, lastBackupAt, localReviewRepository, markBackedUp, parseBackup, STORAGE_KEY } from './storage'

type FileBackupState = {
  kind: 'checking' | 'setup' | 'permission' | 'ready' | 'writing' | 'conflict' | 'error' | 'unsupported'
  message: string
  folderName?: string
  file?: BackupV1
}

function sameRecords(left: ReviewRecordV1[], right: ReviewRecordV1[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '알 수 없는 오류'
}

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
  const [fileBackup, setFileBackup] = useState<FileBackupState>({ kind: 'checking', message: '자동 백업 폴더를 확인하는 중입니다.' })
  const importRef = useRef<HTMLInputElement>(null)
  const folderRef = useRef<BackupDirectory | null>(null)
  const syncedFileRecordsRef = useRef<ReviewRecordV1[] | null>(null)
  const recordsRef = useRef(records)
  const backupQueueRef = useRef<Promise<void>>(Promise.resolve())
  const backupVersionRef = useRef(0)
  recordsRef.current = records
  const editing = records.find(record => record.id === editingId) ?? null
  const fieldSuggestions = useMemo(() => [...new Set(records.map(record => record.field.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [records])
  const needsBackup = records.length > 0 && (!backupAt || records.some(record => record.updatedAt > backupAt))

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 4500)
    return () => window.clearTimeout(timer)
  }, [notice])

  const inspectFolder = async (directory: BackupDirectory, remembered = true) => {
    folderRef.current = directory
    try {
      const file = await readCurrentBackup(directory)
      const current = recordsRef.current
      if (file && !sameRecords(file.records, current)) {
        setFileBackup({
          kind: 'conflict', folderName: directory.name, file,
          message: `폴더 백업 ${file.records.length}건과 브라우저 기록 ${current.length}건이 다릅니다. 어느 쪽도 자동으로 덮어쓰지 않았습니다.`,
        })
        return
      }
      let savedAt = file?.exportedAt
      if (!file && current.length > 0 && !storageError) {
        savedAt = await writeCurrentBackup(directory, current)
      }
      syncedFileRecordsRef.current = file ? file.records : current.length > 0 && !storageError ? current : null
      if (savedAt) {
        markBackedUp(savedAt)
        setBackupAt(savedAt)
      }
      setFileBackup({
        kind: 'ready', folderName: directory.name,
        message: remembered
          ? `${directory.name} 폴더 연결됨 · ${savedAt ? 'JSON 백업 확인' : '첫 기록 저장 시 JSON 생성'}`
          : `${directory.name} 폴더 연결됨 · 다음 실행 시 폴더를 다시 선택해야 할 수 있습니다.`,
      })
    } catch (error) {
      setFileBackup({ kind: 'error', folderName: directory.name, message: `폴더 백업을 확인하지 못했습니다: ${errorMessage(error)}. 기존 파일은 덮어쓰지 않았습니다.` })
    }
  }

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!supportsFolderBackup()) {
        if (!cancelled) setFileBackup({ kind: 'unsupported', message: '이 브라우저는 폴더 자동 백업을 지원하지 않습니다. 수동 Backup을 이용해 주세요.' })
        return
      }
      try {
        const directory = await rememberedBackupDirectory()
        if (cancelled) return
        if (!directory) {
          setFileBackup({ kind: 'setup', message: `자동 백업을 쓰려면 처음 한 번 ${SUGGESTED_BACKUP_FOLDER} 폴더를 선택해 주세요.` })
        } else if (await hasWritePermission(directory) === 'granted') {
          if (!cancelled) await inspectFolder(directory)
        } else {
          folderRef.current = directory
          setFileBackup({ kind: 'permission', folderName: directory.name, message: `${directory.name} 폴더 접근 권한을 다시 허용해야 자동 백업됩니다.` })
        }
      } catch (error) {
        if (!cancelled) setFileBackup({ kind: 'error', message: `저장된 폴더 정보를 열지 못했습니다: ${errorMessage(error)}. 폴더를 다시 선택해 주세요.` })
      }
    }
    void load()
    return () => { cancelled = true }
    // Initial folder inspection must not rerun after each record edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const chooseFolder = async () => {
    try {
      const directory = await pickBackupDirectory()
      if (directory.name !== 'EDM' && !window.confirm(`선택한 폴더는 "${directory.name}"입니다. 권장 폴더는 Documents 안의 EDM입니다. 이 폴더를 백업 위치로 사용하시겠습니까?`)) return
      let remembered = true
      try {
        await rememberBackupDirectory(directory)
      } catch {
        remembered = false
      }
      await inspectFolder(directory, remembered)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setFileBackup({ kind: 'error', message: `폴더를 선택하지 못했습니다: ${errorMessage(error)}` })
    }
  }

  const reconnectFolder = async () => {
    const directory = folderRef.current
    if (!directory) { await chooseFolder(); return }
    try {
      if (await requestWritePermission(directory) === 'granted') {
        await inspectFolder(directory)
      } else {
        setFileBackup({ kind: 'permission', folderName: directory.name, message: '폴더 접근이 허용되지 않았습니다. 권한을 허용하거나 폴더를 다시 선택해 주세요.' })
      }
    } catch (error) {
      setFileBackup({ kind: 'error', folderName: directory.name, message: `폴더 접근을 복구하지 못했습니다: ${errorMessage(error)}` })
    }
  }

  const queueFileBackup = (next: ReviewRecordV1[]) => {
    const directory = folderRef.current
    if (!directory || !['ready', 'writing', 'error'].includes(fileBackup.kind)) return
    const version = ++backupVersionRef.current
    setFileBackup({ kind: 'writing', folderName: directory.name, message: `${directory.name} 폴더에 JSON을 저장하는 중입니다.` })
    const write = backupQueueRef.current.then(async () => {
      const expected = syncedFileRecordsRef.current
      const actual = await readCurrentBackup(directory)
      if (actual && sameRecords(actual.records, next)) {
        syncedFileRecordsRef.current = next
        return actual.exportedAt
      }
      if (actual ? !expected || !sameRecords(actual.records, expected) : expected !== null) {
        throw new Error('폴더 파일이 앱 밖에서 변경됐습니다. 재연결하여 어느 기록을 유지할지 확인해 주세요.')
      }
      const savedAt = await writeCurrentBackup(directory, next)
      syncedFileRecordsRef.current = next
      return savedAt
    })
    backupQueueRef.current = write.then(() => undefined, () => undefined)
    void write.then(
      (savedAt) => {
        if (version !== backupVersionRef.current) return
        markBackedUp(savedAt)
        setBackupAt(savedAt)
        setFileBackup({ kind: 'ready', folderName: directory.name, message: `${directory.name} 폴더에 자동 백업 완료 · ${new Date(savedAt).toLocaleString()}` })
      },
      (error) => {
        if (version !== backupVersionRef.current) return
        setFileBackup({ kind: 'error', folderName: directory.name, message: `자동 백업 실패: ${errorMessage(error)}. 브라우저 기록은 남아 있지만 폴더 파일을 확인해 주세요.` })
      },
    )
  }

  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key?.startsWith('sop-score-tracker:')) {
        try {
          const next = localReviewRepository.load()
          setRecords(next)
          setBackupAt(lastBackupAt())
          setStorageError('')
          setNotice('다른 탭에서 변경된 데이터를 다시 불러왔습니다.')
          if (event.key === STORAGE_KEY) queueFileBackup(next)
        } catch {
          setStorageError('다른 탭에서 저장된 데이터가 손상되었습니다. 복원하기 전까지 새 저장을 중단합니다.')
        }
      }
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [fileBackup.kind])

  const persist = (next: ReviewRecordV1[]) => {
    if (fileBackup.kind === 'conflict') {
      setFormError('폴더 백업과 브라우저 기록이 다릅니다. 먼저 백업 상태를 해결해 주세요.')
      return false
    }
    try {
      localReviewRepository.save(next)
      setRecords(next)
      setBackupAt(null)
      queueFileBackup(next)
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

  const restoreFromFolder = async () => {
    const directory = folderRef.current
    const file = fileBackup.file
    if (!directory || !file) return
    if (records.length && !window.confirm(`폴더 백업 ${file.records.length}건으로 브라우저의 ${records.length}건을 교체할까요? 기존 브라우저 기록은 별도 JSON으로 먼저 보관합니다.`)) return
    try {
      if (records.length) await writeSafetyBackup(directory, records, 'before-restore')
      localReviewRepository.save(file.records)
      setRecords(file.records)
      syncedFileRecordsRef.current = file.records
      setStorageError('')
      setEditingId(null)
      setDraft(blankDraft())
      setFormError('')
      markBackedUp(file.exportedAt)
      setBackupAt(file.exportedAt)
      setFileBackup({ kind: 'ready', folderName: directory.name, message: `${directory.name} 폴더에서 ${file.records.length}건을 복구했습니다. 자동 백업이 연결됐습니다.` })
      setNotice(`폴더 백업에서 ${file.records.length}건을 복구했습니다.`)
    } catch (error) {
      setFileBackup({ kind: 'conflict', folderName: directory.name, file, message: `복구 실패: ${errorMessage(error)}. 어느 쪽도 자동으로 덮어쓰지 않았습니다.` })
    }
  }

  const replaceFolderWithLocal = async () => {
    const directory = folderRef.current
    const file = fileBackup.file
    if (!directory || !file || !records.length || storageError) return
    if (!window.confirm(`브라우저 기록 ${records.length}건으로 폴더의 ${file.records.length}건을 교체할까요? 기존 폴더 기록은 별도 JSON으로 먼저 보관합니다.`)) return
    try {
      await writeSafetyBackup(directory, file.records, 'before-replace')
      const savedAt = await writeCurrentBackup(directory, records)
      syncedFileRecordsRef.current = records
      markBackedUp(savedAt)
      setBackupAt(savedAt)
      setFileBackup({ kind: 'ready', folderName: directory.name, message: `${directory.name} 폴더에 브라우저 기록 ${records.length}건을 저장했습니다.` })
      setNotice('폴더 백업을 현재 기록으로 갱신했습니다.')
    } catch (error) {
      setFileBackup({ kind: 'conflict', folderName: directory.name, file, message: `폴더 갱신 실패: ${errorMessage(error)}. 브라우저 기록은 유지했습니다.` })
    }
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
    if (fileBackup.kind === 'conflict') {
      setNotice('먼저 폴더 백업과 브라우저 기록의 차이를 해결해 주세요.')
      if (importRef.current) importRef.current.value = ''
      return
    }
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
      if (records.length && folderRef.current && fileBackup.kind === 'ready') {
        await backupQueueRef.current
        await writeSafetyBackup(folderRef.current, records, 'before-restore')
      }
      localReviewRepository.save(parsed.records)
      setRecords(parsed.records)
      setBackupAt(null)
      queueFileBackup(parsed.records)
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
        <span className={'backup-status ' + (needsBackup ? 'needed' : '')} title={backupAt ? 'Last JSON backup: ' + new Date(backupAt).toLocaleString() + ' · Check manually downloaded files.' : 'No JSON backup yet'}><ShieldCheck size={15}/>{needsBackup ? 'Backup needed' : backupAt ? 'Backed up ' + new Date(backupAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Local only'}</span>
        <div className="backup-menu">
          <button type="button" className="tool-button" onClick={exportBackup} title="Backup JSON"><FileJson size={16}/><span>Backup</span></button>
          <button type="button" className="icon-button" onClick={() => importRef.current?.click()} title="Restore JSON" aria-label="Restore JSON"><Upload size={17}/></button>
          <button type="button" className="icon-button" onClick={exportSpreadsheet} title="Export CSV" aria-label="Export CSV"><Download size={17}/></button>
          <input ref={importRef} hidden type="file" accept=".json,application/json" onChange={event => { const file = event.target.files?.[0]; if (file) void importBackup(file) }} />
        </div>
      </div>
    </header>
    <div className={'backup-strip ' + fileBackup.kind} role={fileBackup.kind === 'conflict' || fileBackup.kind === 'error' ? 'alert' : 'status'}>
      <div className="backup-strip-copy">
        <strong>자동 JSON 백업</strong>
        <span>{fileBackup.message}</span>
      </div>
      {fileBackup.kind === 'conflict' ? <div className="backup-strip-actions">
        <button className="tool-button" type="button" onClick={() => void restoreFromFolder()}>폴더 파일에서 복구</button>
        {records.length > 0 && !storageError ? <button className="tool-button" type="button" onClick={() => void replaceFolderWithLocal()}>현재 기록을 폴더에 저장</button> : null}
        <button className="text-button" type="button" onClick={() => void chooseFolder()}>다른 폴더 선택</button>
      </div> : null}
      {['setup', 'permission', 'error'].includes(fileBackup.kind) ? <div className="backup-strip-actions">
        {fileBackup.kind === 'permission' ? <button className="tool-button" type="button" onClick={() => void reconnectFolder()}>접근 다시 허용</button> : null}
        <button className="tool-button" type="button" onClick={() => void chooseFolder()}>백업 폴더 선택</button>
      </div> : null}
      {fileBackup.kind === 'ready' ? <button className="text-button" type="button" onClick={() => void chooseFolder()}>폴더 변경</button> : null}
    </div>
    {storageError ? <div className="storage-alert" role="alert">{storageError}</div> : null}
    {notice ? <div className="toast" role="status"><Save size={15}/>{notice}</div> : null}
    <main className="workspace">
      <ReviewForm draft={draft} onChange={value => { setDraft(value); if (formError) setFormError('') }} onSave={saveReview} onCancelEdit={() => { setEditingId(null); setDraft(blankDraft(draft.reviewDate)); setFormError('') }} editing={editing} error={formError} fieldSuggestions={fieldSuggestions} />
      <Dashboard records={records} onEdit={editReview} onDelete={deleteReview} />
    </main>
  </div>
}
