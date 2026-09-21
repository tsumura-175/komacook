create or replace function public.list_stale_recipe_image_staging(batch_size integer default 100)
returns table(object_name text)
language sql
security definer
set search_path = ''
as $$
  select objects.name
  from storage.objects as objects
  where objects.bucket_id = 'recipe-images'
    and objects.name ~ '^[0-9a-fA-F-]{36}/staging/[0-9a-fA-F-]{36}\.(jpg|png|webp)$'
    and objects.created_at < now() - interval '24 hours'
  order by objects.created_at
  limit greatest(1, least(coalesce(batch_size, 100), 500));
$$;

revoke all on function public.list_stale_recipe_image_staging(integer) from public, anon, authenticated;
grant execute on function public.list_stale_recipe_image_staging(integer) to service_role;

