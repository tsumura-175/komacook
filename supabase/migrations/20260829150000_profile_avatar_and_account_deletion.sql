alter table public.account_deletion_requests
  add column if not exists last_attempt_at timestamptz,
  add column if not exists attempt_count integer not null default 0 check (attempt_count >= 0);

create or replace function public.claim_due_account_deletions(batch_size integer default 25)
returns table (user_id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;
  return query
  update public.account_deletion_requests as request
  set status = 'processing', last_attempt_at = now(), attempt_count = request.attempt_count + 1, last_error = null
  where request.user_id in (
    select candidate.user_id
    from public.account_deletion_requests as candidate
    where candidate.delete_after <= now()
      and (candidate.status in ('pending', 'failed') or (candidate.status = 'processing' and candidate.last_attempt_at < now() - interval '1 hour'))
    order by candidate.delete_after
    for update skip locked
    limit greatest(1, least(batch_size, 100))
  )
  returning request.user_id;
end;
$$;

revoke all on function public.claim_due_account_deletions(integer) from public, anon, authenticated;
grant execute on function public.claim_due_account_deletions(integer) to service_role;

create policy storage_select_public_profile_avatar on storage.objects
for select to anon, authenticated
using (
  bucket_id = 'avatars'
  and exists (
    select 1 from public.public_profiles
    where public_profiles.avatar_kind = 'upload' and public_profiles.avatar_path = storage.objects.name
  )
);
