create table public.experience_enrichments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  experience_id text not null check (char_length(experience_id) between 1 and 120),
  active_payload jsonb check (active_payload is null or jsonb_typeof(active_payload) = 'object'),
  draft_payload jsonb check (draft_payload is null or jsonb_typeof(draft_payload) = 'object'),
  pending_payload jsonb check (pending_payload is null or jsonb_typeof(pending_payload) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, experience_id)
);

create table public.experience_ai_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  experience_id text not null check (char_length(experience_id) between 1 and 120),
  phase text not null check (phase in ('questions', 'synthesis')),
  request_key text not null check (char_length(request_key) between 1 and 160),
  status text not null default 'reserved' check (status in ('reserved', 'completed', 'failed')),
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  failure_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, request_key)
);

create index experience_enrichments_user_idx on public.experience_enrichments(user_id, updated_at desc);
create index experience_ai_runs_rate_idx on public.experience_ai_runs(user_id, created_at desc);

create trigger experience_enrichments_updated_at before update on public.experience_enrichments
for each row execute function public.set_updated_at();

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
begin
  if actor is null then raise exception 'authentication_required'; end if;
  if p_run_phase not in ('questions', 'synthesis') then raise exception 'invalid_phase'; end if;

  perform pg_advisory_xact_lock(hashtextextended(actor::text, 0));

  select id into existing from public.experience_ai_runs
  where user_id = actor and experience_ai_runs.request_key = p_request_key;
  if existing is not null then return existing; end if;

  if exists (
    select 1 from public.experience_ai_runs
    where user_id = actor and status = 'reserved' and created_at > now() - interval '5 minutes'
  ) then raise exception 'experience_ai_busy'; end if;

  if (select count(*) from public.experience_ai_runs where user_id = actor and created_at > now() - interval '1 hour') >= 20
  then raise exception 'experience_ai_rate_limited'; end if;

  insert into public.experience_ai_runs(user_id, experience_id, phase, request_key)
  values (actor, p_target_experience_id, p_run_phase, p_request_key)
  returning id into run_id;
  return run_id;
end;
$$;

create or replace function public.complete_experience_ai_run(
  run_id uuid,
  model_name text,
  prompt_tokens integer,
  completion_tokens integer
) returns void
language sql
security definer
set search_path = public
as $$
  update public.experience_ai_runs
  set status = 'completed', model = model_name, input_tokens = prompt_tokens,
      output_tokens = completion_tokens, completed_at = now()
  where id = run_id and user_id = auth.uid() and status = 'reserved';
$$;

create or replace function public.fail_experience_ai_run(run_id uuid, failure_code text) returns void
language sql
security definer
set search_path = public
as $$
  update public.experience_ai_runs
  set status = 'failed', failure_code = left(failure_code, 200), completed_at = now()
  where id = run_id and user_id = auth.uid() and status = 'reserved';
$$;

grant execute on function public.reserve_experience_ai_run(text, text, text) to authenticated;
grant execute on function public.complete_experience_ai_run(uuid, text, integer, integer) to authenticated;
grant execute on function public.fail_experience_ai_run(uuid, text) to authenticated;

alter table public.experience_enrichments enable row level security;
alter table public.experience_ai_runs enable row level security;

create policy "experience_enrichments_read_own" on public.experience_enrichments
for select using (user_id = auth.uid());

create policy "experience_ai_runs_read_own_or_admin" on public.experience_ai_runs
for select using (user_id = auth.uid() or public.is_admin());

comment on table public.experience_enrichments is 'Private, user-approved role context and resumable AI interview state; never rendered directly in CV exports.';
comment on table public.experience_ai_runs is 'Metadata-only AI interview usage records for concurrency and rolling abuse protection.';
