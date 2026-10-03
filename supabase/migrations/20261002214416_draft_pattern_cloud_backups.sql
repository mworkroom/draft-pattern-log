-- App-specific immutable snapshots. Other mworkroom apps are not modified.
create table public.draft_pattern_backup_snapshots (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  backup jsonb not null,
  record_count integer generated always as (jsonb_array_length(backup->'records')) stored,
  constraint draft_pattern_backup_owner_id_key unique (owner_id, id),
  constraint draft_pattern_backup_shape check (
    jsonb_typeof(backup) = 'object' and backup->'schemaVersion' = '1'::jsonb
    and jsonb_typeof(backup->'records') is not distinct from 'array'
    and jsonb_typeof(backup->'exportedAt') is not distinct from 'string'
    and pg_column_size(backup) <= 5242880
  )
);
create index draft_pattern_backup_owner_history_idx
  on public.draft_pattern_backup_snapshots (owner_id, created_at desc, id desc);

create table public.draft_pattern_backup_heads (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  snapshot_id uuid not null,
  constraint draft_pattern_backup_heads_snapshot_fkey foreign key (owner_id, snapshot_id)
    references public.draft_pattern_backup_snapshots(owner_id, id)
);

alter table public.draft_pattern_backup_snapshots enable row level security;
alter table public.draft_pattern_backup_heads enable row level security;
revoke all on public.draft_pattern_backup_snapshots, public.draft_pattern_backup_heads from anon, authenticated;
grant select on public.draft_pattern_backup_snapshots, public.draft_pattern_backup_heads to authenticated;
create policy draft_pattern_backup_read_own on public.draft_pattern_backup_snapshots
  for select to authenticated using ((select auth.uid()) = owner_id and not coalesce((select auth.jwt()->>'is_anonymous')::boolean, false));
create policy draft_pattern_backup_head_read_own on public.draft_pattern_backup_heads
  for select to authenticated using ((select auth.uid()) = owner_id and not coalesce((select auth.jwt()->>'is_anonymous')::boolean, false));

-- A guarded definer is needed because browser roles have no direct write/delete grant.
-- One atomic RPC validates ownership, serializes first inserts, checks the expected head,
-- and appends history before updating the pointer. Request IDs make retries idempotent.
create function public.draft_pattern_save_backup(p_backup jsonb, p_expected_id uuid, p_request_id uuid)
returns table(id uuid, created_at timestamptz, backup jsonb)
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_head uuid;
  v_previous jsonb;
  v_existing jsonb;
begin
  if v_user is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    raise exception 'DRAFT_BACKUP_LOGIN_REQUIRED' using errcode = '42501';
  end if;
  if p_request_id is null or p_backup is null
    or jsonb_typeof(p_backup) is distinct from 'object'
    or p_backup->'schemaVersion' is distinct from '1'::jsonb
    or jsonb_typeof(p_backup->'records') is distinct from 'array'
    or jsonb_typeof(p_backup->'exportedAt') is distinct from 'string'
    or octet_length(p_backup::text) > 5242880 then
    raise exception 'DRAFT_BACKUP_INVALID_PAYLOAD' using errcode = '22023';
  end if;
  -- An invalid export timestamp must fail before moving the current head.
  perform (p_backup->>'exportedAt')::timestamptz;
  perform pg_advisory_xact_lock(hashtextextended('draft_pattern_backup:' || v_user::text, 0));
  select s.backup into v_existing from public.draft_pattern_backup_snapshots s where s.id = p_request_id and s.owner_id = v_user;
  if found then
    if v_existing->'records' is distinct from p_backup->'records' then
      raise exception 'DRAFT_BACKUP_REQUEST_REUSED' using errcode = '22023';
    end if;
    return query select s.id, s.created_at, s.backup from public.draft_pattern_backup_snapshots s where s.id = p_request_id and s.owner_id = v_user;
    return;
  end if;
  select h.snapshot_id into v_head from public.draft_pattern_backup_heads h where h.owner_id = v_user;
  if v_head is distinct from p_expected_id then
    raise exception 'DRAFT_BACKUP_CONFLICT' using errcode = 'P0001';
  end if;
  if v_head is not null then
    select s.backup into v_previous from public.draft_pattern_backup_snapshots s where s.id = v_head and s.owner_id = v_user;
    if v_previous->'records' = p_backup->'records' then
      return query select s.id, s.created_at, s.backup from public.draft_pattern_backup_snapshots s where s.id = v_head and s.owner_id = v_user;
      return;
    end if;
  end if;
  insert into public.draft_pattern_backup_snapshots(id, owner_id, parent_id, backup)
    values(p_request_id, v_user, v_head, p_backup);
  insert into public.draft_pattern_backup_heads(owner_id, snapshot_id) values(v_user, p_request_id)
    on conflict (owner_id) do update set snapshot_id = excluded.snapshot_id;
  return query select s.id, s.created_at, s.backup from public.draft_pattern_backup_snapshots s where s.id = p_request_id and s.owner_id = v_user;
end;
$$;
revoke all on function public.draft_pattern_save_backup(jsonb, uuid, uuid) from public, anon, authenticated;
grant execute on function public.draft_pattern_save_backup(jsonb, uuid, uuid) to authenticated;

comment on table public.draft_pattern_backup_snapshots is 'Draft Pattern Log: private immutable full JSON backups. Clients cannot update or delete history.';
comment on table public.draft_pattern_backup_heads is 'Draft Pattern Log: latest confirmed snapshot per account; only the guarded save RPC moves this pointer.';
