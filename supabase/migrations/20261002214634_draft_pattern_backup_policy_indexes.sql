create index draft_pattern_backup_head_snapshot_idx on public.draft_pattern_backup_heads(owner_id, snapshot_id);
alter policy draft_pattern_backup_read_own on public.draft_pattern_backup_snapshots
  using ((select auth.uid()) = owner_id and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean, false));
alter policy draft_pattern_backup_head_read_own on public.draft_pattern_backup_heads
  using ((select auth.uid()) = owner_id and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean, false));
