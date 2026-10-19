alter table public.jobs
  add column if not exists parse_response_id text,
  add column if not exists parse_provider_status text;

create unique index if not exists jobs_parse_response_idx
  on public.jobs(parse_response_id)
  where parse_response_id is not null;

comment on column public.jobs.parse_response_id is 'OpenAI background Response identifier for resumable job parsing.';
comment on column public.jobs.parse_provider_status is 'Latest provider-side state for the background parsing response.';
