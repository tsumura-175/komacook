<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Regression test gate

Before changing application or database behavior, start local Supabase and run `npm run test:all` to establish a passing baseline. After the change, run `npm run test:all`, `npm run lint`, `npx tsc --noEmit`, `npm run build`, and `npx supabase db lint --local`. Never point integration tests at a hosted Supabase project.
