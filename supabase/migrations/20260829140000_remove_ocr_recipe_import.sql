-- OCRによる画像レシピ取り込み機能を廃止する。
-- 通常のレシピ完成画像とプロフィール画像のアップロードは維持する。

update public.recipes
set source_type = 'manual',
    source_name = null,
    updated_at = now()
where source_type = 'ocr';

drop function if exists public.save_recipe(jsonb, jsonb, jsonb, jsonb);

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.recipes'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%source_type%'
  loop
    execute format('alter table public.recipes drop constraint %I', constraint_name);
  end loop;
end;
$$;

alter table public.recipes alter column source_type drop default;
alter type public.recipe_source rename to recipe_source_with_ocr;
create type public.recipe_source as enum ('manual', 'copied');
alter table public.recipes
  alter column source_type type public.recipe_source
  using (source_type::text::public.recipe_source);
alter table public.recipes alter column source_type set default 'manual';
drop type public.recipe_source_with_ocr;

alter table public.recipes
  add constraint recipes_copied_private_check
  check (source_type <> 'copied' or visibility = 'private');
alter table public.recipes
  add constraint recipes_copied_source_check
  check (source_type <> 'copied' or source_recipe_id is not null);

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
    new.deleted_at = coalesce(new.deleted_at, now());
    new.purge_after = coalesce(new.purge_after, new.deleted_at + interval '30 days');
  elsif tg_op = 'UPDATE' and old.status = 'deleted' then
    new.deleted_at = null;
    new.purge_after = null;
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

create or replace function public.save_recipe(
  recipe_payload jsonb,
  ingredient_payload jsonb,
  step_payload jsonb,
  tag_payload jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  saved_id uuid := nullif(recipe_payload ->> 'id', '')::uuid;
  category_uuid uuid := (recipe_payload ->> 'category_id')::uuid;
  requested_source public.recipe_source := coalesce((recipe_payload ->> 'source_type')::public.recipe_source, 'manual');
  ingredient jsonb;
  step_item jsonb;
  tag_name text;
  tag_uuid uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if saved_id is null then
    insert into public.recipes (
      owner_user_id, category_id, title, description, base_servings,
      cooking_time_minutes, calories_per_serving, allergy_notes,
      visibility, status, source_type
    ) values (
      auth.uid(), category_uuid, btrim(recipe_payload ->> 'title'), nullif(btrim(recipe_payload ->> 'description'), ''),
      (recipe_payload ->> 'base_servings')::numeric,
      nullif(recipe_payload ->> 'cooking_time_minutes', '')::smallint,
      nullif(recipe_payload ->> 'calories_per_serving', '')::integer,
      nullif(btrim(recipe_payload ->> 'allergy_notes'), ''),
      (recipe_payload ->> 'visibility')::public.recipe_visibility,
      (recipe_payload ->> 'status')::public.recipe_status,
      requested_source
    ) returning id into saved_id;
  else
    update public.recipes set
      category_id = category_uuid,
      title = btrim(recipe_payload ->> 'title'),
      description = nullif(btrim(recipe_payload ->> 'description'), ''),
      base_servings = (recipe_payload ->> 'base_servings')::numeric,
      cooking_time_minutes = nullif(recipe_payload ->> 'cooking_time_minutes', '')::smallint,
      calories_per_serving = nullif(recipe_payload ->> 'calories_per_serving', '')::integer,
      allergy_notes = nullif(btrim(recipe_payload ->> 'allergy_notes'), ''),
      visibility = (recipe_payload ->> 'visibility')::public.recipe_visibility,
      status = (recipe_payload ->> 'status')::public.recipe_status
    where id = saved_id and owner_user_id = auth.uid();
    if not found then raise exception 'Recipe not found.'; end if;
    delete from public.recipe_ingredients where recipe_id = saved_id;
    delete from public.recipe_steps where recipe_id = saved_id;
    delete from public.recipe_tags where recipe_id = saved_id;
  end if;

  for ingredient in select value from jsonb_array_elements(ingredient_payload)
  loop
    insert into public.recipe_ingredients (
      recipe_id, name, quantity_value, quantity_display, quantity_text, unit, note, is_scalable, sort_order
    ) values (
      saved_id,
      btrim(ingredient ->> 'name'),
      nullif(ingredient ->> 'quantity_value', '')::numeric,
      nullif(ingredient ->> 'quantity_display', ''),
      nullif(ingredient ->> 'quantity_text', ''),
      nullif(ingredient ->> 'unit', ''),
      nullif(btrim(ingredient ->> 'note'), ''),
      coalesce((ingredient ->> 'is_scalable')::boolean, true),
      (ingredient ->> 'sort_order')::smallint
    );
  end loop;

  for step_item in select value from jsonb_array_elements(step_payload)
  loop
    insert into public.recipe_steps (recipe_id, instruction, sort_order)
    values (saved_id, btrim(step_item ->> 'instruction'), (step_item ->> 'sort_order')::smallint);
  end loop;

  for tag_name in select value #>> '{}' from jsonb_array_elements(tag_payload)
  loop
    select id into tag_uuid from public.tags where normalized_name = lower(btrim(tag_name));
    if tag_uuid is null then
      insert into public.tags (name, created_by) values (left(btrim(tag_name), 20), auth.uid()) returning id into tag_uuid;
    end if;
    insert into public.recipe_tags (recipe_id, tag_id) values (saved_id, tag_uuid) on conflict do nothing;
    tag_uuid := null;
  end loop;

  return saved_id;
end;
$$;

grant execute on function public.save_recipe(jsonb, jsonb, jsonb, jsonb) to authenticated;

drop table if exists public.ocr_imports;
drop type if exists public.ocr_status;

drop policy if exists storage_select_own on storage.objects;
drop policy if exists storage_insert_own on storage.objects;
drop policy if exists storage_update_own on storage.objects;
drop policy if exists storage_delete_own on storage.objects;

-- Storageの保護トリガーへマイグレーション中の意図的な削除であることを通知する。
select set_config('storage.allow_delete_query', 'true', true);
delete from storage.objects where bucket_id = 'ocr-imports';
delete from storage.buckets where id = 'ocr-imports';

create policy storage_select_own on storage.objects
for select to authenticated
using (
  bucket_id in ('avatars', 'recipe-images')
  and (storage.foldername(name))[1] = auth.uid()::text
);
create policy storage_insert_own on storage.objects
for insert to authenticated
with check (
  bucket_id in ('avatars', 'recipe-images')
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.is_active_member()
);
create policy storage_update_own on storage.objects
for update to authenticated
using (
  bucket_id in ('avatars', 'recipe-images')
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id in ('avatars', 'recipe-images')
  and (storage.foldername(name))[1] = auth.uid()::text
);
create policy storage_delete_own on storage.objects
for delete to authenticated
using (
  bucket_id in ('avatars', 'recipe-images')
  and (storage.foldername(name))[1] = auth.uid()::text
);
