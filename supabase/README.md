# Supabase backend

## Deploy

```bash
supabase link --project-ref <project-ref>
supabase db push
supabase secrets set OPENAI_API_KEY=<key> OPENAI_WEBHOOK_SECRET=<webhook-signing-secret> OPENAI_MODEL=gpt-6.1-sol OPENAI_TRANSCRIPTION_MODEL=gpt-transcribe JOB_FINALIZER_SECRET=<random-secret> ALLOWED_ORIGINS=https://your-project.pages.dev
supabase functions deploy parse-cv
supabase functions deploy import-job
supabase functions deploy tailor-cv
supabase functions deploy delete-account
supabase functions deploy transcribe-audio
supabase functions deploy openai-response-webhook --no-verify-jwt
supabase functions deploy finalize-job-parses --no-verify-jwt
```

`OPENAI_TRANSCRIPTION_MODEL` is optional and defaults to `gpt-transcribe`.

## Server-side job finalization

Create an OpenAI project webhook for:

```text
https://<project-ref>.supabase.co/functions/v1/openai-response-webhook
```

Subscribe to `response.completed`, `response.failed`, `response.incomplete`, and, when available,
`response.cancelled`. Save its signing secret as `OPENAI_WEBHOOK_SECRET`. The receiver verifies the
untouched request body, stores only delivery metadata, and finalizes matching job-parser responses.

The migration also creates a one-minute reconciliation schedule. Store the finalizer URL and the
same random secret used for `JOB_FINALIZER_SECRET` in Supabase Vault before enabling production:

```sql
select vault.create_secret(
  'https://<project-ref>.supabase.co/functions/v1/finalize-job-parses',
  'job_finalizer_url'
);
select vault.create_secret('<random-secret>', 'job_finalizer_secret');
```

The scheduled function recovers missed webhooks, transient provider errors, and abandoned claims.
The authenticated `import-job` status action remains an idempotent fallback.

After registering the owner account, add its Auth UUID to `public.admins`. The migration creates the private `cv-originals` bucket, all RLS policies, and a five-run monthly default.

The browser must never receive `SUPABASE_SECRET_KEY`, `OPENAI_API_KEY`, `OPENAI_WEBHOOK_SECRET`, or
`JOB_FINALIZER_SECRET`. Only the Supabase publishable key belongs in the web and extension builds.
