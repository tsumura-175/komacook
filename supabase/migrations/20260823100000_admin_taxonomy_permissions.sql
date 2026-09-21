-- RLSの管理者ポリシーと組み合わせ、管理画面からのみ分類を変更できるようにする。
grant insert, update on public.categories to authenticated;
grant update on public.tags to authenticated;

create or replace function public.protect_required_categories()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.is_active and not new.is_active then
    if old.slug = 'other' then
      raise exception 'The other category is required by recipe imports.';
    end if;
    if exists (select 1 from public.recipes where category_id = old.id) then
      raise exception 'A category used by recipes cannot be deactivated.';
    end if;
  end if;
  return new;
end;
$$;

create trigger categories_protect_required
before update of is_active on public.categories
for each row execute function public.protect_required_categories();
