# notebook.md

Working notebook for implementation notes, patterns, warnings, and intermediate decisions.

## 2026-02-08 - Phase 0 (Dependencies + Streaming Baseline)

### Assumptions

- "Phase 0 - dependencies upgrade to latest" means upgrading core runtime/framework deps to current latest stable releases while keeping the app minimal and in-place.
- Because this repo currently uses `ai/rsc`, upgrading AI SDK without migration would break chat streaming; Phase 0 deliverable requires streaming to keep working.
- We should avoid adding auth/DB features in this phase.

### Plan

1. Upgrade Next.js/React/AI SDK/Tailwind and related core deps to latest compatible versions.
2. Replace `ai/rsc` server action chat flow with a minimal `/api/chat` streaming route and client `useChat` hook.
3. Keep visual/UI structure mostly unchanged.
4. Run lint/build smoke checks and document validation + risks.

### What changed

- Upgraded core dependencies to latest stable via `pnpm up --latest` (Next.js 16, React 19, AI SDK 6, Tailwind 4, plus related UI/runtime libs).
- Added `@ai-sdk/react` and `@tailwindcss/postcss` for current AI SDK UI hooks and Tailwind v4 PostCSS integration.
- Migrated chat streaming from deprecated `ai/rsc` server actions to API route + hook:
  - Added `/app/api/chat/route.ts` with `streamText(...)` + `toUIMessageStreamResponse()`.
  - Rewrote `/components/chat.tsx` to use `useChat` and `DefaultChatTransport`.
  - Removed obsolete `/components/actions.tsx` (`ai/rsc` imports no longer available).
- Updated env warning card to check `GOOGLE_GENERATIVE_AI_API_KEY` directly.
- Migrated Tailwind integration for v4 compatibility:
  - PostCSS plugin switched to `@tailwindcss/postcss`.
  - `app/globals.css` now imports Tailwind and explicitly references `tailwind.config.ts`.
  - `tailwind.config.ts` plugin imports updated to ESM style and `darkMode` adjusted for v4 types.
- Updated `tsconfig.json` to exclude `ai-chatbot` reference directory from root app type-check/build.
- Updated `lint` script to `tsc --noEmit` (Next 16 no longer supports the previous `next lint` invocation here).

### What was validated

- `pnpm build` passes on upgraded stack.
- `pnpm lint` (TypeScript no-emit check) passes.
- Verified old `ai/rsc` imports/references are removed from active app code.

### Open risks / follow-ups

- Tailwind v4 migration is compatibility-based and keeps existing theme tokens; visual parity should be checked in browser (`pnpm dev`) for any subtle style regressions.
- This phase intentionally keeps a single direct Gemini model in `/app/api/chat/route.ts`; typed model allowlist/provider routing is still for later phases per plan.

## 2026-02-08 - Follow-up Type Fix

- Addressed `LanguageModelV1` vs `LanguageModel` typing mismatch in `/app/api/chat/route.ts` by casting the Google model to `LanguageModel` at the boundary.
- Validation: `pnpm lint` and `pnpm build` both pass.
- Fixed Google model ID format in `/app/api/chat/route.ts` (`google/gemini-2.5-flash` -> `gemini-2.5-flash`) to avoid 404 on direct Google provider endpoint.

## 2026-02-08 - Phase 1 Plan (Auth Foundation)

### Assumptions

- Keep implementation minimal and explicit for 2-4 users; no enterprise auth abstractions.
- Use Node.js runtime route handlers/server components for auth checks (not Edge-only security gating).
- Keep invite-only onboarding via `FAMILY_ALLOWED_EMAILS`; deny non-allowlisted registration.
- Introduce only auth-critical data now (`users`, `sessions`), and add chat/message persistence in Phase 2.

### Plan

1. Add minimal auth + DB dependencies (`drizzle-orm`, `postgres`, `bcrypt-ts`, `jose`, `drizzle-kit`) and wire `POSTGRES_URL`.
2. Create small auth schema and migration for:
   - `users` (id, email unique, password_hash, created_at)
   - `sessions` (id, user_id, expires_at, created_at)
3. Implement auth helpers:
   - password hash/verify
   - allowlist parser for `FAMILY_ALLOWED_EMAILS`
   - signed session cookie create/read/delete using `AUTH_SECRET`
4. Implement invite-only credentials routes/actions:
   - `POST /api/auth/register` (allowlist gate + create user + session)
   - `POST /api/auth/login` (verify password + session)
   - `POST /api/auth/logout` (delete session + clear cookie)
5. Add UI pages/components:
   - `/login` and `/register` forms (register link shown, but still allowlist-enforced)
   - redirect authenticated users away from auth pages to `/`
6. Add server-side route protection:
   - protect `/` page in server component/layout (redirect to `/login` if no session)
   - protect `/api/chat` by resolving session user and returning 401 when missing
7. Update env docs and Vercel setup notes for `AUTH_SECRET`, `POSTGRES_URL`, `FAMILY_ALLOWED_EMAILS`.
8. Run smoke checks (`pnpm lint`, `pnpm build`) and manual checks for invited/non-invited flows.

### Validation Checklist (Phase 1)

- Invited email can register and login with email+password.
- Non-invited email cannot register.
- Anonymous user cannot access `/` chat page.
- Anonymous request to `/api/chat` is rejected.
- Session persists across reload and logout clears access.

## 2026-02-08 - Phase 1 Implementation (Auth Foundation)

### What changed

- Added minimal auth + DB dependencies:
  - runtime: `drizzle-orm`, `postgres`, `bcrypt-ts`, `jose`
  - dev: `drizzle-kit`
- Added Drizzle setup and initial migration for Phase 1 auth tables:
  - `drizzle.config.ts`
  - `lib/db/schema.ts` (`users`, `sessions`)
  - `lib/db/index.ts`
  - `lib/db/queries.ts`
  - `drizzle/0000_brief_marauders.sql`
- Implemented lightweight invite-only credentials auth with signed cookie sessions:
  - `lib/auth/allowlist.ts` (`FAMILY_ALLOWED_EMAILS`)
  - `lib/auth/password.ts`
  - `lib/auth/session.ts` (`AUTH_SECRET` + JWT cookie + DB-backed session record)
  - `app/(auth)/actions.ts` (login/register/logout server actions)
- Added auth UI pages/forms:
  - `app/login/page.tsx`
  - `app/login/login-form.tsx`
  - `app/register/page.tsx`
  - `app/register/register-form.tsx`
- Added route protection:
  - `/app/page.tsx` redirects anonymous users to `/login`
  - `/app/api/chat/route.ts` returns `401` for unauthenticated users
- Updated header with session-aware auth controls:
  - login/register buttons for anonymous users
  - logout button for authenticated users
- Added env template and docs:
  - `.env.example`
  - `README.md`
  - package scripts for DB migration flow

### What was validated

- `pnpm lint` passes.
- `pnpm build` passes.
- Verified app routes are dynamic and include `/`, `/login`, `/register`, `/api/chat` in build output.
- Verified migration generation works (`pnpm db:generate`).

### Open risks / follow-ups

- `pnpm db:migrate` was not run in this environment because no `POSTGRES_URL` for an actual target DB was provided.
- Email uniqueness is case-normalized at app layer (lowercase); DB collation-specific case-insensitive enforcement (`citext`) is not added to keep Phase 1 minimal.
- Chat persistence tables (`chats`, `messages`) are intentionally deferred to Phase 2.
