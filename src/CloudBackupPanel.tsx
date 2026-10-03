import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ShieldCheck } from 'lucide-react'
import AppDialog from './AppDialog'
import type { Session } from '@supabase/supabase-js'
import { CloudBackupCoordinator, sameBackupRecords, type CloudState } from './cloudBackup'
import { cloudRepository, listCloudHistory, readCloudSnapshot, supabase, type SnapshotSummary } from './supabase'
import type { BackupV1, ReviewRecordV1 } from './model'
import { backupJson, downloadText } from './storage'

interface Props {
  records: ReviewRecordV1[]
  writable: boolean
  restoreAllowed: boolean
  onRestore: (backup: BackupV1) => Promise<boolean>
  settingsOpen: boolean
  onSettingsChange: (open: boolean) => void
  jsonSettings: ReactNode
}

export default function CloudBackupPanel({ records, writable, restoreAllowed, onRestore, settingsOpen, onSettingsChange, jsonSettings }: Props) {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [state, setState] = useState<CloudState>({ kind: 'checking', message: '로그인 상태를 확인하는 중입니다.' })
  const [history, setHistory] = useState<SnapshotSummary[] | null>(null)
  const [selected, setSelected] = useState('')
  const [actionError, setActionError] = useState('')
  const [acting, setActing] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const coordinator = useRef<CloudBackupCoordinator | null>(null)
  const recordsRef = useRef(records)
  const writableRef = useRef(writable)
  recordsRef.current = records
  writableRef.current = writable

  useEffect(() => {
    if (!supabase) { setAuthReady(true); return }
    let cancelled = false
    void supabase.auth.getSession().then(({ data, error }) => {
      if (cancelled) return
      if (error) setActionError(error.message)
      setSession(data.session)
      setAuthReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!cancelled) { setSession(next); setAuthReady(true) }
    })
    return () => { cancelled = true; data.subscription.unsubscribe() }
  }, [])

  const userId = session?.user.id
  useEffect(() => {
    if (!userId || !supabase) return
    setHistory(null)
    setActionError('')
    const lock = async (work: () => Promise<void>) => {
      if (navigator.locks) await navigator.locks.request(`draft-pattern-cloud:${userId}`, work)
      else await work()
    }
    const current = new CloudBackupCoordinator(cloudRepository, localStorage, userId,
      () => recordsRef.current, () => writableRef.current, setState, lock)
    coordinator.current = current
    void current.retry()
    const retry = () => { if (current.state.kind !== 'conflict') void current.retry() }
    // No background polling when the confirmed backup is unchanged.
    const timer = window.setInterval(() => {
      if (current.state.kind === 'error' || current.state.kind === 'paused') retry()
    }, 30_000)
    window.addEventListener('online', retry)
    window.addEventListener('focus', retry)
    return () => {
      current.dispose()
      if (coordinator.current === current) coordinator.current = null
      window.clearInterval(timer)
      window.removeEventListener('online', retry)
      window.removeEventListener('focus', retry)
    }
  }, [userId])

  useEffect(() => { coordinator.current?.changed(records) }, [records, writable])

  const action = async (work: () => Promise<void>) => {
    setActing(true)
    setActionError('')
    try { await work() } catch (error) { setActionError(error instanceof Error ? error.message : '작업에 실패했습니다.') }
    finally { setActing(false) }
  }

  const login = () => action(async () => {
    if (!supabase) return
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google', options: { redirectTo: window.location.origin + (import.meta as ImportMeta & { env: { BASE_URL: string } }).env.BASE_URL },
    })
    if (error) throw new Error(error.message)
  })

  const showHistory = () => action(async () => {
    const items = await listCloudHistory()
    setHistory(items)
    setSelected(items[0]?.id ?? '')
  })

  const useLocal = () => action(async () => {
    const remote = await cloudRepository.latest()
    const count = recordsRef.current.length
    if (!count) throw new Error('빈 로컬 기록으로 클라우드를 교체할 수 없습니다. 먼저 클라우드에서 복구해 주세요.')
    if (!window.confirm(`현재 로컬 ${count}건을 클라우드의 새 버전으로 백업할까요?\n클라우드 최신 버전: ${remote?.backup.records.length ?? 0}건${remote ? ' · ' + new Date(remote.createdAt).toLocaleString() : ''}\n기존 클라우드 버전도 계속 보관합니다.`)) return
    await coordinator.current?.useLocal(remote)
    setHistory(null)
  })

  const restore = (id?: string) => action(async () => {
    if (!coordinator.current) return
    if (!restoreAllowed) throw new Error('폴더 충돌을 먼저 해결해 주세요.')
    const latest = await cloudRepository.latest()
    const chosen = id ? await readCloudSnapshot(id) : latest
    if (!chosen) throw new Error('복구할 클라우드 백업이 없습니다.')
    if (!window.confirm(`${new Date(chosen.createdAt).toLocaleString()}의 클라우드 ${chosen.backup.records.length}건으로 로컬 ${recordsRef.current.length}건을 복구할까요?\n현재 로컬 기록과 미전송 이력은 JSON으로 먼저 보관합니다.`)) return
    // Preserve pending offline history before the explicit restore replaces the outbox.
    const pending = coordinator.current.pendingBackups()
    if (pending.length) downloadText('sop-score-tracker-pending-history-' + Date.now() + '.json', JSON.stringify(pending, null, 2), 'application/json')
    if (recordsRef.current.length && !sameBackupRecords(chosen.backup.records, recordsRef.current)) {
      downloadText('sop-score-tracker-before-cloud-restore-' + Date.now() + '.json', backupJson(recordsRef.current), 'application/json')
    }
    const current = coordinator.current
    await current.prepareRestore()
    try {
      if (!await onRestore(chosen.backup)) throw new Error('로컬 기록을 복구하지 못했습니다. 기존 클라우드 백업은 유지됩니다.')
      recordsRef.current = chosen.backup.records
      writableRef.current = true
      // Restoring an older snapshot writes a NEW version against the current head.
      await current.restored(latest)
    } finally { current.cancelRestore() }
    setHistory(null)
  })

  let message = state.message
  if (!supabase) message = '클라우드 연결 설정이 없습니다. JSON 백업은 계속 사용할 수 있습니다.'
  else if (!authReady) message = '로그인 상태를 확인하는 중입니다.'
  else if (!session) message = 'Google 계정으로 연결하면 JSON과 Supabase에 함께 백업합니다.'

  const compactMessage = !supabase ? '클라우드 미설정' : !authReady ? '백업 확인 중'
    : !session ? '클라우드 미연결' : state.kind === 'ready'
      ? state.savedAt ? `백업 ${new Date(state.savedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${records.length}건` : '클라우드 연결됨'
      : ({ checking: '백업 확인 중', writing: '백업 저장 중', error: '백업 실패', conflict: '백업 확인 필요', paused: '백업 대기 중' } as const)[state.kind]
  const openHistory = () => {
    setHistoryOpen(true)
    if (session) void showHistory()
  }
  const cloudDetails = <>
    <p className="cloud-detail-status" role={session && ['error', 'conflict'].includes(state.kind) ? 'alert' : 'status'}>{message}</p>
    {actionError ? <p className="cloud-error" role="alert">{actionError}</p> : null}
    {session ? <div className="cloud-actions">
      {['error', 'conflict', 'paused'].includes(state.kind) ? <button className="tool-button" disabled={acting} onClick={() => void coordinator.current?.retry()}>다시 확인</button> : null}
      {state.kind === 'conflict' ? <>
        <button className="tool-button" disabled={acting || !restoreAllowed} onClick={() => void restore()}>클라우드에서 복구</button>
        {records.length > 0 ? <button className="tool-button" disabled={acting || !writable} onClick={() => void useLocal()}>현재 기록을 클라우드에 백업</button> : null}
      </> : null}
    </div> : null}
  </>

  return <>
    <button type="button" className={'backup-status cloud-header-status ' + (session ? state.kind : 'signed-out')}
      aria-label="클라우드 백업" aria-haspopup="dialog" title={message} onClick={openHistory}>
      <ShieldCheck size={17}/><span role="status">{compactMessage}</span>
    </button>
    {settingsOpen ? <AppDialog title="설정" onClose={() => onSettingsChange(false)}>
      {jsonSettings}
      <section className="settings-section" aria-label="로그인"><h3>로그인</h3>
        {session ? <><p className="cloud-account">{session.user.email} · mworkroom</p>
          <button className="tool-button" disabled={acting || state.kind === 'writing'} onClick={() => void action(async () => {
            const { error } = await supabase!.auth.signOut({ scope: 'local' })
            if (error) throw new Error(error.message)
            setHistory(null)
          })}>연결 해제</button>
        </> : <><p>{authReady ? 'Google 계정으로 연결하면 클라우드에도 함께 백업합니다.' : '로그인 상태를 확인하는 중입니다.'}</p>
          {supabase && authReady ? <button className="tool-button" type="button" disabled={acting} onClick={() => void login()}>Google로 연결</button> : null}
        </>}
        {cloudDetails}
      </section>
    </AppDialog> : null}
    {historyOpen ? <AppDialog title="클라우드 백업" onClose={() => setHistoryOpen(false)}>
      <section className={'cloud-details ' + (session ? state.kind : 'signed-out')} aria-label="클라우드 백업 상세">
      {cloudDetails}
      {session ? <button className="tool-button" disabled={acting || state.kind === 'writing' || state.kind === 'checking'} onClick={() => void showHistory()}>백업 이력</button>
        : <button className="tool-button" onClick={() => { setHistoryOpen(false); onSettingsChange(true) }}>로그인 설정 열기</button>}
      {session && history ? <div className="cloud-history">
      {history.length ? <>
        <label htmlFor="cloud-version">백업 버전 <select id="cloud-version" value={selected} onChange={event => setSelected(event.target.value)}>
          {history.map(item => <option key={item.id} value={item.id}>{new Date(item.createdAt).toLocaleString()} · {item.recordCount}건</option>)}
        </select></label>
        <button className="tool-button" disabled={acting || !restoreAllowed} onClick={() => void restore(selected)}>선택 버전 복구</button>
        <button className="tool-button" disabled={acting} onClick={() => void action(async () => {
          const snapshot = await readCloudSnapshot(selected)
          downloadText('sop-score-tracker-cloud-' + snapshot.createdAt.replaceAll(':', '-') + '.json', JSON.stringify(snapshot.backup, null, 2), 'application/json')
        })}>JSON 다운로드</button>
        <span>최근 50개 표시 · 이전 버전도 DB에 보관</span>
      </> : <span>아직 클라우드 백업이 없습니다.</span>}
      </div> : null}
      </section>
    </AppDialog> : null}
  </>
}
