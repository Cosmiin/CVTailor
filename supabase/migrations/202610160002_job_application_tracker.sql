alter table public.jobs
  add column application_status text not null default 'not_applied'
    check (application_status in ('not_applied', 'applied', 'response_received', 'interviewing', 'offer', 'rejected', 'withdrawn')),
  add column applied_at timestamptz,
  add column application_status_changed_at timestamptz,
  add column applied_cv jsonb
    check (applied_cv is null or jsonb_typeof(applied_cv) = 'object');

create index jobs_user_application_status_idx
  on public.jobs(user_id, application_status, application_status_changed_at desc);

create or replace function public.track_job_application_status_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.application_status is distinct from old.application_status then
    new.application_status_changed_at = now();
  end if;

  if new.application_status <> 'not_applied' and new.applied_at is null then
    new.applied_at = now();
  end if;

  return new;
end;
$$;

create trigger jobs_application_status_changed
before update of application_status, applied_at on public.jobs
for each row execute function public.track_job_application_status_change();

comment on column public.jobs.application_status is 'User-managed application stage. Applied means waiting for a response.';
comment on column public.jobs.applied_at is 'Date the user reports submitting the application.';
comment on column public.jobs.application_status_changed_at is 'Automatically recorded when the application stage changes.';
comment on column public.jobs.applied_cv is 'Export-safe tailored CV snapshot captured when the application is first marked applied.';
