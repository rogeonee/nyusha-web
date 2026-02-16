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

## 2026-02-14 - Phase 2 Implementation (Chat Persistence)

### What changed

- Added `@tanstack/react-query` dependency for client-side data fetching.
- Extended DB schema with `chats` and `messages` tables:
  - `chats`: id (client-generated UUID), user_id (FK to users, cascade), title, created_at.
  - `messages`: id (AI SDK message ID), chat_id (FK to chats, cascade), role, parts (JSON), created_at.
  - Added Drizzle relations and `Chat`/`Message` type exports.
  - Generated and applied migration `drizzle/0001_careless_raider.sql`.
- Added 6 query functions to `lib/db/queries.ts`: createChat, getChatById, getChatsByUserId, deleteChatById, saveMessages, getMessagesByChatId.
- Rewrote `app/api/chat/route.ts`:
  - POST now accepts `{ id, messages }` — creates chat on first message with title from first user text.
  - Saves user message before streaming, saves assistant message via `onFinish` callback.
  - Switched from `streamText().toUIMessageStreamResponse()` to `createUIMessageStream` + `createUIMessageStreamResponse` for `onFinish` access.
  - Added DELETE handler with auth + ownership verification.
- Created `app/api/history/route.ts` — GET returns user's chats (auth-gated).
- Created `components/query-provider.tsx` — TanStack Query provider wrapper.
- Created `components/sidebar.tsx` — client component with:
  - `useQuery` for chat list from `/api/history`.
  - `useMutation` for chat deletion with cache invalidation.
  - Desktop: always visible 256px sidebar. Mobile: off-screen with toggle + backdrop.
  - Loading skeleton, empty state, active chat highlight, hover-visible delete button.
- Updated `components/chat.tsx`:
  - Accepts `id` and `initialMessages` props.
  - Sends `id` in request body via `DefaultChatTransport`.
  - On finish: replaces URL from `/` to `/chat/{id}` for new chats, invalidates chat list query.
- Created `(chat)` route group:
  - `app/(chat)/layout.tsx` — server component with auth gate, wraps `QueryProvider` + `Sidebar` + main area.
  - `app/(chat)/page.tsx` — new chat page, generates UUID server-side.
  - `app/(chat)/chat/[id]/page.tsx` — existing chat page, loads messages from DB, verifies ownership.
- Deleted old `app/page.tsx` (replaced by route group).

### What was validated

- `pnpm lint` (tsc --noEmit) passes.
- `pnpm build` passes — routes: `/`, `/chat/[id]`, `/api/chat`, `/api/history`, `/login`, `/register`.
- `pnpm db:migrate` applied successfully.

### Open risks / follow-ups

- Sidebar mobile toggle button overlaps with header content on small screens — may need layout adjustment.
- No pagination on chat list — fine for 2-4 users but would need limits if user base grows.
- Chat title is set once from first user message and never updated.

## 2026-02-15 - Sidebar Shell Rework Plan (ChatGPT-style blend)

### Assumptions

- This pass is strictly a chat-shell UI refactor; no auth/DB/API behavior changes are intended.
- We should switch from the custom sidebar implementation to shadcn sidebar primitives to get reliable collapsed rail + mobile sheet behavior.
- The shell should only apply to `(chat)` routes; login/register remain simple standalone pages.
- Desktop should default to collapsed (`defaultOpen = false`) unless `sidebar_state=true` cookie exists.
- Header controls stay top-right (theme toggle + logout) and model controls are deferred.

### Plan

1. Add shadcn sidebar primitives and required supporting UI files/dependencies.
2. Replace chat layout shell with `SidebarProvider + AppSidebar + SidebarInset + ChatHeader`.
3. Replace old custom sidebar component with `components/app-sidebar.tsx` using shadcn sidebar API.
4. Add `components/chat-header.tsx` and remove global header usage from root layout.
5. Update auth pages for full-height centering without global header offset.
6. Tune sidebar color tokens for better dark-mode blend between sidebar/header/content.
7. Run `pnpm lint` and `pnpm build`, then record validation and follow-ups.

## 2026-02-15 - Sidebar Shell Rework Implementation (ChatGPT-style blend)

### What changed

- Added shadcn sidebar primitives and supporting UI building blocks:
  - `components/ui/sidebar.tsx`
  - `components/ui/sheet.tsx`
  - `components/ui/tooltip.tsx`
  - `components/ui/separator.tsx`
  - `components/ui/skeleton.tsx`
  - `hooks/use-mobile.ts`
- Added required Radix dependencies for new primitives:
  - `@radix-ui/react-dialog`
  - `@radix-ui/react-separator`
  - `@radix-ui/react-tooltip`
- Replaced custom chat sidebar with new app shell sidebar:
  - Added `components/app-sidebar.tsx`.
  - Removed legacy `components/sidebar.tsx`.
- Added blended chat header:
  - `components/chat-header.tsx` with sidebar trigger, Nyusha title, theme toggle, logout.
- Refactored layout ownership:
  - `app/layout.tsx`: removed global `Header` render.
  - `app/(chat)/layout.tsx`: now uses `SidebarProvider`, `AppSidebar`, `SidebarInset`, `ChatHeader`, and cookie-backed `defaultOpen` from `sidebar_state`.
- Updated auth page vertical centering after global header removal:
  - `app/login/page.tsx`
  - `app/register/page.tsx`
  - Replaced `min-h-[calc(100dvh-4rem)]` with `min-h-dvh`.
- Tuned dark-mode sidebar tokens in `app/globals.css` to better blend sidebar/header/content surfaces.

### What was validated

- `pnpm lint` passes (`tsc --noEmit`).
- `pnpm build` passes (Next.js production build).
- Build output includes expected dynamic routes: `/`, `/chat/[id]`, `/api/chat`, `/api/history`, `/login`, `/register`.

### Open risks / follow-ups

- Sidebar collapse persistence is cookie-based and defaults to collapsed when cookie is absent; behavior should be visually verified in browser for first-load desktop/mobile interactions.
- Env warning banner from `EnvCard` is no longer visible because global header was removed; if this warning is still desired, relocate it into chat shell or auth pages in a follow-up.
- No toast feedback is shown on chat deletion failures in sidebar; mutation currently handles state refresh only on success.

## 2026-02-15 - Sidebar Shell Rework Follow-up (alignment pass)

### What changed

- Moved sidebar collapse/expand control into the sidebar itself as the first (top-most) button:
  - Updated `components/app-sidebar.tsx` to add a top button using `toggleSidebar`.
  - Removed sidebar toggle from `components/chat-header.tsx`.
- Fixed collapsed icon horizontal alignment:
  - Updated `components/ui/sidebar.tsx` menu button variants with collapsed-state centering (`justify-center` + `gap-0`).
- Fixed chat pane centering issue by removing unintended horizontal flex behavior in chat content wrapper:
  - Updated `app/(chat)/layout.tsx` wrapper from `flex` row to block container.

### What was validated

- `pnpm lint` passes.
- `pnpm build` passes.

### Open risks / follow-ups

- Mobile opening affordance now depends on current sidebar composition and should be visually checked on small screens after this pass.

### Follow-up adjustment

- Restored mobile sidebar accessibility by adding a mobile-only `SidebarTrigger` in `app/(chat)/layout.tsx` outside the header (fixed-position), so the sidebar can still open when closed on small screens.

## 2026-02-15 - Sidebar Header Alignment Refinement

### What changed

- Updated sidebar top controls to match requested collapsed/expanded behavior:
  - `components/app-sidebar.tsx`
  - Added top header row (`h-14`) aligned with main header height.
  - In expanded state: placeholder logo is left-aligned and collapse button is icon-only right-aligned.
  - In collapsed state: top icon button is centered and remains the top-most control.
  - Moved New Chat into its own row as a full-width, left-aligned button.
- Matched header control sizing for consistency:
  - `components/chat-header.tsx`
  - Logout button now uses default size to align better with theme toggle and sidebar toggle sizing.

### What was validated

- `pnpm build` passes.
- `pnpm lint` passes (after build).

### Notes

- Running lint and build in parallel caused a transient `.next/types` race (`Cannot find module './routes.js'`) in lint; rerunning lint after build resolved it.

### New chat transition stabilization

- Updated `components/app-sidebar.tsx` new-chat row to use separate fixed variants for collapsed and expanded states.
- Added delayed opacity transition for expanded variant so text button appears after sidebar width expansion begins, preventing icon/text shift.
- Kept collapsed variant as icon-only centered button.

### Validation

- `pnpm build` passes.
- `pnpm lint` passes.

### New chat morph fix (final)

- Replaced dual collapsed/expanded New Chat button approach in `components/app-sidebar.tsx`.
- New Chat now exists only in expanded header row (`group-data-[collapsible=icon]:hidden`) to avoid hidden collapsed layout space.
- Added sidebar-state-aware delayed reveal (`showExpandedNewChat`) so New Chat appears after expand transition settles, removing icon/text morph during width animation.

### Validation

- `pnpm build` passes.
- `pnpm lint` passes.

### Collapsed New Chat icon restore

- Added a collapsed-only New Chat row in `components/app-sidebar.tsx` with centered plus icon button.
- Kept expanded New Chat row separate (`group-data-[collapsible=icon]:hidden`) to avoid cross-state spacing bleed and morphing.

### Validation

- `pnpm build` passes.
- `pnpm lint` passes.

## 2026-02-16 - Sidebar/Header overlap investigation (pre-edit)

### Assumptions and plan

- The header/sidebar overlap is caused by desktop sidebar offset classes not producing valid width CSS.
- We should keep the current product-specific chat/sidebar logic and only patch layout primitives.
- Plan:
  1. Fix invalid sidebar variable class syntax in `components/ui/sidebar.tsx` (`[--var]` to `[var(--var)]`).
  2. Re-run typecheck (`pnpm lint`) to ensure no regressions.
  3. Record validation and residual risks in this notebook entry.

### What changed

- Updated `components/ui/sidebar.tsx` variable-based size utilities to valid CSS variable forms:
  - `w-[--sidebar-width]` -> `w-[var(--sidebar-width)]`
  - `group-data-[collapsible=icon]:w-[--sidebar-width-icon]` -> `group-data-[collapsible=icon]:w-[var(--sidebar-width-icon)]`
  - `max-w-[--skeleton-width]` -> `max-w-[var(--skeleton-width)]`
- No behavioral changes were made to chat/auth/provider logic; only sidebar layout primitive sizing classes were adjusted.

### What was validated

- `pnpm lint` passes (`tsc --noEmit`).

### Open risks / follow-ups

- Visual verification in browser is still required to confirm the header/sidebar overlap is fully resolved across desktop collapsed/expanded states.
- Current sidebar/chat implementation intentionally differs from template in data fetching/state stack (React Query vs SWR) and feature set; this patch only corrects layout parity for width/offset behavior.

### Validation update

- `pnpm build` passes (Next.js production build).

## 2026-02-16 - Hydration mismatch fix (pre-edit)

### Assumptions and plan

- Sidebar hydration mismatch is from two client components producing non-deterministic SSR output:
  1. `Math.random()` in `SidebarMenuSkeleton` width generation.
  2. Theme-dependent icon/label in `AppSidebar` before mount.
- Plan:
  1. Remove random skeleton width generation and use deterministic widths.
  2. Gate theme presentation behind mounted state with a stable SSR fallback.
  3. Validate with `pnpm lint` and `pnpm build`.

### What changed

- Fixed non-deterministic sidebar loading skeleton rendering in `components/ui/sidebar.tsx`:
  - Removed `Math.random()` width generation in `SidebarMenuSkeleton`.
  - Added a deterministic `width` prop with default `'70%'`.
- Fixed theme-toggle hydration mismatch in `components/app-sidebar.tsx`:
  - Added `mounted` state (`useEffect`) and `effectiveTheme` fallback to `'system'` before mount.
  - Theme icon/label now render stable SSR markup and update after mount.
- Made loading skeleton widths deterministic in `components/app-sidebar.tsx` using a fixed width list.

### What was validated

- `pnpm lint` passes (`tsc --noEmit`).
- `pnpm build` passes (Next.js production build).

### Open risks / follow-ups

- If additional hydration warnings appear, they are likely from other UI pieces that use non-deterministic client values during SSR and should be patched with the same deterministic-first-render pattern.
## 2026-02-15 - Chat Timeout and Long-Wait UX

### Assumptions

- Production Vercel function-level timeouts are the direct cause of long-prompt failures observed by users in higher-latency regions.
- The app already streams correctly; increasing route max duration is lower-risk than changing model/provider behavior.
- A lightweight inline status message is sufficient UX feedback for slower responses.

### Plan

1. Increase `/api/chat` route max duration to reduce premature timeouts for longer reasoning responses.
2. Add a user-facing message after 30 seconds while the assistant is still generating.
3. Re-run TypeScript lint check as a smoke test.

### What changed

- Updated `/app/api/chat/route.ts` `maxDuration` from `30` to `90`.
- Updated `/components/chat.tsx`:
  - added a request-pending timer
  - shows an additional message after 30 seconds: "Это может занять чуть больше времени. Все в порядке, запрос еще обрабатывается."

### What was validated

- Application build compilation reaches the type-check phase successfully after code bundling.
- Full TypeScript validation currently fails due to a pre-existing unrelated type error in `lib/utils/chat-grouping.ts` (`Chat` export mismatch from `@/lib/db/schema`).

### Open risks / follow-ups

- If timeouts still occur for very long completions, next steps are increasing duration further (within plan limits) and/or reducing generation length for heavy prompts.
