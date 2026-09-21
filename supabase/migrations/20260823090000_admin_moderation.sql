alter table public.recipes
  add column moderated_at timestamptz,
  add column moderated_by uuid references auth.users (id) on delete set null,
  add column moderation_reason text check (moderation_reason is null or char_length(btrim(moderation_reason)) between 1 and 1000),
  add column moderation_previous_visibility public.recipe_visibility,
  add constraint recipes_moderation_state_check check (
    (moderated_at is null and moderation_reason is null and moderation_previous_visibility is null)
    or
    (moderated_at is not null and moderation_reason is not null and moderation_previous_visibility is not null)
  );

create index recipes_moderation_idx
  on public.recipes (moderated_at desc)
  where moderated_at is not null;

create or replace function public.admin_list_users(
  search_text text default '',
  status_filter public.account_status default null
)
returns table (
  user_id uuid,
  email text,
  display_name varchar(30),
  account_status public.account_status,
  created_at timestamptz,
  recipe_count bigint,
  public_recipe_count bigint,
  is_admin boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'administrator access required' using errcode = '42501';
  end if;

  return query
  select
    p.user_id,
    u.email::text,
    p.display_name,
    p.account_status,
    p.created_at,
    count(r.id)::bigint,
    count(r.id) filter (
      where r.visibility = 'public'
        and r.status = 'published'
        and r.deleted_at is null
    )::bigint,
    exists (
      select 1
      from public.user_roles ur
      where ur.user_id = p.user_id and ur.role = 'admin'
    )
  from public.profiles p
  join auth.users u on u.id = p.user_id
  left join public.recipes r on r.owner_user_id = p.user_id
  where (status_filter is null or p.account_status = status_filter)
    and (
      nullif(btrim(search_text), '') is null
      or p.display_name ilike '%' || btrim(search_text) || '%'
      or u.email ilike '%' || btrim(search_text) || '%'
    )
  group by p.user_id, u.email, p.display_name, p.account_status, p.created_at
  order by p.created_at desc;
end;
$$;

revoke all on function public.admin_list_users(text, public.account_status) from public, anon;
grant execute on function public.admin_list_users(text, public.account_status) to authenticated;
