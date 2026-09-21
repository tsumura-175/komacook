alter table public.recipes
  add column if not exists trashed_from_status public.recipe_status,
  add column if not exists purge_claimed_at timestamptz,
  add column if not exists purge_attempt_count integer not null default 0 check (purge_attempt_count >= 0),
  add column if not exists purge_last_error text;

update public.recipes
set trashed_from_status = 'published'
where status = 'deleted' and trashed_from_status is null;

alter table public.recipes
  add constraint recipes_trashed_from_status_check
  check (
    (status = 'deleted' and trashed_from_status in ('draft', 'published'))
    or (status <> 'deleted' and trashed_from_status is null)
  );

create or replace function public.enforce_recipe_business_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  public_count integer;
  became_public boolean;
begin
  if new.source_type = 'copied' and new.visibility = 'public' then
    raise exception 'Copied recipes must remain private.';
  end if;

  if new.status = 'published' and new.published_at is null then
    new.published_at = now();
  end if;

  if new.status = 'deleted' then
    if tg_op = 'INSERT' then
      new.trashed_from_status = coalesce(new.trashed_from_status, 'published'::public.recipe_status);
    elsif old.status <> 'deleted' then
      new.trashed_from_status = old.status;
    end if;
    new.deleted_at = coalesce(new.deleted_at, now());
    new.purge_after = coalesce(new.purge_after, new.deleted_at + interval '30 days');
  elsif tg_op = 'UPDATE' and old.status = 'deleted' then
    new.deleted_at = null;
    new.purge_after = null;
    new.trashed_from_status = null;
    new.purge_claimed_at = null;
    new.purge_attempt_count = 0;
    new.purge_last_error = null;
  end if;

  became_public := new.visibility = 'public' and new.status = 'published'
    and (tg_op = 'INSERT' or old.visibility <> 'public' or old.status <> 'published');

  if became_public and new.owner_user_id is not null then
    select count(*) into public_count
    from public.recipes
    where owner_user_id = new.owner_user_id
      and visibility = 'public'
      and status = 'published'
      and timezone('Asia/Tokyo', coalesce(published_at, created_at))::date = timezone('Asia/Tokyo', now())::date;
    if public_count >= 20 then
      raise exception 'Daily public recipe limit reached.';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.move_recipe_to_trash(target_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.recipes
  set status = 'deleted'
  where id = target_id
    and owner_user_id = auth.uid()
    and status in ('draft', 'published');
  return found;
end;
$$;

create or replace function public.restore_recipe(target_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.recipes
  set status = coalesce(trashed_from_status, 'published'::public.recipe_status)
  where id = target_id
    and owner_user_id = auth.uid()
    and status = 'deleted'
    and purge_after > now();
  return found;
end;
$$;

create or replace function public.claim_due_recipe_deletions(batch_size integer default 100)
returns table(recipe_id uuid, image_path text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;
  return query
  update public.recipes as recipe
  set purge_claimed_at = now(),
      purge_attempt_count = recipe.purge_attempt_count + 1,
      purge_last_error = null
  where recipe.id in (
    select candidate.id
    from public.recipes as candidate
    where candidate.status = 'deleted'
      and candidate.purge_after <= now()
      and (candidate.purge_claimed_at is null or candidate.purge_claimed_at < now() - interval '1 hour')
    order by candidate.purge_after
    for update skip locked
    limit greatest(1, least(coalesce(batch_size, 100), 500))
  )
  returning recipe.id, recipe.image_path;
end;
$$;

revoke all on function public.move_recipe_to_trash(uuid) from public, anon;
revoke all on function public.restore_recipe(uuid) from public, anon;
grant execute on function public.move_recipe_to_trash(uuid) to authenticated;
grant execute on function public.restore_recipe(uuid) to authenticated;
revoke all on function public.claim_due_recipe_deletions(integer) from public, anon, authenticated;
grant execute on function public.claim_due_recipe_deletions(integer) to service_role;
