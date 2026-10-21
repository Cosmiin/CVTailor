alter table public.jobs
  add column if not exists parse_finalization_status text,
  add column if not exists parse_finalization_claimed_at timestamptz,
  add column if not exists parse_finalization_attempts integer not null default 0,
  add column if not exists parse_next_check_at timestamptz,
  add column if not exists parse_finalization_error text;

update public.jobs
set parse_finalization_status = case parse_status
  when 'completed' then 'completed'
  when 'failed' then 'failed'
  else 'waiting'
end
where parse_finalization_status is null;

alter table public.jobs
  alter column parse_finalization_status set default 'waiting',
  alter column parse_finalization_status set not null,
  add constraint jobs_parse_finalization_status_check
    check (parse_finalization_status in ('waiting', 'processing', 'completed', 'failed'));

create index if not exists jobs_pending_parse_finalization_idx
  on public.jobs(parse_next_check_at, updated_at)
  where parse_status = 'pending' and parse_response_id is not null;

create table public.openai_response_events (
  webhook_id text primary key check (char_length(webhook_id) between 1 and 200),
  response_id text not null check (char_length(response_id) between 1 and 200),
  event_type text not null check (event_type in (
    'response.completed', 'response.failed', 'response.incomplete', 'response.cancelled'
  )),
  status text not null default 'queued' check (status in (
    'queued', 'processing', 'retry', 'completed', 'failed', 'ignored'
  )),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error_code text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  processed_at timestamptz
);

create index openai_response_events_pending_idx
  on public.openai_response_events(next_attempt_at, created_at)
  where status in ('queued', 'retry');

alter table public.openai_response_events enable row level security;

comment on table public.openai_response_events is
  'Metadata-only durable inbox for verified OpenAI webhook deliveries. Raw payloads and generated content are never stored.';

create or replace function public.claim_job_parse_finalization(p_response_id text)
returns setof public.jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.jobs
  set parse_finalization_status = 'processing',
      parse_finalization_claimed_at = now(),
      parse_finalization_attempts = parse_finalization_attempts + 1,
      parse_next_check_at = null,
      parse_finalization_error = null
  where parse_response_id = p_response_id
    and parse_status = 'pending'
    and (
      parse_finalization_status <> 'processing'
      or parse_finalization_claimed_at is null
      or parse_finalization_claimed_at < now() - interval '2 minutes'
    )
  returning *;
end;
$$;

revoke all on function public.claim_job_parse_finalization(text) from public;
grant execute on function public.claim_job_parse_finalization(text) to service_role;

comment on function public.claim_job_parse_finalization(text) is
  'Atomically claims one pending job parse and recovers finalization abandoned for more than two minutes.';

create or replace function public.claim_openai_response_events(p_limit integer default 10)
returns setof public.openai_response_events
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select webhook_id
    from public.openai_response_events
    where (
      status in ('queued', 'retry') and next_attempt_at <= now()
    ) or (
      status = 'processing' and started_at < now() - interval '2 minutes'
    )
    order by created_at
    for update skip locked
    limit least(greatest(coalesce(p_limit, 10), 1), 50)
  )
  update public.openai_response_events as events
  set status = 'processing',
      attempt_count = events.attempt_count + 1,
      started_at = now(),
      last_error_code = null
  from candidates
  where events.webhook_id = candidates.webhook_id
  returning events.*;
end;
$$;

revoke all on function public.claim_openai_response_events(integer) from public;
grant execute on function public.claim_openai_response_events(integer) to service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'jobs'
  ) then
    alter publication supabase_realtime add table public.jobs;
  end if;
end
$$;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function public.invoke_job_parse_finalizer()
returns void
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  finalizer_url text;
  finalizer_secret text;
begin
  select decrypted_secret into finalizer_url
  from vault.decrypted_secrets where name = 'job_finalizer_url' limit 1;

  select decrypted_secret into finalizer_secret
  from vault.decrypted_secrets where name = 'job_finalizer_secret' limit 1;

  if finalizer_url is null or finalizer_secret is null then
    return;
  end if;

  perform net.http_post(
    url := finalizer_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-job-finalizer-secret', finalizer_secret
    ),
    body := jsonb_build_object('source', 'cron'),
    timeout_milliseconds := 5000
  );
end;
$$;

revoke all on function public.invoke_job_parse_finalizer() from public;
grant execute on function public.invoke_job_parse_finalizer() to service_role;

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname = 'finalize-job-parses' limit 1;
  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
  perform cron.schedule(
    'finalize-job-parses',
    '* * * * *',
    'select public.invoke_job_parse_finalizer();'
  );
end
$$;
