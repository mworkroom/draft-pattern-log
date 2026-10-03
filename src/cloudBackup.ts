import type { BackupV1, ReviewRecordV1 } from './model'
import { parseBackup } from './storage'

export interface CloudSnapshot {
  id: string
  createdAt: string
  backup: BackupV1
}

export interface CloudRepository {
  latest(): Promise<CloudSnapshot | null>
  save(backup: BackupV1, expectedId: string | null, requestId: string): Promise<CloudSnapshot>
}

export interface CloudState {
  kind: 'checking' | 'ready' | 'writing' | 'error' | 'conflict' | 'paused'
  message: string
  remote?: CloudSnapshot | null
  savedAt?: string
}

interface Outbox {
  version: 1
  acknowledged: CloudSnapshot | null
  pending: { id: string; backup: BackupV1 }[]
}

// Postgres JSONB changes object-key order. Compare content, not serialized key order.
export function fingerprint(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(fingerprint).join(',') + ']'
  if (value !== null && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + fingerprint((value as Record<string, unknown>)[key])).join(',') + '}'
  }
  return JSON.stringify(value)
}

export function sameBackupRecords(left: ReviewRecordV1[], right: ReviewRecordV1[]): boolean {
  return fingerprint(left) === fingerprint(right)
}

export function parseSnapshot(value: unknown): CloudSnapshot {
  const row = value as { id?: unknown; created_at?: unknown; backup?: unknown }
  if (!row || typeof row.id !== 'string' || typeof row.created_at !== 'string' || Number.isNaN(Date.parse(row.created_at))) {
    throw new Error('클라우드 백업 응답이 올바르지 않습니다.')
  }
  return { id: row.id, createdAt: row.created_at, backup: parseBackup(row.backup) }
}

export class CloudBackupCoordinator {
  state: CloudState = { kind: 'checking', message: '클라우드 백업을 확인하는 중입니다.' }
  private connected = false
  private disposed = false
  private suspended = false
  private rerun = false
  private busy: Promise<void> | null = null
  private readonly key: string

  constructor(
    private repository: CloudRepository,
    private storage: Pick<Storage, 'getItem' | 'setItem'>,
    userId: string,
    private records: () => ReviewRecordV1[],
    private writable: () => boolean,
    private notify: (state: CloudState) => void,
    private lock: (work: () => Promise<void>) => Promise<void> = work => work(),
  ) {
    this.key = `draft-pattern-log:cloud:v1:${userId}`
  }

  private read(): Outbox {
    const raw = this.storage.getItem(this.key)
    if (!raw) return { version: 1, acknowledged: null, pending: [] }
    const data = JSON.parse(raw) as Outbox
    if (data.version !== 1 || !Array.isArray(data.pending)) throw new Error('클라우드 전송 대기 정보가 손상되었습니다. 자동 전송을 중단했습니다.')
    const validate = (item: CloudSnapshot): CloudSnapshot => {
      if (typeof item.id !== 'string' || typeof item.createdAt !== 'string') throw new Error('클라우드 확인 정보가 올바르지 않습니다.')
      return { ...item, backup: parseBackup(item.backup) }
    }
    return {
      version: 1,
      acknowledged: data.acknowledged ? validate(data.acknowledged) : null,
      pending: data.pending.map(item => {
        if (typeof item.id !== 'string') throw new Error('클라우드 전송 ID가 올바르지 않습니다.')
        return { id: item.id, backup: parseBackup(item.backup) }
      }),
    }
  }

  private write(data: Outbox) { this.storage.setItem(this.key, JSON.stringify(data)) }

  private update(state: CloudState) {
    this.state = state
    if (!this.disposed) this.notify(state)
  }

  private append(records: ReviewRecordV1[]) {
    const data = this.read()
    const previous = data.pending.at(-1)?.backup ?? data.acknowledged?.backup
    if (previous && sameBackupRecords(previous.records, records)) return
    // A never-used browser must not create an empty cloud backup on startup.
    if (!previous && records.length === 0) return
    data.pending.push({ id: crypto.randomUUID(), backup: parseBackup({ schemaVersion: 1, exportedAt: new Date().toISOString(), records }) })
    this.write(data)
  }

  changed(records: ReviewRecordV1[]) {
    if (this.disposed || this.suspended || (!this.connected && this.state.kind !== 'error') || this.state.kind === 'conflict' || !this.writable()) return
    try { this.append(records) } catch (error) { this.failed(error); return }
    void this.retry()
  }

  private failed(error: unknown) {
    const message = error instanceof Error ? error.message : '클라우드에 연결하지 못했습니다.'
    if (message.includes('DRAFT_BACKUP_CONFLICT')) {
      this.connected = false
      this.update({ kind: 'conflict', message: '클라우드 기록이 다른 곳에서 변경됐습니다. 로컬 기록과 전송 대기 데이터는 보존했습니다. 다시 확인해 주세요.' })
    } else {
      this.update({ kind: 'error', message: `클라우드 백업 실패: ${message} · 로컬 기록은 유지됩니다. 연결 후 재시도합니다.` })
    }
  }

  retry(): Promise<void> {
    if (this.disposed || this.suspended) return Promise.resolve()
    if (this.busy) return this.busy
    const work = this.lock(async () => {
      if (this.disposed) return
      try {
        if (!this.connected) {
          this.update({ kind: 'checking', message: '클라우드 백업을 확인하는 중입니다.' })
          const remote = await this.repository.latest()
          if (this.disposed) return
          const data = this.read()
          // A response may have been lost after the server committed a request.
          const committed = remote ? data.pending.findIndex(item => item.id === remote.id) : -1
          if (committed >= 0) {
            if (!sameBackupRecords(data.pending[committed].backup.records, remote!.backup.records)) throw new Error('클라우드 응답과 전송 내용이 다릅니다.')
            data.pending.splice(0, committed + 1)
            data.acknowledged = remote
            this.write(data)
          }
          const local = this.records()
          const matchesLocal = remote && sameBackupRecords(remote.backup.records, local)
          const matchesBase = remote?.id === data.acknowledged?.id
          const lostLocal = local.length === 0 && !!remote?.backup.records.length && !data.pending.length
          if ((remote && !matchesLocal && (!matchesBase || lostLocal)) || (!remote && data.acknowledged) || (data.pending.length > 0 && !matchesBase && committed < 0)) {
            this.update({ kind: 'conflict', remote, message: `클라우드 ${remote?.backup.records.length ?? 0}건과 로컬 ${local.length}건이 다릅니다. 복구하거나 현재 기록을 백업할지 선택해 주세요.` })
            return
          }
          if (!data.pending.length) {
            data.acknowledged = remote
            this.write(data)
          }
          this.connected = true
        }
        if (!this.writable()) {
          this.update({ kind: 'paused', message: '로컬 저장·폴더 충돌을 먼저 해결해 주세요. 클라우드 기록은 유지됩니다.' })
          return
        }
        this.append(this.records())
        for (;;) {
          const data = this.read()
          const item = data.pending[0]
          if (!item || this.disposed) break
          this.update({ kind: 'writing', message: `클라우드에 백업하는 중입니다. · 전송 대기 ${data.pending.length}개` })
          const saved = await this.repository.save(item.backup, data.acknowledged?.id ?? null, item.id)
          if (!sameBackupRecords(saved.backup.records, item.backup.records)) throw new Error('저장된 클라우드 내용이 전송 내용과 다릅니다.')
          // Read again: local saves can enqueue revisions during the network request.
          const fresh = this.read()
          if (fresh.pending[0]?.id === item.id) fresh.pending.shift()
          fresh.acknowledged = saved
          this.write(fresh)
        }
        if (this.disposed) return
        const acknowledged = this.read().acknowledged
        const latest = await this.repository.latest()
        if (latest?.id !== acknowledged?.id) {
          this.connected = false
          this.update({ kind: 'conflict', remote: latest, message: '클라우드의 최신 버전이 변경됐습니다. 백업 내용을 다시 확인해 주세요.' })
          return
        }
        // A save can arrive while the final server confirmation is in flight.
        if (this.read().pending.length) {
          this.rerun = true
          this.update({ kind: 'writing', message: '추가 변경을 클라우드에 백업하는 중입니다.' })
          return
        }
        this.update({ kind: 'ready', savedAt: acknowledged?.createdAt, message: acknowledged
          ? `클라우드 백업 완료 · ${acknowledged.backup.records.length}건 · ${new Date(acknowledged.createdAt).toLocaleString()}`
          : '클라우드 연결됨 · 첫 기록 저장 시 백업됩니다.' })
      } catch (error) { this.failed(error) }
    })
    this.busy = work.finally(() => {
      this.busy = null
      const rerun = this.rerun
      this.rerun = false
      if (rerun && this.state.kind === 'writing') void this.retry()
    })
    return this.busy
  }

  async useLocal(expected: CloudSnapshot | null): Promise<void> {
    // The caller confirms this choice after inspecting the current cloud version.
    if (!this.writable()) throw new Error('로컬 저장·폴더 충돌을 먼저 해결해 주세요.')
    await this.busy
    await this.lock(async () => {
      const actual = await this.repository.latest()
      if (actual?.id !== expected?.id) throw new Error('클라우드 기록이 다시 변경됐습니다. 다시 확인해 주세요.')
      const data = this.read()
      data.acknowledged = actual
      this.write(data)
      this.connected = true
      this.append(this.records())
    })
    await this.retry()
  }

  async prepareRestore(): Promise<void> {
    this.suspended = true
    await this.busy
  }

  cancelRestore() { this.suspended = false }

  async restored(snapshot: CloudSnapshot | null): Promise<void> {
    await this.busy
    await this.lock(async () => {
      this.write({ version: 1, acknowledged: snapshot, pending: [] })
      this.connected = true
    })
    this.suspended = false
    await this.retry()
  }

  pendingBackups(): BackupV1[] { return this.read().pending.map(item => item.backup) }
  dispose() { this.disposed = true }
}
