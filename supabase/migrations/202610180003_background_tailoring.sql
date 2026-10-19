alter table public.tailor_runs
  add column if not exists provider_response_id text,
  add column if not exists provider_status text,
  add column if not exists template_id text check (template_id is null or template_id in ('clarity', 'compact')),
  add column if not exists interview_session_id uuid references public.job_tailoring_sessions(id) on delete set null,
  add column if not exists source_fingerprint text;

with duplicate_reservations as (
  select id, row_number() over (partition by user_id, job_id order by created_at desc, id desc) as position
  from public.tailor_runs
  where status = 'reserved'
)
update public.tailor_runs
set status = 'failed', error_code = 'superseded_reservation', completed_at = now()
where id in (select id from duplicate_reservations where position > 1);

create unique index if not exists tailor_runs_one_active_job_idx
  on public.tailor_runs(user_id, job_id)
  where status = 'reserved';

create unique index if not exists tailor_runs_provider_response_idx
  on public.tailor_runs(provider_response_id)
  where provider_response_id is not null;

create or replace function public.reserve_tailor_run(target_job_id uuid, request_key text)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  existing_run public.tailor_runs;
  quota jsonb;
  new_run_id uuid;
begin
  if current_user_id is null then raise exception 'authentication_required'; end if;
  if not exists(select 1 from public.jobs where id = target_job_id and user_id = current_user_id) then
    raise exception 'job_not_found';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 0));

  select * into existing_run from public.tailor_runs
  where user_id = current_user_id and idempotency_key = request_key;
  if found then
    return jsonb_build_object('runId', existing_run.id, 'status', existing_run.status, 'reused', true);
  end if;

  update public.tailor_runs
  set status = 'failed', error_code = 'background_response_expired', completed_at = now()
  where user_id = current_user_id and job_id = target_job_id and status = 'reserved'
    and created_at < now() - interval '30 minutes';

  select * into existing_run from public.tailor_runs
  where user_id = current_user_id and job_id = target_job_id and status = 'reserved'
  order by created_at desc limit 1;
  if found then
    return jsonb_build_object('runId', existing_run.id, 'status', existing_run.status, 'reused', true);
  end if;

  quota := public.current_quota_state();
  if (quota ->> 'disabled')::boolean then raise exception 'account_disabled'; end if;
  if (quota ->> 'remaining')::integer <= 0 then raise exception 'quota_exhausted'; end if;

  insert into public.tailor_runs(user_id, job_id, idempotency_key, status)
  values(current_user_id, target_job_id, left(request_key, 200), 'reserved') returning id into new_run_id;
  return jsonb_build_object('runId', new_run_id, 'status', 'reserved', 'reused', false);
end;
$$;
