alter table public.job_interview_ai_runs
  add column if not exists provider_response_id text,
  add column if not exists provider_status text,
  add column if not exists session_id uuid references public.job_tailoring_sessions(id) on delete set null,
  add column if not exists source_fingerprint text;

update public.job_interview_ai_runs
set status = 'failed', failure_code = 'background_start_interrupted',
    provider_status = coalesce(provider_status, 'failed'), completed_at = now()
where status = 'reserved' and provider_response_id is null
  and created_at < now() - interval '2 minutes';

create unique index if not exists job_interview_ai_runs_provider_response_idx
  on public.job_interview_ai_runs(provider_response_id)
  where provider_response_id is not null;

create unique index if not exists job_interview_ai_runs_one_active_phase_idx
  on public.job_interview_ai_runs(user_id, job_id, phase)
  where status = 'reserved';

create or replace function public.reserve_job_interview_ai_run_v2(
  p_target_job_id uuid,
  p_run_phase text,
  p_request_key text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  existing public.job_interview_ai_runs;
  run_id uuid;
  recent_count integer;
  active_count integer;
begin
  if actor is null then raise exception 'authentication_required'; end if;
  if p_run_phase not in ('analysis', 'synthesis') then raise exception 'invalid_phase'; end if;
  if not exists(select 1 from public.jobs where id = p_target_job_id and user_id = actor)
  then raise exception 'job_not_found'; end if;

  perform pg_advisory_xact_lock(hashtextextended(actor::text, 0));

  select * into existing from public.job_interview_ai_runs
  where user_id = actor and request_key = p_request_key;
  if found then
    return jsonb_build_object('runId', existing.id, 'status', existing.status, 'reused', true);
  end if;

  update public.job_interview_ai_runs
  set status = 'failed', failure_code = 'background_start_interrupted',
      provider_status = coalesce(provider_status, 'failed'), completed_at = now()
  where user_id = actor and status = 'reserved' and provider_response_id is null
    and created_at < now() - interval '2 minutes';

  update public.job_interview_ai_runs
  set status = 'failed', failure_code = 'background_response_expired',
      provider_status = coalesce(provider_status, 'failed'), completed_at = now()
  where user_id = actor and status = 'reserved'
    and created_at < now() - interval '2 hours';

  select * into existing from public.job_interview_ai_runs
  where user_id = actor and job_id = p_target_job_id and phase = p_run_phase and status = 'reserved'
  order by created_at desc limit 1;
  if found then
    return jsonb_build_object('runId', existing.id, 'status', existing.status, 'reused', true);
  end if;

  select
    (select count(*) from public.job_interview_ai_runs
      where user_id = actor and status = 'reserved' and created_at > now() - interval '2 hours') +
    (select count(*) from public.tailor_runs
      where user_id = actor and status = 'reserved' and created_at > now() - interval '2 hours') +
    (select count(*) from public.experience_ai_runs
      where user_id = actor and status = 'reserved' and created_at > now() - interval '5 minutes')
  into active_count;
  if active_count >= 3 then raise exception 'ai_concurrency_limit'; end if;

  select
    (select count(*) from public.job_interview_ai_runs where user_id = actor and created_at > now() - interval '1 hour') +
    (select count(*) from public.experience_ai_runs where user_id = actor and created_at > now() - interval '1 hour')
  into recent_count;
  if recent_count >= 20 then raise exception 'experience_ai_rate_limited'; end if;

  insert into public.job_interview_ai_runs(user_id, job_id, phase, request_key)
  values (actor, p_target_job_id, p_run_phase, p_request_key)
  returning id into run_id;
  return jsonb_build_object('runId', run_id, 'status', 'reserved', 'reused', false);
end;
$$;

grant execute on function public.reserve_job_interview_ai_run_v2(uuid, text, text) to authenticated;

create or replace function public.complete_job_interview_ai_run(
  run_id uuid,
  model_name text,
  prompt_tokens integer,
  completion_tokens integer
) returns void
language sql
security definer
set search_path = public
as $$
  update public.job_interview_ai_runs
  set status = 'completed', model = left(model_name, 100), input_tokens = greatest(prompt_tokens, 0),
      output_tokens = greatest(completion_tokens, 0), provider_status = 'completed',
      completed_at = now(), failure_code = null
  where id = run_id and user_id = auth.uid() and status = 'reserved';
$$;

create or replace function public.fail_job_interview_ai_run(run_id uuid, failure_code text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.job_interview_ai_runs
  set status = 'failed', failure_code = left(failure_code, 200),
      provider_status = coalesce(provider_status, 'failed'), completed_at = now()
  where id = run_id and user_id = auth.uid() and status = 'reserved';
$$;

create or replace function public.reserve_experience_ai_run(
  p_target_experience_id text,
  p_run_phase text,
  p_request_key text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  existing uuid;
  run_id uuid;
  active_count integer;
begin
  if actor is null then raise exception 'authentication_required'; end if;
  if p_run_phase not in ('questions', 'synthesis') then raise exception 'invalid_phase'; end if;

  perform pg_advisory_xact_lock(hashtextextended(actor::text, 0));

  select id into existing from public.experience_ai_runs
  where user_id = actor and experience_ai_runs.request_key = p_request_key;
  if existing is not null then return existing; end if;

  update public.experience_ai_runs
  set status = 'failed', failure_code = 'operation_expired', completed_at = now()
  where user_id = actor and status = 'reserved' and created_at < now() - interval '5 minutes';

  select
    (select count(*) from public.job_interview_ai_runs
      where user_id = actor and status = 'reserved' and created_at > now() - interval '2 hours') +
    (select count(*) from public.tailor_runs
      where user_id = actor and status = 'reserved' and created_at > now() - interval '2 hours') +
    (select count(*) from public.experience_ai_runs
      where user_id = actor and status = 'reserved' and created_at > now() - interval '5 minutes')
  into active_count;
  if active_count >= 3 then raise exception 'ai_concurrency_limit'; end if;

  if (select count(*) from public.experience_ai_runs where user_id = actor and created_at > now() - interval '1 hour') >= 20
  then raise exception 'experience_ai_rate_limited'; end if;

  insert into public.experience_ai_runs(user_id, experience_id, phase, request_key)
  values (actor, p_target_experience_id, p_run_phase, p_request_key)
  returning id into run_id;
  return run_id;
end;
$$;

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
  active_count integer;
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
    and created_at < now() - interval '2 hours';

  select * into existing_run from public.tailor_runs
  where user_id = current_user_id and job_id = target_job_id and status = 'reserved'
  order by created_at desc limit 1;
  if found then
    return jsonb_build_object('runId', existing_run.id, 'status', existing_run.status, 'reused', true);
  end if;

  select
    (select count(*) from public.job_interview_ai_runs
      where user_id = current_user_id and status = 'reserved' and created_at > now() - interval '2 hours') +
    (select count(*) from public.tailor_runs
      where user_id = current_user_id and status = 'reserved' and created_at > now() - interval '2 hours') +
    (select count(*) from public.experience_ai_runs
      where user_id = current_user_id and status = 'reserved' and created_at > now() - interval '5 minutes')
  into active_count;
  if active_count >= 3 then raise exception 'ai_concurrency_limit'; end if;

  quota := public.current_quota_state();
  if (quota ->> 'disabled')::boolean then raise exception 'account_disabled'; end if;
  if (quota ->> 'remaining')::integer <= 0 then raise exception 'quota_exhausted'; end if;

  insert into public.tailor_runs(user_id, job_id, idempotency_key, status)
  values(current_user_id, target_job_id, left(request_key, 200), 'reserved') returning id into new_run_id;
  return jsonb_build_object('runId', new_run_id, 'status', 'reserved', 'reused', false);
end;
$$;

comment on column public.job_interview_ai_runs.provider_response_id is 'OpenAI background Response identifier used to resume evidence analysis or synthesis.';
comment on column public.job_interview_ai_runs.source_fingerprint is 'Fingerprint of the compact inputs used to reject stale background results.';
