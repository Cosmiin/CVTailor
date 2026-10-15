begin;
select plan(6);

select has_table('public', 'base_cvs', 'base CV table exists');
select has_table('public', 'jobs', 'jobs table exists');
select has_table('public', 'tailor_runs', 'usage audit table exists');
select policies_are('public', 'base_cvs', array['base_cvs_own'], 'base CV access is user-scoped');
select policies_are('public', 'jobs', array['jobs_own'], 'job access is user-scoped');
select results_eq(
  $$ select global_monthly_limit from public.app_settings where singleton = true $$,
  array[5],
  'default monthly limit is five'
);

select * from finish();
rollback;
