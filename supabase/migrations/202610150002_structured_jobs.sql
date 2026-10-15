alter table public.jobs
  add column structured_data jsonb check (structured_data is null or jsonb_typeof(structured_data) = 'object'),
  add column location text not null default '',
  add column date_posted date,
  add column employment_type text,
  add column seniority text,
  add column salary_min numeric,
  add column salary_max numeric,
  add column salary_currency text,
  add column salary_period text check (salary_period is null or salary_period in ('hour', 'day', 'month', 'year')),
  add column source_language text,
  add column parse_status text not null default 'pending' check (parse_status in ('pending', 'completed', 'failed')),
  add column parse_warnings jsonb not null default '[]'::jsonb check (jsonb_typeof(parse_warnings) = 'array'),
  add column parsed_at timestamptz,
  add column parser_model text,
  add column parser_version text,
  add column capture_fingerprint text;

create index jobs_user_fingerprint_idx on public.jobs(user_id, capture_fingerprint)
  where capture_fingerprint is not null;

comment on column public.jobs.structured_data is 'Validated JobSnapshot v2 extraction in the source language.';
comment on column public.jobs.parse_status is 'AI extraction state; independent of CV tailoring quota.';
