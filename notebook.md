# notebook.md

Agent working notebook. Read the usage rules in CLAUDE.md before writing here.

## Current State

- **Completed:** Phase 0 (deps + streaming), Phase 1 (auth), Phase 2 (chat persistence), sidebar shell rework, chat timeout increase.
- **Next phase:** Phase 3 — Model Routing and Controls (see UPGRADE_PLAN.md).
- **Stack:** Next.js 16, React 19, AI SDK 6, Tailwind 4, Drizzle ORM, Postgres.
- **Streaming:** `/api/chat` route + `useChat` hook via `@ai-sdk/react`. Single hardcoded Gemini model (`gemini-2.5-flash`).
- **Auth:** Invite-only credentials auth, JWT cookie sessions, DB-backed session records. Gated by `FAMILY_ALLOWED_EMAILS`.
- **DB schema:** `users`, `sessions`, `chats`, `messages`. Migrations in `drizzle/`.
- **Layout:** shadcn sidebar primitives (`SidebarProvider` + `AppSidebar` + `SidebarInset`). Chat routes under `(chat)` route group; auth pages standalone.
- **Build/lint:** `pnpm build` and `pnpm lint` (`tsc --noEmit`) both pass on master.

## Active Risks and Gotchas

- `LanguageModelV1` vs `LanguageModel` type mismatch: Google model is cast to `LanguageModel` at the boundary in `/app/api/chat/route.ts`. Keep this in mind when adding provider routing in Phase 3.
- Pre-existing type error in `lib/utils/chat-grouping.ts` (`Chat` export mismatch from `@/lib/db/schema`) — was observed during chat timeout work; may still be latent.
- Email uniqueness is case-normalized at app layer only (lowercase); no DB-level `citext`.
- No pagination on chat list — fine for 2-4 users, would need limits if user base grows.
- Chat title is set once from first user message and never updated.
- `EnvCard` warning banner is no longer visible after global header removal; relocate if still needed.
- No toast/feedback on chat deletion failures in sidebar.
- `/api/chat` `maxDuration` is 90s. If timeouts still occur, increase further or reduce generation length.

## Decisions Log

Record non-obvious decisions here. Delete entries once they're no longer relevant.

- **Streaming approach:** Chose `createUIMessageStream` + `createUIMessageStreamResponse` (not `streamText().toUIMessageStreamResponse()`) to get `onFinish` access for message persistence.
- **Sidebar:** Uses shadcn sidebar primitives instead of custom implementation. Cookie-based collapse persistence, defaults to collapsed.
- **Lint script:** `tsc --noEmit` (not `next lint`) because Next 16 dropped the previous invocation.
- **Tailwind v4:** Compatibility migration — kept existing theme tokens, switched PostCSS plugin to `@tailwindcss/postcss`, `globals.css` imports Tailwind and references `tailwind.config.ts`.
