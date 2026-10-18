create table public.job_tailoring_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  status text not null check (status in ('questions', 'review', 'ready', 'completed', 'discarded', 'superseded')),
  job_fingerprint text not null check (char_length(job_fingerprint) between 1 and 80),
  base_fingerprint text not null check (char_length(base_fingerprint) between 1 and 80),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index job_tailoring_sessions_current_idx
on public.job_tailoring_sessions(user_id, job_id, updated_at desc);

create table public.experience_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  experience_id text not null check (char_length(experience_id) between 1 and 120),
  category text not null check (category in ('responsibility', 'tool', 'method', 'leadership', 'scope', 'domain', 'outcome', 'skill')),
  label text not null default '' check (char_length(label) <= 80),
  statement text not null check (char_length(statement) between 1 and 300),
  search_terms text[] not null default '{}',
  normalized_key text not null check (char_length(normalized_key) between 1 and 220),
  source_job_id uuid references public.jobs(id) on delete set null,
  source_session_id uuid references public.job_tailoring_sessions(id) on delete set null,
  source_question_ids text[] not null default '{}',
  role_fingerprint text not null check (char_length(role_fingerprint) between 1 and 80),
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, experience_id, normalized_key)
);

create index experience_evidence_user_role_idx
on public.experience_evidence(user_id, experience_id, updated_at desc);
create index experience_evidence_terms_idx
on public.experience_evidence using gin(search_terms);

create table public.experience_evidence_digests (
  user_id uuid not null references auth.users(id) on delete cascade,
  experience_id text not null check (char_length(experience_id) between 1 and 120),
  role_fingerprint text not null check (char_length(role_fingerprint) between 1 and 80),
  digest jsonb not null check (jsonb_typeof(digest) = 'object'),
  search_terms text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key(user_id, experience_id)
);

create table public.job_interview_ai_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  phase text not null check (phase in ('analysis', 'synthesis')),
  request_key text not null check (char_length(request_key) between 1 and 160),
  status text not null default 'reserved' check (status in ('reserved', 'completed', 'failed')),
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  failure_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(user_id, request_key)
);

create index job_interview_ai_runs_rate_idx
on public.job_interview_ai_runs(user_id, created_at desc);

create trigger job_tailoring_sessions_updated_at before update on public.job_tailoring_sessions
for each row execute function public.set_updated_at();
create trigger experience_evidence_updated_at before update on public.experience_evidence
for each row execute function public.set_updated_at();
create trigger experience_evidence_digests_updated_at before update on public.experience_evidence_digests
for each row execute function public.set_updated_at();

create or replace function public.reserve_job_interview_ai_run(
  p_target_job_id uuid,
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
  recent_count integer;
begin
  if actor is null then raise exception 'authentication_required'; end if;
  if p_run_phase not in ('analysis', 'synthesis') then raise exception 'invalid_phase'; end if;
  if not exists(select 1 from public.jobs where id = p_target_job_id and user_id = actor)
  then raise exception 'job_not_found'; end if;

  perform pg_advisory_xact_lock(hashtextextended(actor::text, 0));

  select id into existing from public.job_interview_ai_runs
  where user_id = actor and request_key = p_request_key;
  if existing is not null then return existing; end if;

  if exists (
    select 1 from public.job_interview_ai_runs
    where user_id = actor and status = 'reserved' and created_at > now() - interval '5 minutes'
  ) or exists (
    select 1 from public.experience_ai_runs
    where user_id = actor and status = 'reserved' and created_at > now() - interval '5 minutes'
  ) then raise exception 'experience_ai_busy'; end if;

  select
    (select count(*) from public.job_interview_ai_runs where user_id = actor and created_at > now() - interval '1 hour') +
    (select count(*) from public.experience_ai_runs where user_id = actor and created_at > now() - interval '1 hour')
  into recent_count;
  if recent_count >= 20 then raise exception 'experience_ai_rate_limited'; end if;

  insert into public.job_interview_ai_runs(user_id, job_id, phase, request_key)
  values (actor, p_target_job_id, p_run_phase, p_request_key)
  returning id into run_id;
  return run_id;
end;
$$;

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
      output_tokens = greatest(completion_tokens, 0), completed_at = now(), failure_code = null
  where id = run_id and user_id = auth.uid() and status = 'reserved';
$$;

create or replace function public.fail_job_interview_ai_run(run_id uuid, failure_code text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.job_interview_ai_runs
  set status = 'failed', failure_code = left(failure_code, 200), completed_at = now()
  where id = run_id and user_id = auth.uid() and status = 'reserved';
$$;

grant execute on function public.reserve_job_interview_ai_run(uuid, text, text) to authenticated;
grant execute on function public.complete_job_interview_ai_run(uuid, text, integer, integer) to authenticated;
grant execute on function public.fail_job_interview_ai_run(uuid, text) to authenticated;

alter table public.job_tailoring_sessions enable row level security;
alter table public.experience_evidence enable row level security;
alter table public.experience_evidence_digests enable row level security;
alter table public.job_interview_ai_runs enable row level security;

create policy "job_tailoring_sessions_read_own" on public.job_tailoring_sessions
for select using (user_id = auth.uid());
create policy "experience_evidence_read_own" on public.experience_evidence
for select using (user_id = auth.uid());
create policy "experience_evidence_digests_read_own" on public.experience_evidence_digests
for select using (user_id = auth.uid());
create policy "job_interview_ai_runs_read_own_or_admin" on public.job_interview_ai_runs
for select using (user_id = auth.uid() or public.is_admin());

comment on table public.job_tailoring_sessions is 'Resumable job-specific evidence interviews. Raw Q&A remains private and is never replayed into later tailoring prompts.';
comment on table public.experience_evidence is 'Short user-approved role evidence derived from job interviews and reusable across tailoring runs.';
comment on table public.experience_evidence_digests is 'Compact per-role evidence summaries used to limit model input size.';
