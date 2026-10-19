create or replace function public.claim_job_interview_ai_run(p_run_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;

  update public.job_interview_ai_runs
  set provider_status = 'finalizing'
  where id = p_run_id
    and user_id = auth.uid()
    and status = 'reserved'
    and (
      provider_status is distinct from 'finalizing'
      or updated_at < now() - interval '2 minutes'
    )
  returning id into claimed_id;

  return claimed_id is not null;
end;
$$;

grant execute on function public.claim_job_interview_ai_run(uuid) to authenticated;

comment on function public.claim_job_interview_ai_run(uuid) is
  'Atomically claims evidence finalization, or recovers a claim abandoned for more than two minutes.';
