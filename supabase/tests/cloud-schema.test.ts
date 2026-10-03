import { readFile, readdir } from 'node:fs/promises'
// Run the migration in isolated Postgres without touching production data.
import { PGlite } from '@electric-sql/pglite'
import { expect, it } from 'vitest'

it('enforces snapshot ownership, immutable history, CAS and idempotent retries in Postgres', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
      grant usage on schema auth, public to anon, authenticated;
      grant execute on function auth.uid(), auth.jwt() to anon, authenticated;
      insert into auth.users values ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002');
    `)
    for (const name of (await readdir('supabase/migrations')).filter(name => name.endsWith('.sql')).sort()) {
      await db.exec(await readFile('supabase/migrations/' + name, 'utf8'))
    }
    const payload = JSON.stringify({ schemaVersion: 1, exportedAt: '2026-10-03T00:00:00.000Z', records: [{ id: 'sample' }] })
    const first = '10000000-0000-0000-0000-000000000001'
    const second = '10000000-0000-0000-0000-000000000002'
    await db.exec(`set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';`)
    const saved = await db.query('select * from public.draft_pattern_save_backup($1, null, $2)', [payload, first])
    expect(saved.rows).toHaveLength(1)
    const retry = await db.query('select * from public.draft_pattern_save_backup($1, null, $2)', [payload, first])
    expect(retry.rows).toEqual(saved.rows)
    await expect(db.query('select * from public.draft_pattern_save_backup($1, null, $2)', [payload, second])).rejects.toThrow('DRAFT_BACKUP_CONFLICT')
    const reused = JSON.stringify({ schemaVersion: 1, exportedAt: '2026-10-03T00:00:00.000Z', records: [] })
    await expect(db.query('select * from public.draft_pattern_save_backup($1, null, $2)', [reused, first])).rejects.toThrow('DRAFT_BACKUP_REQUEST_REUSED')
    await expect(db.query('select * from public.draft_pattern_save_backup($1, $2, $3)', ['{}', first, second])).rejects.toThrow('DRAFT_BACKUP_INVALID_PAYLOAD')
    await expect(db.exec(`delete from public.draft_pattern_backup_snapshots`)).rejects.toThrow('permission denied')
    await expect(db.exec(`update public.draft_pattern_backup_heads set snapshot_id = '${second}'`)).rejects.toThrow('permission denied')
    await expect(db.query('insert into public.draft_pattern_backup_snapshots(id, owner_id, backup) values($1,$2,$3)', [second, '00000000-0000-0000-0000-000000000001', payload])).rejects.toThrow('permission denied')
    await db.exec(`set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';`)
    expect((await db.query('select * from public.draft_pattern_backup_snapshots')).rows).toHaveLength(0)
    expect((await db.query('select * from public.draft_pattern_backup_heads')).rows).toHaveLength(0)
    await db.exec(`set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001'; set request.jwt.claims = '{"is_anonymous":true}';`)
    expect((await db.query('select * from public.draft_pattern_backup_snapshots')).rows).toHaveLength(0)
    await expect(db.query('select * from public.draft_pattern_save_backup($1, $2, $3)', [reused, first, second])).rejects.toThrow('DRAFT_BACKUP_LOGIN_REQUIRED')
    await db.exec(`set request.jwt.claims = '{}';`)
    await db.query('select * from public.draft_pattern_save_backup($1, $2, $3)', [reused, first, second])
    expect((await db.query('select record_count from public.draft_pattern_backup_snapshots order by created_at')).rows).toEqual([{ record_count: 1 }, { record_count: 0 }])
    await db.exec('set role anon;')
    await expect(db.query('select * from public.draft_pattern_backup_snapshots')).rejects.toThrow('permission denied')
    await expect(db.query('select * from public.draft_pattern_save_backup($1, $2, $3)', [payload, second, first])).rejects.toThrow('permission denied')
  } finally { await db.close() }
}, 30_000)
