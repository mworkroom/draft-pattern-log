import { createClient } from '@supabase/supabase-js'
import { parseSnapshot, type CloudRepository, type CloudSnapshot } from './cloudBackup'

const env = (import.meta as ImportMeta & { env: Record<string, string | undefined> }).env
const url = env.VITE_SUPABASE_URL
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY

export const supabase = url && key ? createClient(url, key, {
  auth: { storageKey: 'draft-pattern-log:auth:v1', detectSessionInUrl: true, flowType: 'pkce' },
  global: { fetch: (input, options) => fetch(input, {
    ...options, signal: options?.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000),
  }) },
}) : null

function client() {
  if (!supabase) throw new Error('클라우드 연결 설정이 없습니다.')
  return supabase
}

export const cloudRepository: CloudRepository = {
  async latest() {
    const { data, error } = await client().from('draft_pattern_backup_heads')
      .select('snapshot:draft_pattern_backup_snapshots!draft_pattern_backup_heads_snapshot_fkey(id,created_at,backup)').maybeSingle()
    if (error) throw new Error(error.message)
    return data ? parseSnapshot(data.snapshot) : null
  },
  async save(backup, expectedId, requestId) {
    const { data, error } = await client().rpc('draft_pattern_save_backup', {
      p_backup: backup, p_expected_id: expectedId, p_request_id: requestId,
    })
    if (error) throw new Error(error.message)
    if (!Array.isArray(data) || data.length !== 1) throw new Error('클라우드 저장 확인을 받지 못했습니다.')
    return parseSnapshot(data[0])
  },
}

export interface SnapshotSummary { id: string; createdAt: string; recordCount: number }

export async function listCloudHistory(): Promise<SnapshotSummary[]> {
  const { data, error } = await client().from('draft_pattern_backup_snapshots')
    .select('id,created_at,record_count').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(50)
  if (error) throw new Error(error.message)
  return data.map(row => ({ id: row.id, createdAt: row.created_at, recordCount: row.record_count }))
}

export async function readCloudSnapshot(id: string): Promise<CloudSnapshot> {
  const { data, error } = await client().from('draft_pattern_backup_snapshots').select('id,created_at,backup').eq('id', id).single()
  if (error) throw new Error(error.message)
  return parseSnapshot(data)
}
