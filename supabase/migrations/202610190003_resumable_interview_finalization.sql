alter table public.job_interview_ai_runs
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists job_interview_ai_runs_updated_at on public.job_interview_ai_runs;
create trigger job_interview_ai_runs_updated_at before update on public.job_interview_ai_runs
for each row execute function public.set_updated_at();

comment on column public.job_interview_ai_runs.updated_at is 'Heartbeat used to recover an interrupted background-response finalization claim.';
