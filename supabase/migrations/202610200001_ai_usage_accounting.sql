create table public.ai_model_prices (
  model_prefix text primary key check (char_length(model_prefix) between 1 and 100),
  input_usd_per_million numeric(12, 6) not null check (input_usd_per_million >= 0),
  cached_input_usd_per_million numeric(12, 6) not null check (cached_input_usd_per_million >= 0),
  output_usd_per_million numeric(12, 6) not null check (output_usd_per_million >= 0),
  effective_from date not null,
  source_url text not null
);

insert into public.ai_model_prices(
  model_prefix, input_usd_per_million, cached_input_usd_per_million,
  output_usd_per_million, effective_from, source_url
) values
  ('gpt-6.1-sol', 2.00, 0.10, 10.00, '2026-10-20', 'https://developers.openai.com/api/docs/pricing'),
  ('gpt-6-astra', 10.00, 1.00, 50.00, '2026-10-20', 'https://developers.openai.com/api/docs/pricing'),
  ('gpt-6-luna', 0.10, 0.01, 0.50, '2026-10-20', 'https://developers.openai.com/api/docs/pricing'),
  ('gpt-5.6-sol', 4.00, 0.40, 20.00, '2026-10-20', 'https://developers.openai.com/api/docs/pricing'),
  ('gpt-5.4', 2.50, 0.25, 15.00, '2026-10-20', 'https://developers.openai.com/api/docs/pricing')
on conflict (model_prefix) do update set
  input_usd_per_million = excluded.input_usd_per_million,
  cached_input_usd_per_million = excluded.cached_input_usd_per_million,
  output_usd_per_million = excluded.output_usd_per_million,
  effective_from = excluded.effective_from,
  source_url = excluded.source_url;

create table public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_key text not null unique check (char_length(operation_key) between 1 and 200),
  purpose text not null check (purpose in (
    'cv_parsing', 'job_parsing', 'experience_questions', 'experience_synthesis',
    'job_analysis', 'job_synthesis', 'cv_tailoring'
  )),
  model text not null check (char_length(model) between 1 and 100),
  input_tokens integer not null check (input_tokens >= 0),
  cached_input_tokens integer not null default 0 check (cached_input_tokens >= 0 and cached_input_tokens <= input_tokens),
  output_tokens integer not null check (output_tokens >= 0),
  input_usd_per_million numeric(12, 6),
  cached_input_usd_per_million numeric(12, 6),
  output_usd_per_million numeric(12, 6),
  cost_usd numeric(16, 8) check (cost_usd is null or cost_usd >= 0),
  provider_response_id text,
  job_id uuid references public.jobs(id) on delete set null,
  tailor_run_id uuid references public.tailor_runs(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index ai_usage_events_provider_response_idx
  on public.ai_usage_events(provider_response_id)
  where provider_response_id is not null;
create index ai_usage_events_user_created_idx on public.ai_usage_events(user_id, created_at desc);
create index ai_usage_events_job_idx on public.ai_usage_events(job_id, created_at desc) where job_id is not null;

alter table public.ai_model_prices enable row level security;
alter table public.ai_usage_events enable row level security;

create policy "ai_usage_events_read_own_or_admin" on public.ai_usage_events
for select using (user_id = auth.uid() or public.is_admin());

create or replace function public.record_ai_usage(
  p_operation_key text,
  p_user_id uuid,
  p_purpose text,
  p_model text,
  p_input_tokens integer,
  p_cached_input_tokens integer,
  p_output_tokens integer,
  p_provider_response_id text default null,
  p_job_id uuid default null,
  p_tailor_run_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  price public.ai_model_prices;
  usage public.ai_usage_events;
  safe_input integer := greatest(coalesce(p_input_tokens, 0), 0);
  safe_cached integer;
  safe_output integer := greatest(coalesce(p_output_tokens, 0), 0);
  calculated_cost numeric(16, 8);
begin
  safe_cached := least(greatest(coalesce(p_cached_input_tokens, 0), 0), safe_input);

  select * into price
  from public.ai_model_prices
  where p_model = model_prefix or p_model like model_prefix || '-%'
  order by char_length(model_prefix) desc
  limit 1;

  if found then
    calculated_cost := round((
      ((safe_input - safe_cached)::numeric * price.input_usd_per_million) +
      (safe_cached::numeric * price.cached_input_usd_per_million) +
      (safe_output::numeric * price.output_usd_per_million)
    ) / 1000000, 8);
  end if;

  insert into public.ai_usage_events(
    user_id, operation_key, purpose, model, input_tokens, cached_input_tokens, output_tokens,
    input_usd_per_million, cached_input_usd_per_million, output_usd_per_million, cost_usd,
    provider_response_id, job_id, tailor_run_id
  ) values (
    p_user_id, left(p_operation_key, 200), p_purpose, left(p_model, 100), safe_input, safe_cached, safe_output,
    price.input_usd_per_million, price.cached_input_usd_per_million, price.output_usd_per_million, calculated_cost,
    nullif(left(coalesce(p_provider_response_id, ''), 200), ''), p_job_id, p_tailor_run_id
  )
  on conflict (operation_key) do nothing
  returning * into usage;

  if usage.id is null then
    select * into usage from public.ai_usage_events where operation_key = left(p_operation_key, 200);
  end if;

  return jsonb_build_object(
    'id', usage.id,
    'purpose', usage.purpose,
    'model', usage.model,
    'inputTokens', usage.input_tokens,
    'cachedInputTokens', usage.cached_input_tokens,
    'outputTokens', usage.output_tokens,
    'totalTokens', usage.input_tokens + usage.output_tokens,
    'costUsd', usage.cost_usd,
    'createdAt', to_char(usage.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
end;
$$;

revoke all on function public.record_ai_usage(text, uuid, text, text, integer, integer, integer, text, uuid, uuid) from public;
grant execute on function public.record_ai_usage(text, uuid, text, text, integer, integer, integer, text, uuid, uuid) to service_role;

create or replace function public.current_ai_usage_summary()
returns jsonb
language sql
security definer
set search_path = public
as $$
  with own_usage as (
    select * from public.ai_usage_events where user_id = auth.uid()
  ), by_model as (
    select model,
      sum(input_tokens)::bigint as input_tokens,
      sum(output_tokens)::bigint as output_tokens,
      sum(input_tokens + output_tokens)::bigint as total_tokens,
      sum(cost_usd) as cost_usd,
      count(*)::integer as event_count,
      count(*) filter (where cost_usd is null)::integer as unpriced_events
    from own_usage
    group by model
  )
  select jsonb_build_object(
    'inputTokens', coalesce((select sum(input_tokens) from own_usage), 0),
    'outputTokens', coalesce((select sum(output_tokens) from own_usage), 0),
    'totalTokens', coalesce((select sum(input_tokens + output_tokens) from own_usage), 0),
    'costUsd', coalesce((select sum(cost_usd) from own_usage), 0),
    'eventCount', (select count(*) from own_usage),
    'unpricedEvents', (select count(*) from own_usage where cost_usd is null),
    'byModel', coalesce((select jsonb_agg(jsonb_build_object(
      'model', model,
      'inputTokens', input_tokens,
      'outputTokens', output_tokens,
      'totalTokens', total_tokens,
      'costUsd', coalesce(cost_usd, 0),
      'eventCount', event_count,
      'unpricedEvents', unpriced_events
    ) order by cost_usd desc nulls last, model) from by_model), '[]'::jsonb)
  );
$$;

revoke all on function public.current_ai_usage_summary() from public;
grant execute on function public.current_ai_usage_summary() to authenticated;

comment on table public.ai_usage_events is 'Forward-only per-request OpenAI token usage with immutable USD rate snapshots.';
comment on column public.ai_usage_events.cost_usd is 'Estimated token cost using the standard short-context API rate active when the event was recorded.';
