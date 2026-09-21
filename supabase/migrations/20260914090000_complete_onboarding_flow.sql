create or replace function public.has_confirmed_auth_email(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.users
    where id = check_user_id
      and email is not null
      and email_confirmed_at is not null
  );
$$;

create or replace function public.has_required_consents(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct consent_type) = 3
  from public.user_consents
  where user_id = check_user_id
    and accepted = true
    and (consent_type, document_version) in (
      ('terms', '2026-08-16'),
      ('privacy', '2026-08-16'),
      ('guidelines', '2026-08-16')
    );
$$;

create or replace function public.complete_onboarding(
  p_display_name text,
  p_standard_servings smallint,
  p_family_adults smallint,
  p_family_children smallint,
  p_show_family boolean,
  p_avatar_kind text,
  p_preset_avatar_key text,
  p_avatar_color text,
  p_avatar_path text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  email_is_confirmed boolean;
begin
  if current_user_id is null then
    raise exception 'authentication required';
  end if;

  if p_avatar_kind not in ('preset', 'upload')
    or p_preset_avatar_key not in ('utensils', 'carrot', 'apple', 'bread', 'mug', 'bowl', 'cheese', 'cookie')
    or p_avatar_color not in ('coral', 'leaf', 'mustard', 'brown', 'rose', 'blue')
    or (p_avatar_kind = 'preset' and p_avatar_path is not null)
    or (p_avatar_kind = 'upload' and p_avatar_path is null) then
    raise exception 'invalid avatar settings';
  end if;

  insert into public.user_consents (user_id, consent_type, document_version, accepted)
  values
    (current_user_id, 'terms', '2026-08-16', true),
    (current_user_id, 'privacy', '2026-08-16', true),
    (current_user_id, 'guidelines', '2026-08-16', true)
  on conflict (user_id, consent_type, document_version)
  do update set accepted = true, recorded_at = now();

  email_is_confirmed := public.has_confirmed_auth_email(current_user_id);

  update public.profiles
  set display_name = p_display_name,
      standard_servings = p_standard_servings,
      family_adults = p_family_adults,
      family_children = p_family_children,
      show_family = p_show_family,
      avatar_kind = p_avatar_kind::public.avatar_kind,
      preset_avatar_key = p_preset_avatar_key,
      avatar_color = p_avatar_color,
      avatar_path = p_avatar_path,
      onboarding_completed = email_is_confirmed
  where user_id = current_user_id
    and account_status = 'active';

  if not found then
    raise exception 'active profile not found';
  end if;

  return email_is_confirmed;
end;
$$;

create or replace function public.finalize_onboarding_after_email_confirmation()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  can_finish boolean;
begin
  if current_user_id is null then
    return false;
  end if;

  can_finish := public.has_confirmed_auth_email(current_user_id)
    and public.has_required_consents(current_user_id);

  if can_finish then
    update public.profiles
    set onboarding_completed = true
    where user_id = current_user_id
      and account_status = 'active';
    can_finish := found;
  end if;

  return can_finish;
end;
$$;

create or replace function public.enforce_onboarding_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.onboarding_completed and not old.onboarding_completed
    and not (
      public.has_confirmed_auth_email(new.user_id)
      and public.has_required_consents(new.user_id)
    ) then
    raise exception 'onboarding requirements are incomplete';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_onboarding_completion on public.profiles;
create trigger enforce_onboarding_completion
before update of onboarding_completed on public.profiles
for each row execute function public.enforce_onboarding_completion();

create or replace function public.is_active_member(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where user_id = check_user_id
      and account_status = 'active'
      and onboarding_completed = true
  );
$$;

drop policy if exists storage_insert_own on storage.objects;
create policy storage_insert_own on storage.objects
for insert to authenticated
with check (
  bucket_id in ('avatars', 'recipe-images')
  and (storage.foldername(name))[1] = auth.uid()::text
  and (
    (bucket_id = 'avatars' and exists (
      select 1 from public.profiles
      where user_id = auth.uid() and account_status = 'active'
    ))
    or (bucket_id = 'recipe-images' and public.is_active_member())
  )
);

revoke all on function public.has_confirmed_auth_email(uuid) from public, anon;
revoke all on function public.has_required_consents(uuid) from public, anon;
revoke all on function public.complete_onboarding(text, smallint, smallint, smallint, boolean, text, text, text, text) from public, anon;
revoke all on function public.finalize_onboarding_after_email_confirmation() from public, anon;

grant execute on function public.complete_onboarding(text, smallint, smallint, smallint, boolean, text, text, text, text) to authenticated;
grant execute on function public.finalize_onboarding_after_email_confirmation() to authenticated;

