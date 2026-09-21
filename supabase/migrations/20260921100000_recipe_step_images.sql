-- 工程写真は recipe-images バケットに保存し、工程レコードだけが参照する。
alter table public.recipe_steps add column if not exists image_path text;
alter table public.recipe_steps add constraint recipe_steps_image_path_length_check check (image_path is null or char_length(image_path) <= 500);

create or replace function public.save_recipe(recipe_payload jsonb, ingredient_payload jsonb, step_payload jsonb, tag_payload jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  saved_id uuid := coalesce(nullif(recipe_payload ->> 'id', '')::uuid, gen_random_uuid());
  category_uuid uuid := nullif(recipe_payload ->> 'category_id', '')::uuid;
  requested_source public.recipe_source := coalesce((recipe_payload ->> 'source_type')::public.recipe_source, 'manual');
  requested_status public.recipe_status := (recipe_payload ->> 'status')::public.recipe_status;
  expected_version integer := coalesce(nullif(recipe_payload ->> 'lock_version', '')::integer, 0);
  next_version integer; saved_at timestamptz; existing_owner uuid; existing_version integer; existing_updated_at timestamptz;
  ingredient jsonb; step_item jsonb; tag_name text; tag_uuid uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if requested_status = 'published' and (char_length(btrim(coalesce(recipe_payload ->> 'title', ''))) = 0 or category_uuid is null or jsonb_array_length(ingredient_payload) = 0 or jsonb_array_length(step_payload) = 0) then
    raise exception 'Published recipes require a title, category, ingredient, and step.';
  end if;
  select owner_user_id, lock_version, updated_at into existing_owner, existing_version, existing_updated_at from public.recipes where id = saved_id;
  if existing_owner is null then
    insert into public.recipes (id, owner_user_id, category_id, title, description, base_servings, cooking_time_minutes, calories_per_serving, allergy_notes, visibility, status, source_type)
    values (saved_id, auth.uid(), category_uuid, btrim(coalesce(recipe_payload ->> 'title', '')), nullif(btrim(recipe_payload ->> 'description'), ''), coalesce(nullif(recipe_payload ->> 'base_servings', '')::numeric, 2), nullif(recipe_payload ->> 'cooking_time_minutes', '')::smallint, nullif(recipe_payload ->> 'calories_per_serving', '')::integer, nullif(btrim(recipe_payload ->> 'allergy_notes'), ''), case when requested_status = 'draft' then 'private'::public.recipe_visibility else (recipe_payload ->> 'visibility')::public.recipe_visibility end, requested_status, requested_source)
    returning lock_version, updated_at into next_version, saved_at;
  else
    if existing_owner <> auth.uid() then raise exception 'Recipe not found.'; end if;
    if expected_version = 0 then return jsonb_build_object('id', saved_id, 'lock_version', existing_version, 'updated_at', existing_updated_at); end if;
    update public.recipes set category_id = category_uuid, title = btrim(coalesce(recipe_payload ->> 'title', '')), description = nullif(btrim(recipe_payload ->> 'description'), ''), base_servings = coalesce(nullif(recipe_payload ->> 'base_servings', '')::numeric, 2), cooking_time_minutes = nullif(recipe_payload ->> 'cooking_time_minutes', '')::smallint, calories_per_serving = nullif(recipe_payload ->> 'calories_per_serving', '')::integer, allergy_notes = nullif(btrim(recipe_payload ->> 'allergy_notes'), ''), visibility = case when requested_status = 'draft' then 'private'::public.recipe_visibility else (recipe_payload ->> 'visibility')::public.recipe_visibility end, status = requested_status, lock_version = lock_version + 1
    where id = saved_id and owner_user_id = auth.uid() and lock_version = expected_version and status <> 'deleted'
    returning lock_version, updated_at into next_version, saved_at;
    if not found then raise exception using message = 'recipe_conflict', errcode = '40001'; end if;
    delete from public.recipe_ingredients where recipe_id = saved_id;
    delete from public.recipe_steps where recipe_id = saved_id;
    delete from public.recipe_tags where recipe_id = saved_id;
  end if;
  for ingredient in select value from jsonb_array_elements(ingredient_payload) loop
    insert into public.recipe_ingredients (recipe_id, name, quantity_value, quantity_display, quantity_text, unit, note, group_name, is_scalable, sort_order)
    values (saved_id, btrim(ingredient ->> 'name'), nullif(ingredient ->> 'quantity_value', '')::numeric, nullif(ingredient ->> 'quantity_display', ''), nullif(ingredient ->> 'quantity_text', ''), nullif(btrim(ingredient ->> 'unit'), ''), nullif(btrim(ingredient ->> 'note'), ''), nullif(btrim(ingredient ->> 'group_name'), ''), coalesce((ingredient ->> 'is_scalable')::boolean, true), (ingredient ->> 'sort_order')::smallint);
  end loop;
  for step_item in select value from jsonb_array_elements(step_payload) loop
    insert into public.recipe_steps (recipe_id, instruction, sort_order, image_path)
    values (saved_id, btrim(step_item ->> 'instruction'), (step_item ->> 'sort_order')::smallint, nullif(step_item ->> 'image_path', ''));
  end loop;
  for tag_name in select value #>> '{}' from jsonb_array_elements(tag_payload) loop
    select id into tag_uuid from public.tags where normalized_name = lower(btrim(tag_name));
    if tag_uuid is null then insert into public.tags (name, created_by) values (left(btrim(tag_name), 20), auth.uid()) returning id into tag_uuid; end if;
    insert into public.recipe_tags (recipe_id, tag_id) values (saved_id, tag_uuid) on conflict do nothing; tag_uuid := null;
  end loop;
  select lock_version, updated_at into next_version, saved_at from public.recipes where id = saved_id;
  return jsonb_build_object('id', saved_id, 'lock_version', next_version, 'updated_at', saved_at);
end; $$;

-- コピー先は元投稿者のストレージを参照しない。工程写真もコピーしない。
create or replace function public.copy_recipe(source_id uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare copied_id uuid; source_recipe public.recipes%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  select * into source_recipe from public.recipes where id = source_id and visibility = 'public' and status = 'published' and deleted_at is null;
  if not found or source_recipe.owner_user_id = auth.uid() then raise exception 'Recipe cannot be copied.'; end if;
  insert into public.recipes (owner_user_id, category_id, title, description, base_servings, cooking_time_minutes, calories_per_serving, allergy_notes, visibility, status, source_type, source_recipe_id, source_author_user_id, source_name)
  values (auth.uid(), source_recipe.category_id, source_recipe.title, source_recipe.description, source_recipe.base_servings, source_recipe.cooking_time_minutes, source_recipe.calories_per_serving, source_recipe.allergy_notes, 'private', 'published', 'copied', source_recipe.id, source_recipe.owner_user_id, source_recipe.title) returning id into copied_id;
  insert into public.recipe_ingredients (recipe_id, name, quantity_value, quantity_display, quantity_text, unit, note, group_name, is_scalable, sort_order)
  select copied_id, name, quantity_value, quantity_display, quantity_text, unit, note, group_name, is_scalable, sort_order from public.recipe_ingredients where recipe_id = source_id;
  insert into public.recipe_steps (recipe_id, instruction, sort_order, image_path)
  select copied_id, instruction, sort_order, null from public.recipe_steps where recipe_id = source_id;
  insert into public.recipe_tags (recipe_id, tag_id) select copied_id, tag_id from public.recipe_tags where recipe_id = source_id;
  return copied_id;
end; $$;

drop policy if exists storage_select_public_recipe_image on storage.objects;
create policy storage_select_public_recipe_image on storage.objects for select to anon, authenticated using (
  bucket_id = 'recipe-images' and (
    exists (select 1 from public.recipes r where r.image_path = name and r.visibility = 'public' and r.status = 'published' and r.deleted_at is null)
    or exists (select 1 from public.recipe_steps s join public.recipes r on r.id = s.recipe_id where s.image_path = name and r.visibility = 'public' and r.status = 'published' and r.deleted_at is null)
  )
);

-- 保守ジョブは service_role で工程写真の参照先を列挙する。
grant select on public.recipe_steps to service_role;

comment on column public.recipe_steps.image_path is '工程写真。recipe-images バケットの owner/recipe/steps/UUID.webp を参照する。';
