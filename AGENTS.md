# CV Maker repository instructions

## Release workflow

When the user asks to commit, push, publish, or deploy changes:

1. Run checks proportionate to the change before committing.
2. Commit only the files belonging to the requested work.
3. Push the commit to the requested branch on GitHub (use `main` when no branch is specified).
4. Run `pnpm deploy:cloudflare` from the repository root.
5. Verify that `https://cvtailor.pages.dev` serves the new deployment.

Do not report the release as complete until both the GitHub push and Cloudflare Pages deployment
have succeeded. If either fails, report the exact blocker. For backend changes, also deploy the
relevant Supabase migrations or Edge Functions before reporting completion.
