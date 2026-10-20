begin;
select plan(21);

select has_table('public', 'base_cvs', 'base CV table exists');
select has_table('public', 'jobs', 'jobs table exists');
select has_table('public', 'tailor_runs', 'usage audit table exists');
select has_column('public', 'jobs', 'parse_response_id', 'jobs track background parsing responses');
select has_column('public', 'jobs', 'parse_provider_status', 'jobs expose provider parsing state');
select policies_are('public', 'base_cvs', array['base_cvs_own'], 'base CV access is user-scoped');
select policies_are('public', 'jobs', array['jobs_own'], 'job access is user-scoped');
select has_column('public', 'jobs', 'structured_data', 'jobs store validated structured extraction');
select has_column('public', 'jobs', 'parse_status', 'jobs record parsing state');
select has_column('public', 'jobs', 'capture_fingerprint', 'jobs can detect duplicate captures');
select has_column('public', 'job_interview_ai_runs', 'provider_response_id', 'evidence checks track background responses');
select has_column('public', 'job_interview_ai_runs', 'provider_status', 'evidence checks expose provider state');
select has_column('public', 'job_interview_ai_runs', 'session_id', 'evidence runs retain their resumable session');
select has_column('public', 'job_interview_ai_runs', 'source_fingerprint', 'evidence runs reject stale results');
select has_column('public', 'job_interview_ai_runs', 'updated_at', 'evidence runs can recover abandoned finalization claims');
select has_function('public', 'reserve_job_interview_ai_run_v2', array['uuid', 'text', 'text'], 'concurrent evidence reservation function exists');
select has_function('public', 'claim_job_interview_ai_run', array['uuid'], 'evidence finalization uses an atomic recoverable claim');
select has_table('public', 'voice_transcription_runs', 'voice transcription request ledger exists');
select has_column('public', 'voice_transcription_runs', 'audio_bytes', 'voice ledger stores only request metadata');
select has_function('public', 'reserve_voice_transcription', array['integer'], 'voice transcription reservations are rate limited');
select results_eq(
  $$ select global_monthly_limit from public.app_settings where singleton = true $$,
  array[5],
  'default monthly limit is five'
);

select * from finish();
rollback;
