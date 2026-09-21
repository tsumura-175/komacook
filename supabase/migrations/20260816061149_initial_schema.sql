create extension if not exists pgcrypto with schema extensions;

create type public.account_status as enum ('active', 'suspended', 'deletion_pending');
create type public.app_role as enum ('admin');
create type public.avatar_kind as enum ('preset', 'upload');
create type public.recipe_visibility as enum ('public', 'private');
create type public.recipe_status as enum ('draft', 'published', 'deleted');
create type public.recipe_source as enum ('manual', 'copied', 'ocr');
create type public.notice_status as enum ('draft', 'scheduled', 'published', 'hidden');
create type public.notice_audience as enum ('all', 'members');
create type public.report_target as enum ('recipe', 'profile');
create type public.report_reason as enum ('copyright', 'dangerous', 'inappropriate', 'spam', 'other');
create type public.report_status as enum ('open', 'reviewing', 'resolved', 'dismissed');
create type public.ocr_status as enum ('uploaded', 'processing', 'review', 'completed', 'failed', 'expired');
create type public.deletion_status as enum ('pending', 'cancelled', 'processing', 'completed', 'failed');

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name varchar(30) not null default 'こまクックユーザー'
    check (char_length(btrim(display_name)) between 1 and 30),
  standard_servings smallint not null default 2 check (standard_servings between 1 and 20),
  family_adults smallint check (family_adults between 0 and 20),
  family_children smallint check (family_children between 0 and 20),
  show_family boolean not null default false,
  avatar_kind public.avatar_kind not null default 'preset',
  preset_avatar_key varchar(30) not null default 'utensils',
  avatar_color varchar(20) not null default 'coral',
  avatar_path text,
  account_status public.account_status not null default 'active',
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (show_family = false or family_adults is not null or family_children is not null),
  check ((avatar_kind = 'preset' and avatar_path is null) or avatar_kind = 'upload')
);

create table public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table public.user_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  consent_type varchar(30) not null check (char_length(btrim(consent_type)) between 1 and 30),
  document_version varchar(30) not null check (char_length(btrim(document_version)) between 1 and 30),
  accepted boolean not null,
  recorded_at timestamptz not null default now(),
  unique (user_id, consent_type, document_version)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug varchar(40) not null unique check (slug ~ '^[a-z0-9-]+$'),
  name varchar(30) not null unique check (char_length(btrim(name)) between 1 and 30),
  sort_order smallint not null check (sort_order >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users (id) on delete set null,
  category_id uuid not null references public.categories (id) on delete restrict,
  title varchar(100) not null check (char_length(btrim(title)) between 1 and 100),
  description text check (description is null or char_length(description) <= 3000),
  base_servings numeric(5,2) not null default 2 check (base_servings > 0 and base_servings <= 100),
  cooking_time_minutes smallint check (cooking_time_minutes between 1 and 1440),
  calories_per_serving integer check (calories_per_serving between 0 and 10000),
  allergy_notes text check (allergy_notes is null or char_length(allergy_notes) <= 2000),
  visibility public.recipe_visibility not null default 'private',
  status public.recipe_status not null default 'draft',
  source_type public.recipe_source not null default 'manual',
  source_recipe_id uuid references public.recipes (id) on delete set null,
  source_author_user_id uuid references auth.users (id) on delete set null,
  source_name varchar(200),
  source_url text,
  image_path text,
  published_at timestamptz,
  deleted_at timestamptz,
  purge_after timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'draft' or visibility = 'private'),
  check (source_type not in ('copied', 'ocr') or visibility = 'private'),
  check ((status = 'deleted') = (deleted_at is not null)),
  check (purge_after is null or deleted_at is not null),
  check (source_type <> 'copied' or source_recipe_id is not null),
  check (owner_user_id is not null or visibility = 'public')
);

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  name varchar(100) not null check (char_length(btrim(name)) between 1 and 100),
  quantity_value numeric(12,4) check (quantity_value >= 0),
  quantity_display varchar(30),
  quantity_text varchar(30),
  unit varchar(30),
  note varchar(200),
  group_name varchar(50),
  is_scalable boolean not null default true,
  sort_order smallint not null check (sort_order >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (recipe_id, sort_order),
  check (quantity_value is not null or quantity_text is not null),
  check (quantity_value is not null or is_scalable = false)
);

create table public.recipe_steps (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  instruction text not null check (char_length(btrim(instruction)) between 1 and 2000),
  sort_order smallint not null check (sort_order >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (recipe_id, sort_order)
);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  name varchar(20) not null check (char_length(btrim(name)) between 1 and 20),
  normalized_name varchar(20) generated always as (lower(btrim(name))) stored,
  is_active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (normalized_name)
);

create table public.recipe_tags (
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (recipe_id, tag_id)
);

create table public.favorites (
  user_id uuid not null references auth.users (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, recipe_id)
);

create table public.likes (
  user_id uuid not null references auth.users (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, recipe_id)
);

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name varchar(50) not null check (char_length(btrim(name)) between 1 and 50),
  description varchar(200),
  sort_order smallint not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.collection_recipes (
  collection_id uuid not null references public.collections (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (collection_id, recipe_id)
);

create table public.ocr_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source_image_path text,
  status public.ocr_status not null default 'uploaded',
  extracted_data jsonb not null default '{}'::jsonb,
  error_message text,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status not in ('uploaded', 'processing', 'review') or source_image_path is not null)
);

create table public.notices (
  id uuid primary key default gen_random_uuid(),
  title varchar(120) not null check (char_length(btrim(title)) between 1 and 120),
  body text not null check (char_length(btrim(body)) between 1 and 10000),
  status public.notice_status not null default 'draft',
  audience public.notice_audience not null default 'all',
  is_pinned boolean not null default false,
  publish_at timestamptz,
  end_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at is null or publish_at is null or end_at > publish_at)
);

create table public.notice_reads (
  notice_id uuid not null references public.notices (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notice_id, user_id)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null references auth.users (id) on delete cascade,
  target_type public.report_target not null,
  recipe_id uuid references public.recipes (id) on delete cascade,
  profile_user_id uuid references auth.users (id) on delete cascade,
  reason public.report_reason not null,
  detail varchar(500),
  status public.report_status not null default 'open',
  admin_note text,
  handled_by uuid references auth.users (id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (target_type = 'recipe' and recipe_id is not null and profile_user_id is null)
    or (target_type = 'profile' and profile_user_id is not null and recipe_id is null)
  )
);

create table public.contact_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  inquiry_type varchar(50) not null,
  delivery_succeeded boolean not null,
  error_code varchar(100),
  sent_at timestamptz not null default now()
);

create table public.account_deletion_requests (
  user_id uuid primary key references auth.users (id) on delete cascade,
  requested_at timestamptz not null default now(),
  delete_after timestamptz not null default (now() + interval '30 days'),
  status public.deletion_status not null default 'pending',
  cancelled_at timestamptz,
  completed_at timestamptz,
  last_error text,
  check (delete_after >= requested_at and delete_after <= requested_at + interval '30 days')
);

create table public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users (id) on delete restrict,
  action_type varchar(50) not null,
  target_type varchar(50) not null,
  target_id uuid,
  reason text not null check (char_length(btrim(reason)) > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index reports_recipe_reporter_unique
  on public.reports (reporter_user_id, recipe_id) where target_type = 'recipe';
create unique index reports_profile_reporter_unique
  on public.reports (reporter_user_id, profile_user_id) where target_type = 'profile';
create index recipes_public_feed_idx on public.recipes (published_at desc, id) where visibility = 'public' and status = 'published' and deleted_at is null;
create index recipes_owner_updated_idx on public.recipes (owner_user_id, updated_at desc);
create index recipes_category_idx on public.recipes (category_id, published_at desc);
create index recipes_title_lower_idx on public.recipes (lower(title));
create index recipe_ingredients_name_lower_idx on public.recipe_ingredients (lower(name));
create index recipe_tags_tag_idx on public.recipe_tags (tag_id, recipe_id);
create index favorites_user_time_idx on public.favorites (user_id, created_at desc);
create index likes_recipe_time_idx on public.likes (recipe_id, created_at desc);
create index collections_user_order_idx on public.collections (user_id, sort_order, created_at);
create index notices_publish_idx on public.notices (is_pinned desc, publish_at desc) where status = 'published';
create index reports_status_time_idx on public.reports (status, created_at);
create index ocr_imports_expiry_idx on public.ocr_imports (status, expires_at);
create index account_deletion_queue_idx on public.account_deletion_requests (status, delete_after);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (
    new.id,
    left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), 'こまクックユーザー'), 30)
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_admin(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = check_user_id and role = 'admin'
  );
$$;

create or replace function public.is_active_member(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where user_id = check_user_id and account_status = 'active'
  );
$$;

create or replace function public.enforce_recipe_business_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  public_count integer;
  became_public boolean;
begin
  if new.source_type in ('copied', 'ocr') and new.visibility = 'public' then
    raise exception 'Copied and OCR recipes must remain private.';
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
    raise exception 'Only active public recipes can be saved or liked.';
  end if;
  if recipe_owner = new.user_id then
    raise exception 'You cannot save or like your own recipe.';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_recipe_tag_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.recipe_tags where recipe_id = new.recipe_id) >= 10 then
    raise exception 'A recipe can have at most 10 tags.';
  end if;
  return new;
end;
$$;

create trigger recipes_business_rules
before insert or update on public.recipes
for each row execute function public.enforce_recipe_business_rules();
create trigger favorites_business_rules
before insert on public.favorites
for each row execute function public.enforce_recipe_engagement_rules();
create trigger likes_business_rules
before insert on public.likes
for each row execute function public.enforce_recipe_engagement_rules();
create trigger recipe_tags_limit
before insert on public.recipe_tags
for each row execute function public.enforce_recipe_tag_limit();

create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger categories_updated_at before update on public.categories for each row execute function public.set_updated_at();
create trigger recipes_updated_at before update on public.recipes for each row execute function public.set_updated_at();
create trigger ingredients_updated_at before update on public.recipe_ingredients for each row execute function public.set_updated_at();
create trigger steps_updated_at before update on public.recipe_steps for each row execute function public.set_updated_at();
create trigger collections_updated_at before update on public.collections for each row execute function public.set_updated_at();
create trigger ocr_imports_updated_at before update on public.ocr_imports for each row execute function public.set_updated_at();
create trigger notices_updated_at before update on public.notices for each row execute function public.set_updated_at();
create trigger reports_updated_at before update on public.reports for each row execute function public.set_updated_at();

create view public.public_profiles
with (security_barrier = true)
as
select
  user_id,
  display_name,
  avatar_kind,
  preset_avatar_key,
  avatar_color,
  avatar_path,
  case when show_family then family_adults end as family_adults,
  case when show_family then family_children end as family_children,
  created_at
from public.profiles
where account_status = 'active';

create view public.recipe_like_counts
with (security_barrier = true)
as
select r.id as recipe_id, count(l.user_id)::integer as like_count
from public.recipes r
left join public.likes l on l.recipe_id = r.id
where r.visibility = 'public' and r.status = 'published' and r.deleted_at is null
group by r.id;
