alter table public.recipes
  add column if not exists lock_version integer not null default 1;

alter table public.recipes
  drop constraint if exists recipes_lock_version_check,
  add constraint recipes_lock_version_check check (lock_version >= 1);

alter table public.recipes
  drop constraint if exists recipes_title_check;

alter table public.recipes
  add constraint recipes_title_check check (
    char_length(btrim(title)) <= 100
    and (status = 'draft' or char_length(btrim(title)) >= 1)
  );

alter table public.recipes
  alter column category_id drop not null;

alter table public.recipes
  drop constraint if exists recipes_published_required_fields_check,
  add constraint recipes_published_required_fields_check check (
    status <> 'published' or (category_id is not null and char_length(btrim(title)) >= 1)
  );

drop function if exists public.save_recipe(jsonb, jsonb, jsonb, jsonb);

create function public.save_recipe(
  recipe_payload jsonb,
  ingredient_payload jsonb,
  step_payload jsonb,
  tag_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  saved_id uuid := coalesce(nullif(recipe_payload ->> 'id', '')::uuid, gen_random_uuid());
  category_uuid uuid := nullif(recipe_payload ->> 'category_id', '')::uuid;
  requested_source public.recipe_source := coalesce((recipe_payload ->> 'source_type')::public.recipe_source, 'manual');
  requested_status public.recipe_status := (recipe_payload ->> 'status')::public.recipe_status;
  expected_version integer := coalesce(nullif(recipe_payload ->> 'lock_version', '')::integer, 0);
  next_version integer;
  saved_at timestamptz;
  existing_owner uuid;
  existing_version integer;
  existing_updated_at timestamptz;
  ingredient jsonb;
  step_item jsonb;
  tag_name text;
  tag_uuid uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if requested_status = 'published' then
    if char_length(btrim(coalesce(recipe_payload ->> 'title', ''))) = 0
      or category_uuid is null
      or jsonb_array_length(ingredient_payload) = 0
      or jsonb_array_length(step_payload) = 0 then
      raise exception 'Published recipes require a title, category, ingredient, and step.';
    end if;
  end if;

  select owner_user_id, lock_version, updated_at
    into existing_owner, existing_version, existing_updated_at
  from public.recipes
  where id = saved_id;

  if existing_owner is null then
    insert into public.recipes (
      id, owner_user_id, category_id, title, description, base_servings,
      cooking_time_minutes, calories_per_serving, allergy_notes,
      visibility, status, source_type
    ) values (
      saved_id, auth.uid(), category_uuid, btrim(coalesce(recipe_payload ->> 'title', '')),
      nullif(btrim(recipe_payload ->> 'description'), ''),
      coalesce(nullif(recipe_payload ->> 'base_servings', '')::numeric, 2),
      nullif(recipe_payload ->> 'cooking_time_minutes', '')::smallint,
      nullif(recipe_payload ->> 'calories_per_serving', '')::integer,
      nullif(btrim(recipe_payload ->> 'allergy_notes'), ''),
      case when requested_status = 'draft' then 'private'::public.recipe_visibility else (recipe_payload ->> 'visibility')::public.recipe_visibility end,
      requested_status,
      requested_source
    ) returning lock_version, updated_at into next_version, saved_at;
  else
    if existing_owner <> auth.uid() then
      raise exception 'Recipe not found.';
    end if;

    if expected_version = 0 then
      return jsonb_build_object('id', saved_id, 'lock_version', existing_version, 'updated_at', existing_updated_at);
    end if;

    update public.recipes set
      category_id = category_uuid,
      title = btrim(coalesce(recipe_payload ->> 'title', '')),
      description = nullif(btrim(recipe_payload ->> 'description'), ''),
      base_servings = coalesce(nullif(recipe_payload ->> 'base_servings', '')::numeric, 2),
      cooking_time_minutes = nullif(recipe_payload ->> 'cooking_time_minutes', '')::smallint,
      calories_per_serving = nullif(recipe_payload ->> 'calories_per_serving', '')::integer,
      allergy_notes = nullif(btrim(recipe_payload ->> 'allergy_notes'), ''),
      visibility = case when requested_status = 'draft' then 'private'::public.recipe_visibility else (recipe_payload ->> 'visibility')::public.recipe_visibility end,
      status = requested_status,
      lock_version = lock_version + 1
    where id = saved_id
      and owner_user_id = auth.uid()
      and lock_version = expected_version
      and status <> 'deleted'
    returning lock_version, updated_at into next_version, saved_at;

    if not found then
      raise exception using message = 'recipe_conflict', errcode = '40001';
    end if;

    delete from public.recipe_ingredients where recipe_id = saved_id;
    delete from public.recipe_steps where recipe_id = saved_id;
    delete from public.recipe_tags where recipe_id = saved_id;
  end if;

  for ingredient in select value from jsonb_array_elements(ingredient_payload)
  loop
    insert into public.recipe_ingredients (
      recipe_id, name, quantity_value, quantity_display, quantity_text, unit, note, group_name, is_scalable, sort_order
    ) values (
      saved_id,
      btrim(ingredient ->> 'name'),
      nullif(ingredient ->> 'quantity_value', '')::numeric,
      nullif(ingredient ->> 'quantity_display', ''),
      nullif(ingredient ->> 'quantity_text', ''),
      nullif(btrim(ingredient ->> 'unit'), ''),
      nullif(btrim(ingredient ->> 'note'), ''),
      nullif(btrim(ingredient ->> 'group_name'), ''),
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

  select lock_version, updated_at into next_version, saved_at
  from public.recipes where id = saved_id;

  return jsonb_build_object('id', saved_id, 'lock_version', next_version, 'updated_at', saved_at);
end;
$$;

grant execute on function public.save_recipe(jsonb, jsonb, jsonb, jsonb) to authenticated;

comment on column public.recipes.lock_version is 'レシピ編集の楽観ロック。保存成功ごとに1加算する。';
