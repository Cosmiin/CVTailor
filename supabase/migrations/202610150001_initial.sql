create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  disabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.base_cvs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  document jsonb not null check (jsonb_typeof(document) = 'object'),
  source_path text,
  source_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  url text not null default '',
  title text not null default 'Untitled role',
  company text not null default '',
  description text not null check (char_length(description) between 1 and 100000),
  capture_method text not null check (capture_method in ('url', 'paste', 'extension')),
  latest_tailored_cv jsonb check (latest_tailored_cv is null or jsonb_typeof(latest_tailored_cv) = 'object'),
  template_id text not null default 'clarity' check (template_id in ('clarity', 'compact')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index jobs_user_updated_idx on public.jobs(user_id, updated_at desc);

create table public.tailor_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  idempotency_key text not null,
  status text not null check (status in ('reserved', 'completed', 'failed')),
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(user_id, idempotency_key)
);

create index tailor_runs_user_month_idx on public.tailor_runs(user_id, created_at, status);

create table public.app_settings (
  singleton boolean primary key default true check (singleton),
  global_monthly_limit integer not null default 5 check (global_monthly_limit between 0 and 1000),
  updated_at timestamptz not null default now()
);

insert into public.app_settings(singleton, global_monthly_limit) values (true, 5);

create table public.user_quota_overrides (
  user_id uuid primary key references auth.users(id) on delete cascade,
  monthly_limit integer check (monthly_limit between 0 and 1000),
  disabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger base_cvs_updated_at before update on public.base_cvs for each row execute function public.set_updated_at();
create trigger jobs_updated_at before update on public.jobs for each row execute function public.set_updated_at();
create trigger settings_updated_at before update on public.app_settings for each row execute function public.set_updated_at();
create trigger quota_overrides_updated_at before update on public.user_quota_overrides for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles(id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_admin(check_user uuid default auth.uid())
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists(select 1 from public.admins where user_id = check_user);
$$;

create or replace function public.current_quota_state()
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  month_start timestamptz := date_trunc('month', now() at time zone 'utc') at time zone 'utc';
  next_month timestamptz := (date_trunc('month', now() at time zone 'utc') + interval '1 month') at time zone 'utc';
  quota_limit integer;
  usage_count integer;
  reservation_count integer;
  account_disabled boolean;
begin
  if current_user_id is null then raise exception 'authentication_required'; end if;

  select coalesce(o.monthly_limit, s.global_monthly_limit),
         coalesce(o.disabled, false) or coalesce(p.disabled, false)
  into quota_limit, account_disabled
  from public.app_settings s
  left join public.user_quota_overrides o on o.user_id = current_user_id
  left join public.profiles p on p.id = current_user_id
  where s.singleton = true;

  select count(*) filter (where status = 'completed'),
         count(*) filter (where status = 'reserved')
  into usage_count, reservation_count
  from public.tailor_runs
  where user_id = current_user_id and created_at >= month_start;

  return jsonb_build_object(
    'limit', quota_limit,
    'used', usage_count,
    'reserved', reservation_count,
    'remaining', greatest(quota_limit - usage_count - reservation_count, 0),
    'resetsAt', to_char(next_month at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'disabled', account_disabled
  );
end;
$$;

create or replace function public.reserve_tailor_run(target_job_id uuid, request_key text)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  existing_run public.tailor_runs;
  quota jsonb;
  new_run_id uuid;
begin
  if current_user_id is null then raise exception 'authentication_required'; end if;
  if not exists(select 1 from public.jobs where id = target_job_id and user_id = current_user_id) then
    raise exception 'job_not_found';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 0));
  select * into existing_run from public.tailor_runs
  where user_id = current_user_id and idempotency_key = request_key;
  if found then
    return jsonb_build_object('runId', existing_run.id, 'status', existing_run.status, 'reused', true);
  end if;

  quota := public.current_quota_state();
  if (quota ->> 'disabled')::boolean then raise exception 'account_disabled'; end if;
  if (quota ->> 'remaining')::integer <= 0 then raise exception 'quota_exhausted'; end if;

  insert into public.tailor_runs(user_id, job_id, idempotency_key, status)
  values(current_user_id, target_job_id, left(request_key, 200), 'reserved') returning id into new_run_id;
  return jsonb_build_object('runId', new_run_id, 'status', 'reserved', 'reused', false);
end;
$$;

create or replace function public.complete_tailor_run(run_id uuid, model_name text, prompt_tokens integer, completion_tokens integer)
returns void
language sql
security definer set search_path = ''
as $$
  update public.tailor_runs
  set status = 'completed', model = left(model_name, 100), input_tokens = greatest(prompt_tokens, 0),
      output_tokens = greatest(completion_tokens, 0), completed_at = now(), error_code = null
  where id = run_id and user_id = auth.uid() and status = 'reserved';
$$;

create or replace function public.fail_tailor_run(run_id uuid, failure_code text)
returns void
language sql
security definer set search_path = ''
as $$
  update public.tailor_runs
  set status = 'failed', error_code = left(failure_code, 100), completed_at = now()
  where id = run_id and user_id = auth.uid() and status = 'reserved';
$$;

grant execute on function public.current_quota_state() to authenticated;
grant execute on function public.reserve_tailor_run(uuid, text) to authenticated;
grant execute on function public.complete_tailor_run(uuid, text, integer, integer) to authenticated;
grant execute on function public.fail_tailor_run(uuid, text) to authenticated;

alter table public.profiles enable row level security;
alter table public.base_cvs enable row level security;
alter table public.jobs enable row level security;
alter table public.tailor_runs enable row level security;
alter table public.app_settings enable row level security;
alter table public.user_quota_overrides enable row level security;
alter table public.admins enable row level security;

create policy "profiles_select_own_or_admin" on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "profiles_update_own" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid() and disabled = false);
create policy "profiles_admin_update" on public.profiles for update using (public.is_admin()) with check (public.is_admin());
create policy "base_cvs_own" on public.base_cvs for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "jobs_own" on public.jobs for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "runs_select_own_or_admin" on public.tailor_runs for select using (user_id = auth.uid() or public.is_admin());
create policy "settings_read_authenticated" on public.app_settings for select to authenticated using (true);
create policy "settings_admin_update" on public.app_settings for update using (public.is_admin()) with check (public.is_admin());
create policy "overrides_read_own_or_admin" on public.user_quota_overrides for select using (user_id = auth.uid() or public.is_admin());
create policy "overrides_admin_manage" on public.user_quota_overrides for all using (public.is_admin()) with check (public.is_admin());
create policy "admins_read_self" on public.admins for select using (user_id = auth.uid());

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('cv-originals', 'cv-originals', false, 10485760, array[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]) on conflict (id) do update set public = false, file_size_limit = 10485760;

create policy "cv_originals_select_own" on storage.objects for select to authenticated
using (bucket_id = 'cv-originals' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "cv_originals_insert_own" on storage.objects for insert to authenticated
with check (bucket_id = 'cv-originals' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "cv_originals_update_own" on storage.objects for update to authenticated
using (bucket_id = 'cv-originals' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'cv-originals' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "cv_originals_delete_own" on storage.objects for delete to authenticated
using (bucket_id = 'cv-originals' and (storage.foldername(name))[1] = auth.uid()::text);
