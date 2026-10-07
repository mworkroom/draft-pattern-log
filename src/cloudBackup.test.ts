import { describe, expect, it } from 'vitest'
import { CloudBackupCoordinator, fingerprint, parseSnapshot, type CloudRepository, type CloudSnapshot } from './cloudBackup'
import { blankDraft, toRecord, type BackupV1, type ReviewRecordV1 } from './model'

function record(name: string): ReviewRecordV1 {
  const draft = blankDraft('2026-10-03')
  draft.studentName = name
  for (const key of Object.keys(draft.structure) as (keyof typeof draft.structure)[]) draft.structure[key] = 1
  return toRecord(draft)
}
const backup = (records: ReviewRecordV1[]): BackupV1 => ({ schemaVersion: 1, exportedAt: new Date().toISOString(), records })

function harness(records: ReviewRecordV1[] = []) {
  const map = new Map<string, string>()
  const storage = { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => { map.set(key, value) } }
  let local = records
  let remote: CloudSnapshot | null = null
  let failure = false
  let lostResponse = false
  const versions: CloudSnapshot[] = []
  const repository: CloudRepository = {
    latest: async () => remote,
    save: async (data, expected, id) => {
      const existing = versions.find(item => item.id === id)
      if (existing) return existing
      if (failure) throw new Error('offline')
      if ((remote?.id ?? null) !== expected) throw new Error('DRAFT_BACKUP_CONFLICT')
      remote = { id, createdAt: new Date().toISOString(), backup: data }
      versions.push(remote)
      if (lostResponse) { lostResponse = false; throw new Error('response lost') }
      return remote
    },
  }
  const make = () => new CloudBackupCoordinator(repository, storage, 'user', () => local, () => true, () => {})
  return { make, versions, map, repository,
    local: (value: ReviewRecordV1[]) => { local = value },
    remote: (value: CloudSnapshot) => { remote = value },
    offline: (value: boolean) => { failure = value },
    loseResponse: () => { lostResponse = true },
  }
}

describe('cloud backup coordination', () => {
  it('compares JSONB object content regardless of key order', () => {
    expect(fingerprint({ b: 2, a: { z: 1, c: 3 } })).toBe(fingerprint({ a: { c: 3, z: 1 }, b: 2 }))
  })

  it('seeds existing records and avoids identical repeat backups', async () => {
    const h = harness([record('Initial')]); const c = h.make()
    await c.retry(); await c.retry()
    expect(c.state.kind).toBe('ready')
    expect(h.versions).toHaveLength(1)
  })

  it('never replaces nonempty cloud data with an empty startup', async () => {
    const h = harness(); h.remote({ id: 'cloud', createdAt: new Date().toISOString(), backup: backup([record('Cloud')]) })
    const c = h.make(); await c.retry()
    expect(c.state.kind).toBe('conflict'); expect(h.versions).toHaveLength(0)
  })

  it('retains all offline revisions across reload and uploads them in order', async () => {
    const h = harness([record('First')]); let c = h.make(); await c.retry()
    h.offline(true)
    const second = [record('Second')]; h.local(second); c.changed(second); await c.retry()
    const third = [record('Third')]; h.local(third); c.changed(third); await c.retry()
    expect(c.pendingBackups()).toHaveLength(2)
    c.dispose(); c = h.make(); h.offline(false); await c.retry()
    expect(h.versions.map(item => item.backup.records[0].studentName)).toEqual(['First', 'Second', 'Third'])
    expect(c.pendingBackups()).toHaveLength(0); expect(c.state.kind).toBe('ready')
  })

  it('reconciles a committed request whose response was lost without duplicating history', async () => {
    const h = harness([record('Initial')]); let c = h.make(); await c.retry()
    const edited = [record('Edited')]; h.local(edited); h.loseResponse(); c.changed(edited); await c.retry()
    expect(c.state.kind).toBe('error')
    c.dispose(); c = h.make(); await c.retry()
    expect(h.versions).toHaveLength(2); expect(c.state.kind).toBe('ready')
  })

  it('keeps offline edits after reopening before the initial cloud check can succeed', async () => {
    const h = harness([record('Initial')]); let c = h.make(); await c.retry(); c.dispose()
    const latest = h.repository.latest
    h.repository.latest = async () => { throw new Error('offline on reopen') }
    c = h.make(); await c.retry()
    const changed = [record('Offline after reopen')]; h.local(changed); c.changed(changed); await c.retry()
    expect(c.pendingBackups()).toHaveLength(1)
    h.repository.latest = latest; await c.retry()
    expect(h.versions.at(-1)?.backup.records[0].studentName).toBe('Offline after reopen')
    expect(c.state.kind).toBe('ready')
  })

  it('preserves edits arriving during an in-flight write', async () => {
    const h = harness([record('Initial')]); const c = h.make(); await c.retry()
    const save = h.repository.save
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    let entered!: () => void
    const started = new Promise<void>(resolve => { entered = resolve })
    h.repository.save = async (...args) => { entered(); await gate; return save(...args) }
    const second = [record('Second')]; h.local(second); c.changed(second)
    await started
    const third = [record('Third')]; h.local(third); c.changed(third)
    release(); await c.retry()
    expect(h.versions.map(item => item.backup.records[0].studentName)).toEqual(['Initial', 'Second', 'Third'])
  })

  it('allows a deliberate deletion while protecting against lost browser records', async () => {
    const h = harness([record('Initial')]); const c = h.make(); await c.retry()
    h.local([]); c.changed([]); await c.retry()
    expect(h.versions.at(-1)?.backup.records).toEqual([])
    expect(h.versions[0].backup.records).toHaveLength(1)
  })

  it('does not report completion for a save queued during final server confirmation', async () => {
    const h = harness([record('Initial')]); const c = h.make(); await c.retry()
    const latest = h.repository.latest
    let release!: () => void
    let entered!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const started = new Promise<void>(resolve => { entered = resolve })
    let once = true
    h.repository.latest = async () => {
      if (once) { once = false; entered(); await gate }
      return latest()
    }
    const confirmation = c.retry()
    await started
    const edited = [record('During confirmation')]; h.local(edited); c.changed(edited)
    release(); await confirmation; await c.retry()
    expect(c.state.kind).toBe('ready')
    expect(h.versions.at(-1)?.backup.records[0].studentName).toBe('During confirmation')
    expect(c.pendingBackups()).toHaveLength(0)
  })

  it('detects a newer server head and requires an explicit rebase', async () => {
    const h = harness([record('Initial')]); const c = h.make(); await c.retry()
    const remote = { id: 'newer', createdAt: new Date().toISOString(), backup: backup([record('Other device')]) }
    h.remote(remote)
    const edited = [record('Local edit')]; h.local(edited); c.changed(edited); await c.retry()
    expect(c.state.kind).toBe('conflict'); expect(c.pendingBackups()).toHaveLength(1)
    await c.useLocal(remote)
    expect(c.state.kind).toBe('ready'); expect(h.versions.at(-1)?.backup.records[0].studentName).toBe('Local edit')
  })

  it('restores historical content as a new snapshot without rewriting history', async () => {
    const h = harness([record('Initial')]); const c = h.make(); await c.retry()
    const original = h.versions[0]
    const newer = [record('Newer')]; h.local(newer); c.changed(newer); await c.retry()
    const latest = h.versions[1]
    await c.prepareRestore(); h.local(original.backup.records); c.changed(original.backup.records)
    await c.restored(latest)
    expect(h.versions).toHaveLength(3)
    expect(h.versions[1]).toBe(latest)
    expect(h.versions[2].backup.records).toEqual(original.backup.records)
  })

  it('does not transmit a corrupted outbox', async () => {
    const h = harness([record('Initial')]); h.map.set('draft-pattern-log:cloud:v1:user', '{broken')
    const c = h.make(); await c.retry()
    expect(c.state.kind).toBe('error'); expect(h.versions).toHaveLength(0)
  })
})


describe('MBTI cloud snapshot compatibility', () => {
  it('reads old snapshots as unclassified and retains MBTI through backup versions', async () => {
    const current = { ...record('MBTI Student'), mbti: 'xNTJ' as const }
    const { mbti: _mbti, ...legacy } = current
    const parsed = parseSnapshot({ id: 'legacy', created_at: new Date().toISOString(), backup: backup([legacy as ReviewRecordV1]) })
    expect(parsed.backup.records[0].mbti).toBe('')
    const h = harness([current]); const c = h.make(); await c.retry()
    expect(h.versions[0].backup.records[0].mbti).toBe('xNTJ')
    const edited = [{ ...current, mbti: 'xSFP' as const }]
    h.local(edited); c.changed(edited); await c.retry()
    expect(h.versions.at(-1)?.backup.records[0].mbti).toBe('xSFP')
    expect(h.versions[0].backup.records[0].mbti).toBe('xNTJ')
    expect(parseSnapshot({ id: 'current', created_at: new Date().toISOString(), backup: h.versions.at(-1)?.backup }).backup.records).toEqual(edited)
  })
})
