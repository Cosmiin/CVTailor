alter table public.job_tailoring_sessions
add column if not exists completed_at timestamptz;
