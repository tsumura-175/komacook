create or replace function public.search_public_recipes(
  p_query text default '',
  p_category_id uuid default null,
  p_tags text[] default '{}'::text[],
  p_max_time integer default null,
  p_ingredient text default '',
  p_period_days integer default null,
  p_favorites_only boolean default false,
  p_sort text default 'new',
  p_offset integer default 0,
  p_limit integer default 12
)
returns table (recipe_id uuid, relevance bigint, save_count bigint, total_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with candidates as (
    select
      r.id as recipe_id,
      (
        case when btrim(coalesce(p_query, '')) <> '' and lower(r.title) like '%' || lower(btrim(p_query)) || '%' then 8 else 0 end
        + (select count(*) * 3 from public.recipe_ingredients ri where ri.recipe_id = r.id and lower(ri.name) like '%' || lower(btrim(coalesce(p_query, ''))) || '%')
        + (select count(*) * 2 from public.recipe_tags rt join public.tags t on t.id = rt.tag_id where rt.recipe_id = r.id and lower(t.name) like '%' || lower(btrim(coalesce(p_query, ''))) || '%')
        + case when btrim(coalesce(p_query, '')) <> '' and lower(coalesce(r.description, '')) like '%' || lower(btrim(p_query)) || '%' then 1 else 0 end
      )::bigint as relevance,
      (select count(*) from public.favorites f where f.recipe_id = r.id)::bigint as save_count,
      r.published_at
    from public.recipes r
    where r.visibility = 'public'
      and r.status = 'published'
      and r.deleted_at is null
      and (p_category_id is null or r.category_id = p_category_id)
      and (p_max_time is null or r.cooking_time_minutes <= p_max_time)
      and (btrim(coalesce(p_ingredient, '')) = '' or exists (
        select 1 from public.recipe_ingredients ri
        where ri.recipe_id = r.id and lower(ri.name) like '%' || lower(btrim(p_ingredient)) || '%'
      ))
      and (p_period_days is null or r.published_at >= now() - make_interval(days => p_period_days))
      and (coalesce(cardinality(p_tags), 0) = 0 or not exists (
        select 1 from unnest(p_tags) requested_tag
        where not exists (
          select 1 from public.recipe_tags rt join public.tags t on t.id = rt.tag_id
          where rt.recipe_id = r.id and t.name = requested_tag
        )
      ))
      and (not p_favorites_only or exists (
        select 1 from public.favorites f where f.recipe_id = r.id and f.user_id = (select auth.uid())
      ))
      and (btrim(coalesce(p_query, '')) = '' or not exists (
        select 1
        from unnest(regexp_split_to_array(lower(btrim(p_query)), E'\\s+')) term
        where term <> '' and not (
          lower(r.title) like '%' || term || '%'
          or lower(coalesce(r.description, '')) like '%' || term || '%'
          or exists (select 1 from public.recipe_ingredients ri where ri.recipe_id = r.id and lower(ri.name) like '%' || term || '%')
          or exists (select 1 from public.recipe_tags rt join public.tags t on t.id = rt.tag_id where rt.recipe_id = r.id and lower(t.name) like '%' || term || '%')
        )
      ))
  ), counted as (
    select candidates.*, count(*) over ()::bigint as total_count
    from candidates
  )
  select recipe_id, relevance, save_count, total_count
  from counted
  order by
    case when p_sort = 'relevance' then relevance end desc,
    case when p_sort = 'saves' then save_count end desc,
    published_at desc,
    recipe_id desc
  offset greatest(p_offset, 0)
  limit least(greatest(p_limit, 1), 50);
$$;

revoke all on function public.search_public_recipes(text, uuid, text[], integer, text, integer, boolean, text, integer, integer) from public;
grant execute on function public.search_public_recipes(text, uuid, text[], integer, text, integer, boolean, text, integer, integer) to anon, authenticated;
