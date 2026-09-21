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

create or replace function public.copy_recipe(source_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  copied_id uuid;
  source_recipe public.recipes%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  select * into source_recipe from public.recipes
  where id = source_id and visibility = 'public' and status = 'published' and deleted_at is null;
  if not found or source_recipe.owner_user_id = auth.uid() then raise exception 'Recipe cannot be copied.'; end if;

  insert into public.recipes (
    owner_user_id, category_id, title, description, base_servings, cooking_time_minutes,
    calories_per_serving, allergy_notes, visibility, status, source_type,
    source_recipe_id, source_author_user_id, source_name
  ) values (
    auth.uid(), source_recipe.category_id, source_recipe.title, source_recipe.description,
    source_recipe.base_servings, source_recipe.cooking_time_minutes, source_recipe.calories_per_serving,
    source_recipe.allergy_notes, 'private', 'published', 'copied', source_recipe.id,
    source_recipe.owner_user_id, source_recipe.title
  ) returning id into copied_id;

  insert into public.recipe_ingredients (recipe_id, name, quantity_value, quantity_display, quantity_text, unit, note, group_name, is_scalable, sort_order)
  select copied_id, name, quantity_value, quantity_display, quantity_text, unit, note, group_name, is_scalable, sort_order
  from public.recipe_ingredients where recipe_id = source_id;
  insert into public.recipe_steps (recipe_id, instruction, sort_order)
  select copied_id, instruction, sort_order from public.recipe_steps where recipe_id = source_id;
  insert into public.recipe_tags (recipe_id, tag_id)
  select copied_id, tag_id from public.recipe_tags where recipe_id = source_id;
  return copied_id;
end;
$$;

grant execute on function public.save_recipe(jsonb, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.copy_recipe(uuid) to authenticated;

create policy storage_select_public_recipe_image on storage.objects
for select to anon, authenticated
using (
  bucket_id = 'recipe-images'
  and exists (
    select 1 from public.recipes r
    where r.image_path = name and r.visibility = 'public' and r.status = 'published' and r.deleted_at is null
  )
);
