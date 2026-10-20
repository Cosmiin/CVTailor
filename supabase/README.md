# Supabase backend

## Deploy

```bash
supabase link --project-ref <project-ref>
supabase db push
supabase secrets set OPENAI_API_KEY=<key> OPENAI_MODEL=gpt-6.1-sol OPENAI_TRANSCRIPTION_MODEL=gpt-transcribe ALLOWED_ORIGINS=https://your-project.pages.dev
supabase functions deploy parse-cv
supabase functions deploy import-job
supabase functions deploy tailor-cv
supabase functions deploy delete-account
supabase functions deploy transcribe-audio
```

`OPENAI_TRANSCRIPTION_MODEL` is optional and defaults to `gpt-transcribe`.

After registering the owner account, add its Auth UUID to `public.admins`. The migration creates the private `cv-originals` bucket, all RLS policies, and a five-run monthly default.

The browser must never receive `SUPABASE_SECRET_KEY` or `OPENAI_API_KEY`. Only the Supabase publishable key belongs in the web and extension builds.
