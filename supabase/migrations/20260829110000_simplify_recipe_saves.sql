-- 「いいね」と個人コレクションを廃止し、「保存」に一本化する。
-- favorites は保存機能の実体として継続利用する。

drop view if exists public.recipe_like_counts;
drop table if exists public.collection_recipes;
drop table if exists public.collections;
drop table if exists public.likes;

create index if not exists favorites_recipe_idx on public.favorites (recipe_id);

create or replace function public.enforce_recipe_engagement_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  recipe_owner uuid;
begin
  select owner_user_id into recipe_owner
  from public.recipes
  where id = new.recipe_id and visibility = 'public' and status = 'published' and deleted_at is null;
  if not found then
    raise exception 'Only active public recipes can be saved.';
  end if;
  if recipe_owner = new.user_id then
    raise exception 'You cannot save your own recipe.';
  end if;
  return new;
end;
$$;

create view public.recipe_save_counts
with (security_barrier = true)
as
select r.id as recipe_id, count(f.user_id)::integer as save_count
from public.recipes r
left join public.favorites f on f.recipe_id = r.id
where r.visibility = 'public' and r.status = 'published' and r.deleted_at is null
group by r.id;

grant select on public.recipe_save_counts to anon, authenticated;
