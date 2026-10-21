alter table public.ai_model_prices
  add column duration_usd_per_minute numeric(12, 6)
  check (duration_usd_per_minute is null or duration_usd_per_minute >= 0);

insert into public.ai_model_prices(
  model_prefix, input_usd_per_million, cached_input_usd_per_million,
  output_usd_per_million, duration_usd_per_minute, effective_from, source_url
) values
  ('gpt-transcribe', 0, 0, 0, 0.004500, '2026-10-21', 'https://developers.openai.com/api/docs/models/gpt-transcribe'),
  ('gpt-4o-transcribe', 2.500000, 0, 10.000000, null, '2026-10-21', 'https://platform.openai.com/pricing'),
  ('gpt-4o-mini-transcribe', 1.250000, 0, 5.000000, null, '2026-10-21', 'https://platform.openai.com/pricing')
on conflict (model_prefix) do update set
  input_usd_per_million = excluded.input_usd_per_million,
  cached_input_usd_per_million = excluded.cached_input_usd_per_million,
  output_usd_per_million = excluded.output_usd_per_million,
  duration_usd_per_minute = excluded.duration_usd_per_minute,
  effective_from = excluded.effective_from,
  source_url = excluded.source_url;

alter table public.ai_usage_events
  drop constraint if exists ai_usage_events_purpose_check;
alter table public.ai_usage_events
  add constraint ai_usage_events_purpose_check check (purpose in (
    'cv_parsing', 'job_parsing', 'experience_questions', 'experience_synthesis',
    'job_analysis', 'job_synthesis', 'cv_tailoring', 'voice_transcription'
  ));

alter table public.ai_usage_events
  add column usage_type text not null default 'tokens'
    check (usage_type in ('tokens', 'duration', 'unknown')),
  add column duration_seconds numeric(12, 3) not null default 0
    check (duration_seconds >= 0),
  add column audio_input_tokens integer not null default 0
    check (audio_input_tokens >= 0),
  add column text_input_tokens integer not null default 0
    check (text_input_tokens >= 0),
  add column duration_usd_per_minute numeric(12, 6)
    check (duration_usd_per_minute is null or duration_usd_per_minute >= 0),
  add constraint ai_usage_events_input_token_details_check
    check (audio_input_tokens + text_input_tokens <= input_tokens);

create or replace function public.record_transcription_usage(
  p_operation_key text,
  p_user_id uuid,
  p_model text,
  p_usage_type text,
  p_input_tokens integer,
  p_audio_input_tokens integer,
  p_text_input_tokens integer,
  p_output_tokens integer,
  p_duration_seconds numeric,
  p_provider_response_id text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  price public.ai_model_prices;
  usage public.ai_usage_events;
  normalized_usage_type text := case when p_usage_type in ('tokens', 'duration') then p_usage_type else 'unknown' end;
  safe_input integer := greatest(coalesce(p_input_tokens, 0), 0);
  safe_audio_input integer;
  safe_text_input integer;
  safe_output integer := greatest(coalesce(p_output_tokens, 0), 0);
  safe_duration numeric(12, 3) := greatest(coalesce(p_duration_seconds, 0), 0);
  calculated_cost numeric(16, 8);
begin
  safe_audio_input := least(greatest(coalesce(p_audio_input_tokens, 0), 0), safe_input);
  safe_text_input := least(
    greatest(coalesce(p_text_input_tokens, 0), 0),
    greatest(safe_input - safe_audio_input, 0)
  );

  select * into price
  from public.ai_model_prices
  where p_model = model_prefix or p_model like model_prefix || '-%'
  order by char_length(model_prefix) desc
  limit 1;

  if normalized_usage_type = 'duration' and price.duration_usd_per_minute is not null then
    calculated_cost := round((safe_duration / 60) * price.duration_usd_per_minute, 8);
  elsif normalized_usage_type = 'tokens' and price.model_prefix is not null
      and price.duration_usd_per_minute is null then
    calculated_cost := round((
      (safe_input::numeric * price.input_usd_per_million) +
      (safe_output::numeric * price.output_usd_per_million)
    ) / 1000000, 8);
  end if;

  insert into public.ai_usage_events(
    user_id, operation_key, purpose, model, usage_type,
    input_tokens, cached_input_tokens, audio_input_tokens, text_input_tokens, output_tokens,
    duration_seconds, input_usd_per_million, cached_input_usd_per_million,
    output_usd_per_million, duration_usd_per_minute, cost_usd, provider_response_id
  ) values (
    p_user_id, left(p_operation_key, 200), 'voice_transcription', left(p_model, 100), normalized_usage_type,
    safe_input, 0, safe_audio_input, safe_text_input, safe_output,
    safe_duration, price.input_usd_per_million, price.cached_input_usd_per_million,
    price.output_usd_per_million, price.duration_usd_per_minute, calculated_cost,
    nullif(left(coalesce(p_provider_response_id, ''), 200), '')
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
    'usageType', usage.usage_type,
    'inputTokens', usage.input_tokens,
    'cachedInputTokens', usage.cached_input_tokens,
    'audioInputTokens', usage.audio_input_tokens,
    'textInputTokens', usage.text_input_tokens,
    'outputTokens', usage.output_tokens,
    'totalTokens', usage.input_tokens + usage.output_tokens,
    'durationSeconds', usage.duration_seconds,
    'costUsd', usage.cost_usd,
    'createdAt', to_char(usage.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
end;
$$;

revoke all on function public.record_transcription_usage(text, uuid, text, text, integer, integer, integer, integer, numeric, text) from public;
grant execute on function public.record_transcription_usage(text, uuid, text, text, integer, integer, integer, integer, numeric, text) to service_role;

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
      sum(duration_seconds) as duration_seconds,
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
    'durationSeconds', coalesce((select sum(duration_seconds) from own_usage), 0),
    'costUsd', coalesce((select sum(cost_usd) from own_usage), 0),
    'eventCount', (select count(*) from own_usage),
    'unpricedEvents', (select count(*) from own_usage where cost_usd is null),
    'byModel', coalesce((select jsonb_agg(jsonb_build_object(
      'model', model,
      'inputTokens', input_tokens,
      'outputTokens', output_tokens,
      'totalTokens', total_tokens,
      'durationSeconds', duration_seconds,
      'costUsd', coalesce(cost_usd, 0),
      'eventCount', event_count,
      'unpricedEvents', unpriced_events
    ) order by cost_usd desc nulls last, model) from by_model), '[]'::jsonb)
  );
$$;

comment on column public.ai_model_prices.duration_usd_per_minute is
  'Duration price snapshot source for transcription models billed per minute.';
comment on column public.ai_usage_events.duration_seconds is
  'Provider-reported billed audio duration; zero for token-billed model calls.';
comment on function public.record_transcription_usage(text, uuid, text, text, integer, integer, integer, integer, numeric, text) is
  'Records provider-reported transcription duration or tokens and snapshots the applicable USD rate.';
