begin;
select plan(9);

select has_table('public', 'base_cvs', 'base CV table exists');
select has_table('public', 'jobs', 'jobs table exists');
select has_table('public', 'tailor_runs', 'usage audit table exists');
select policies_are('public', 'base_cvs', array['base_cvs_own'], 'base CV access is user-scoped');
select policies_are('public', 'jobs', array['jobs_own'], 'job access is user-scoped');
select has_column('public', 'jobs', 'structured_data', 'jobs store validated structured extraction');
select has_column('public', 'jobs', 'parse_status', 'jobs record parsing state');
select has_column('public', 'jobs', 'capture_fingerprint', 'jobs can detect duplicate captures');
select results_eq(
  $$ select global_monthly_limit from public.app_settings where singleton = true $$,
  array[5],
  'default monthly limit is five'
);

select * from finish();
rollback;
