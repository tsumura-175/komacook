create table public.contact_rate_limits (
  identifier_hash text not null check (identifier_hash ~ '^[0-9a-f]{64}$'),
  bucket text not null check (bucket in ('10m', '24h')),
  window_started_at timestamptz not null default now(),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  primary key (identifier_hash, bucket)
);

alter table public.contact_rate_limits enable row level security;

create or replace function public.consume_contact_rate_limit(p_identifier_hash text)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  short_count integer;
  short_start timestamptz;
  daily_count integer;
  daily_start timestamptz;
begin
  if p_identifier_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid contact rate-limit identifier.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_identifier_hash, 0));

  insert into public.contact_rate_limits(identifier_hash, bucket, window_started_at, attempt_count)
  values (p_identifier_hash, '10m', v_now, 1)
  on conflict (identifier_hash, bucket) do update set
    window_started_at = case when public.contact_rate_limits.window_started_at <= v_now - interval '10 minutes' then v_now else public.contact_rate_limits.window_started_at end,
    attempt_count = case when public.contact_rate_limits.window_started_at <= v_now - interval '10 minutes' then 1 else public.contact_rate_limits.attempt_count + 1 end
  returning attempt_count, window_started_at into short_count, short_start;

  insert into public.contact_rate_limits(identifier_hash, bucket, window_started_at, attempt_count)
  values (p_identifier_hash, '24h', v_now, 1)
  on conflict (identifier_hash, bucket) do update set
    window_started_at = case when public.contact_rate_limits.window_started_at <= v_now - interval '24 hours' then v_now else public.contact_rate_limits.window_started_at end,
    attempt_count = case when public.contact_rate_limits.window_started_at <= v_now - interval '24 hours' then 1 else public.contact_rate_limits.attempt_count + 1 end
  returning attempt_count, window_started_at into daily_count, daily_start;

  allowed := short_count <= 3 and daily_count <= 10;
  retry_after_seconds := 0;
  if short_count > 3 then retry_after_seconds := greatest(retry_after_seconds, ceil(extract(epoch from short_start + interval '10 minutes' - v_now))::integer); end if;
  if daily_count > 10 then retry_after_seconds := greatest(retry_after_seconds, ceil(extract(epoch from daily_start + interval '24 hours' - v_now))::integer); end if;
  retry_after_seconds := greatest(retry_after_seconds, 0);
  return next;
end;
$$;

create or replace function public.cleanup_contact_rate_limits()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare deleted_count integer;
begin
  delete from public.contact_rate_limits where window_started_at < now() - interval '2 days';
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on table public.contact_rate_limits from public, anon, authenticated;
revoke all on function public.consume_contact_rate_limit(text) from public;
revoke all on function public.cleanup_contact_rate_limits() from public;
grant execute on function public.consume_contact_rate_limit(text) to anon, authenticated;
grant execute on function public.cleanup_contact_rate_limits() to service_role;
