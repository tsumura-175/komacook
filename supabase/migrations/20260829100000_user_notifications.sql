create table public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  notification_type varchar(50) not null check (char_length(btrim(notification_type)) between 1 and 50),
  title varchar(120) not null check (char_length(btrim(title)) between 1 and 120),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  target_type varchar(50),
  target_id uuid,
  action_href varchar(500) check (action_href is null or action_href ~ '^/[^/]'),
  email_delivery_status varchar(20) not null default 'not_requested'
    check (email_delivery_status in ('not_requested', 'sent', 'failed')),
  email_sent_at timestamptz,
  email_error_code varchar(100),
  read_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check ((email_delivery_status = 'sent') = (email_sent_at is not null))
);

create index user_notifications_recipient_idx
  on public.user_notifications (user_id, read_at, created_at desc);

alter table public.user_notifications enable row level security;

create policy user_notifications_select_own on public.user_notifications
for select to authenticated using (user_id = auth.uid());

create policy user_notifications_admin_all on public.user_notifications
for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select, insert on public.user_notifications to authenticated;

create or replace function public.mark_user_notification_read(notification_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.user_notifications
  set read_at = coalesce(read_at, now())
  where id = notification_id and user_id = auth.uid();
$$;

create or replace function public.admin_get_user_email(target_user_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_email text;
begin
  if not public.is_admin() then
    raise exception 'administrator access required' using errcode = '42501';
  end if;
  select email into target_email from auth.users where id = target_user_id;
  return target_email;
end;
$$;

revoke all on function public.mark_user_notification_read(uuid) from public, anon;
revoke all on function public.admin_get_user_email(uuid) from public, anon;
grant execute on function public.mark_user_notification_read(uuid) to authenticated;
grant execute on function public.admin_get_user_email(uuid) to authenticated;
