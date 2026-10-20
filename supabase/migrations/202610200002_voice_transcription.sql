create table public.voice_transcription_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'reserved' check (status in ('reserved', 'completed', 'failed')),
  audio_bytes integer not null check (audio_bytes > 0 and audio_bytes <= 10485760),
  model text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index voice_transcription_runs_user_created_idx
  on public.voice_transcription_runs(user_id, created_at desc);

create unique index voice_transcription_runs_one_active_idx
  on public.voice_transcription_runs(user_id)
  where status = 'reserved';

alter table public.voice_transcription_runs enable row level security;

create or replace function public.reserve_voice_transcription(p_audio_bytes integer)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  run_id uuid;
  account_disabled boolean;
begin
  if actor is null then raise exception 'authentication_required'; end if;
  if p_audio_bytes <= 0 or p_audio_bytes > 10485760 then
    raise exception 'voice_transcription_invalid_audio';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(actor::text, 0));

  select coalesce(p.disabled, false) or coalesce(o.disabled, false)
  into account_disabled
  from public.profiles p
  left join public.user_quota_overrides o on o.user_id = p.id
  where p.id = actor;
  if coalesce(account_disabled, false) then raise exception 'account_disabled'; end if;

  update public.voice_transcription_runs
  set status = 'failed', completed_at = now()
  where user_id = actor and status = 'reserved'
    and created_at < now() - interval '2 minutes';

  if exists(
    select 1 from public.voice_transcription_runs
    where user_id = actor and status = 'reserved'
  ) then raise exception 'voice_transcription_busy'; end if;

  if (
    select count(*) from public.voice_transcription_runs
    where user_id = actor and created_at > now() - interval '1 hour'
  ) >= 30 then raise exception 'voice_transcription_rate_limited'; end if;

  insert into public.voice_transcription_runs(user_id, audio_bytes)
  values (actor, p_audio_bytes)
  returning id into run_id;
  return run_id;
end;
$$;

revoke all on function public.reserve_voice_transcription(integer) from public;
grant execute on function public.reserve_voice_transcription(integer) to authenticated;

comment on table public.voice_transcription_runs is
  'Request metadata for interview voice transcription rate limiting; audio and transcripts are never stored.';
