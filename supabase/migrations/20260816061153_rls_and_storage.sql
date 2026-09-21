alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.user_consents enable row level security;
alter table public.categories enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.recipe_steps enable row level security;
alter table public.tags enable row level security;
alter table public.recipe_tags enable row level security;
alter table public.favorites enable row level security;
alter table public.likes enable row level security;
alter table public.collections enable row level security;
alter table public.collection_recipes enable row level security;
alter table public.ocr_imports enable row level security;
alter table public.notices enable row level security;
alter table public.notice_reads enable row level security;
alter table public.reports enable row level security;
alter table public.contact_logs enable row level security;
alter table public.account_deletion_requests enable row level security;
alter table public.admin_actions enable row level security;

create policy profiles_select_own on public.profiles
for select to authenticated using (user_id = auth.uid());
create policy profiles_update_own on public.profiles
for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy profiles_admin_all on public.profiles
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy user_roles_select_own on public.user_roles
for select to authenticated using (user_id = auth.uid());
create policy user_roles_admin_all on public.user_roles
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy user_consents_select_own on public.user_consents
for select to authenticated using (user_id = auth.uid());
create policy user_consents_insert_own on public.user_consents
for insert to authenticated with check (user_id = auth.uid());
create policy user_consents_update_own on public.user_consents
for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy categories_select_active on public.categories
for select to anon, authenticated using (is_active);
create policy categories_admin_all on public.categories
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy recipes_select_public on public.recipes
for select to anon, authenticated
using (visibility = 'public' and status = 'published' and deleted_at is null);
create policy recipes_select_own on public.recipes
for select to authenticated using (owner_user_id = auth.uid());
create policy recipes_select_admin on public.recipes
for select to authenticated using (public.is_admin());
create policy recipes_insert_own on public.recipes
for insert to authenticated
with check (owner_user_id = auth.uid() and public.is_active_member());
create policy recipes_update_own on public.recipes
for update to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid() and public.is_active_member());
create policy recipes_delete_own_trash on public.recipes
for delete to authenticated
using (owner_user_id = auth.uid() and status = 'deleted');
create policy recipes_admin_all on public.recipes
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy ingredients_select_visible_recipe on public.recipe_ingredients
for select to anon, authenticated
using (exists (select 1 from public.recipes r where r.id = recipe_id));
create policy ingredients_insert_owner on public.recipe_ingredients
for insert to authenticated
with check (exists (select 1 from public.recipes r where r.id = recipe_id and r.owner_user_id = auth.uid()));
create policy ingredients_update_owner on public.recipe_ingredients
for update to authenticated
using (exists (select 1 from public.recipes r where r.id = recipe_id and r.owner_user_id = auth.uid()))
with check (exists (select 1 from public.recipes r where r.id = recipe_id and r.owner_user_id = auth.uid()));
create policy ingredients_delete_owner on public.recipe_ingredients
for delete to authenticated
using (exists (select 1 from public.recipes r where r.id = recipe_id and r.owner_user_id = auth.uid()));
create policy ingredients_admin_all on public.recipe_ingredients
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy steps_select_visible_recipe on public.recipe_steps
for select to anon, authenticated
using (exists (select 1 from public.recipes r where r.id = recipe_id));
create policy steps_insert_owner on public.recipe_steps
for insert to authenticated
with check (exists (select 1 from public.recipes r where r.id = recipe_id and r.owner_user_id = auth.uid()));
create policy steps_update_owner on public.recipe_steps
for update to authenticated
using (exists (select 1 from public.recipes r where r.id = recipe_id and r.owner_user_id = auth.uid()))
with check (exists (select 1 from public.recipes r where r.id = recipe_id and r.owner_user_id = auth.uid()));
create policy steps_delete_owner on public.recipe_steps
for delete to authenticated
using (exists (select 1 from public.recipes r where r.id = recipe_id and r.owner_user_id = auth.uid()));
create policy steps_admin_all on public.recipe_steps
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy tags_select_active on public.tags
for select to anon, authenticated using (is_active);
create policy tags_insert_member on public.tags
for insert to authenticated
with check (created_by = auth.uid() and public.is_active_member());
create policy tags_admin_all on public.tags
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy recipe_tags_select_visible_recipe on public.recipe_tags
for select to anon, authenticated
using (exists (select 1 from public.recipes r where r.id = recipe_id));
create policy recipe_tags_insert_owner on public.recipe_tags
for insert to authenticated
with check (exists (select 1 from public.recipes r where r.id = recipe_id and r.owner_user_id = auth.uid()));
create policy recipe_tags_delete_owner on public.recipe_tags
for delete to authenticated
using (exists (select 1 from public.recipes r where r.id = recipe_id and r.owner_user_id = auth.uid()));
create policy recipe_tags_admin_all on public.recipe_tags
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy favorites_select_own on public.favorites
for select to authenticated using (user_id = auth.uid());
create policy favorites_insert_own on public.favorites
for insert to authenticated with check (user_id = auth.uid() and public.is_active_member());
create policy favorites_delete_own on public.favorites
for delete to authenticated using (user_id = auth.uid());
create policy favorites_admin_select on public.favorites
for select to authenticated using (public.is_admin());

create policy likes_select_own on public.likes
for select to authenticated using (user_id = auth.uid());
create policy likes_insert_own on public.likes
for insert to authenticated with check (user_id = auth.uid() and public.is_active_member());
create policy likes_delete_own on public.likes
for delete to authenticated using (user_id = auth.uid());
create policy likes_admin_select on public.likes
for select to authenticated using (public.is_admin());

create policy collections_own_all on public.collections
for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy collections_admin_select on public.collections
for select to authenticated using (public.is_admin());

create policy collection_recipes_select_own on public.collection_recipes
for select to authenticated
using (exists (select 1 from public.collections c where c.id = collection_id and c.user_id = auth.uid()));
create policy collection_recipes_insert_own on public.collection_recipes
for insert to authenticated
with check (
  exists (select 1 from public.collections c where c.id = collection_id and c.user_id = auth.uid())
  and exists (select 1 from public.recipes r where r.id = recipe_id)
);
create policy collection_recipes_delete_own on public.collection_recipes
for delete to authenticated
using (exists (select 1 from public.collections c where c.id = collection_id and c.user_id = auth.uid()));
create policy collection_recipes_admin_select on public.collection_recipes
for select to authenticated using (public.is_admin());

create policy ocr_imports_own_all on public.ocr_imports
for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_active_member());
create policy ocr_imports_admin_select on public.ocr_imports
for select to authenticated using (public.is_admin());

create policy notices_select_public on public.notices
for select to anon
using (
  status = 'published' and audience = 'all' and publish_at <= now()
  and (end_at is null or end_at > now())
);
create policy notices_select_members on public.notices
for select to authenticated
using (
  (status = 'published' and publish_at <= now() and (end_at is null or end_at > now()))
  or public.is_admin()
);
create policy notices_admin_all on public.notices
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy notice_reads_own_all on public.notice_reads
for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notice_reads_admin_select on public.notice_reads
for select to authenticated using (public.is_admin());

create policy reports_select_own on public.reports
for select to authenticated using (reporter_user_id = auth.uid());
create policy reports_insert_own on public.reports
for insert to authenticated
with check (
  reporter_user_id = auth.uid() and status = 'open' and handled_by is null and handled_at is null
  and public.is_active_member()
  and (profile_user_id is null or profile_user_id <> auth.uid())
  and (
    recipe_id is null
    or exists (
      select 1 from public.recipes r
      where r.id = recipe_id and r.visibility = 'public' and r.status = 'published'
        and r.deleted_at is null and r.owner_user_id <> auth.uid()
    )
  )
);
create policy reports_admin_all on public.reports
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy contact_logs_insert_guest on public.contact_logs
for insert to anon with check (user_id is null);
create policy contact_logs_insert_member on public.contact_logs
for insert to authenticated with check (user_id is null or user_id = auth.uid());
create policy contact_logs_admin_select on public.contact_logs
for select to authenticated using (public.is_admin());

create policy deletion_requests_select_own on public.account_deletion_requests
for select to authenticated using (user_id = auth.uid());
create policy deletion_requests_insert_own on public.account_deletion_requests
for insert to authenticated with check (user_id = auth.uid());
create policy deletion_requests_update_own on public.account_deletion_requests
for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy deletion_requests_admin_all on public.account_deletion_requests
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy admin_actions_admin_all on public.admin_actions
for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select on public.categories, public.recipes, public.recipe_ingredients, public.recipe_steps,
  public.tags, public.recipe_tags, public.notices, public.public_profiles, public.recipe_like_counts to anon;
grant select on public.public_profiles, public.recipe_like_counts to authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.user_roles to authenticated;
grant select, insert, update on public.user_consents to authenticated;
grant select on public.categories to authenticated;
grant select, insert, update, delete on public.recipes to authenticated;
grant select, insert, update, delete on public.recipe_ingredients, public.recipe_steps to authenticated;
grant select, insert on public.tags to authenticated;
grant select, insert, delete on public.recipe_tags to authenticated;
grant select, insert, delete on public.favorites, public.likes to authenticated;
grant select, insert, update, delete on public.collections to authenticated;
grant select, insert, delete on public.collection_recipes to authenticated;
grant select, insert, update, delete on public.ocr_imports to authenticated;
grant select, insert, update, delete on public.notices to authenticated;
grant select, insert, update, delete on public.notice_reads to authenticated;
grant select, insert, update on public.reports to authenticated;
grant select, insert on public.contact_logs to authenticated;
grant insert on public.contact_logs to anon;
grant select, insert, update on public.account_deletion_requests to authenticated;
grant select, insert on public.admin_actions to authenticated;

revoke all on function public.is_admin(uuid) from public, anon;
revoke all on function public.is_active_member(uuid) from public, anon;
grant execute on function public.is_admin(uuid) to authenticated;
grant execute on function public.is_active_member(uuid) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('recipe-images', 'recipe-images', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('ocr-imports', 'ocr-imports', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy storage_select_own on storage.objects
for select to authenticated
using (
  bucket_id in ('avatars', 'recipe-images', 'ocr-imports')
  and (storage.foldername(name))[1] = auth.uid()::text
);
create policy storage_insert_own on storage.objects
for insert to authenticated
with check (
  bucket_id in ('avatars', 'recipe-images', 'ocr-imports')
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.is_active_member()
);
create policy storage_update_own on storage.objects
for update to authenticated
using (
  bucket_id in ('avatars', 'recipe-images', 'ocr-imports')
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id in ('avatars', 'recipe-images', 'ocr-imports')
  and (storage.foldername(name))[1] = auth.uid()::text
);
create policy storage_delete_own on storage.objects
for delete to authenticated
using (
  bucket_id in ('avatars', 'recipe-images', 'ocr-imports')
  and (storage.foldername(name))[1] = auth.uid()::text
);
create policy storage_admin_all on storage.objects
for all to authenticated using (public.is_admin()) with check (public.is_admin());
