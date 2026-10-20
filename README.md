# CV Maker

CV Maker is a multi-user, AI-assisted CV tailoring application. The React app is designed for Cloudflare Pages; Supabase provides email/password authentication, Postgres, private file storage, Row Level Security, and Edge Functions. A Manifest V3 Chrome extension captures job descriptions from the active page.

## Workspace

- `apps/web` — React/Vite application and in-browser PDF/DOCX exports.
- `apps/extension` — developer-installable Chrome extension.
- `packages/shared` — versioned CV schemas, provenance rules, fixtures, and normalization helpers.
- `supabase` — database migration and authenticated Edge Functions.

## Local setup

1. Install Node.js 22+ and pnpm 10+.
2. Run `pnpm install`.
3. Copy `.env.example` to `apps/web/.env.local` and set the public Supabase values.
4. Start Supabase locally with `supabase start`, then run `supabase db reset`.
5. Add `OPENAI_API_KEY`, `OPENAI_MODEL`, and `ALLOWED_ORIGINS` to Supabase secrets. Optionally set `OPENAI_TRANSCRIPTION_MODEL`; it defaults to `gpt-transcribe`.
6. Run `pnpm dev`.

Without Supabase environment values, the web app starts in an explicit local demo mode so its complete editor and export experience can be reviewed without credentials. Demo data never leaves the browser.

## Chrome extension

Run `pnpm build:extension`, open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `apps/extension/dist`. Set the Supabase and app values in `apps/extension/.env.local` before building.

On an explicit capture, the extension sends the visible listing and any `JobPosting` metadata to the
authenticated `import-job` function. The capture is saved and returned immediately, while a
Supabase background task uses strict AI structured output to identify the primary role, company,
location, compensation, responsibilities, requirements, languages, and benefits in the source
language. The web app polls the saved job until the full profile is ready. Job parsing is separate
from the monthly CV-tailoring quota.

## Deployment

- Cloudflare Pages: build command `pnpm build:web`; output directory `apps/web/dist`.
- Direct Cloudflare release: run `pnpm deploy:cloudflare`. This builds the web app and deploys
  `apps/web/dist` to the `cvtailor` Pages project, avoiding workspace-root auto-detection errors.
- Supabase: apply migrations, deploy the Edge Functions, create secrets, and add the first administrator with:

```sql
insert into public.admins (user_id) values ('<auth-user-uuid>');
```

See `supabase/README.md` for backend deployment details.

When a release is requested, push the commit to GitHub first, run `pnpm deploy:cloudflare`, and
verify [cvtailor.pages.dev](https://cvtailor.pages.dev). A release is complete only when both the
GitHub push and Cloudflare deployment succeed.
