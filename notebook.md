# notebook.md

Agent working notebook. Read the usage rules in CLAUDE.md before writing here.

## Current State

- **Completed:** Phase 0–4 plus Phase 5 hardening pass (login lockout with atomic increments, server-canonical chat context, duplicate/tamper guards, atomic assistant-slot reservations for daily limits, delete confirmations/toasts, offline submit blocking).
- **Next phase:** None scheduled. Non-Google providers deferred to a side track.
- **Stack:** Next.js 16, React 19, AI SDK 6, Tailwind 4, Drizzle ORM, Postgres.
- **Streaming:** `/api/chat` route + `useChat` hook via `@ai-sdk/react`, with `selectedChatModel` sent from client and validated against centralized allowlist.
- **Models:** Central registry in `lib/ai/models.ts` with Gemini-only options (3.0 Pro, 3.0 Flash, 2.5 Flash). Server-side validation rejects unknown model IDs (400). Stream errors surface user-facing message.
- **Model UX:** Compact picker in composer shows `shortName` in trigger, full names in dropdown. Model choice is persisted per chat (`chats.model_id`), while `chat-model` cookie is only a default seed for brand-new chats.
- **Reasoning:** Gemini thought summaries enabled for 3.x (`includeThoughts: true`, `thinkingLevel: 'high'`). 2.5 Flash is configured for cost-safe fallback (`thinkingBudget: 0`, `includeThoughts: false`). `sendReasoning` defaults to true in AI SDK.
- **Auth:** Invite-only credentials auth, JWT cookie sessions, DB-backed session records, and DB-backed lockout fields on `users` (`failed_login_attempts`, `locked_until`, `last_failed_login_at`). Gated by `FAMILY_ALLOWED_EMAILS`.
- **DB schema:** `users` (with lockout columns), `sessions`, `chats` (with `model_id`), `messages`, `assistant_generation_reservations` (concurrency-safe quota reservations). Migrations in `drizzle/`.
- **Layout:** shadcn sidebar primitives (`SidebarProvider` + `AppSidebar` + `SidebarInset`). Chat routes under `(chat)` route group; auth pages standalone.
- **Build/lint:** `pnpm build` and `pnpm lint` (`tsc --noEmit`) pass on the current branch.
- **Validation:** `pnpm lint` and `pnpm build` pass after Phase 5 hardening. Browser smoke scenarios (especially auth lockout + cross-account authz) should be re-checked with two real user sessions before production rollout.

## Active Risks and Gotchas

- `LanguageModelV1` vs `LanguageModel` type mismatch is still handled via cast, now isolated in `lib/ai/providers.ts`.
- Preview model fallback retries happen only when primary stream setup fails before streaming starts; mid-stream provider failures still return an error message.
- Gemini preview IDs can change over time; keep `lib/ai/models.ts` updated if Google renames/deprecates model IDs.
- Email uniqueness is case-normalized at app layer only (lowercase); no DB-level `citext`.
- No pagination on chat list — fine for 2-4 users, would need limits if user base grows.
- Chat title is set once from first user message and never updated.
- `EnvCard` warning banner is no longer visible after global header removal; relocate if still needed.
- `useChat` status values are `submitted | streaming | ready | error` (not `idle`); plan docs used wrong value.
- `/api/chat` `maxDuration` is 90s. If timeouts still occur, increase further or reduce generation length.
- Thinking tokens are billed even though only summaries are returned. If costs spike, lower `thinkingBudget`/`thinkingLevel` in `lib/ai/models.ts`.
- `/api/chat` now rebuilds model context from persisted DB messages and can return `409` on client/DB divergence; client should refresh state before retrying.
- Daily limiting now counts persisted assistant replies (completed generations). Aborted/failed generations before `onFinish` are not counted.
- Assistant quota reservations auto-expire after 5 minutes; severe server interruption can temporarily undercount available slots until reservation TTL elapses.

## Decisions Log

Record non-obvious decisions here. Delete entries once they're no longer relevant.

- **Streaming approach:** Chose `createUIMessageStream` + `createUIMessageStreamResponse` (not `streamText().toUIMessageStreamResponse()`) to get `onFinish` access for message persistence.
- **Model routing:** Added centralized Gemini-only allowlist and provider resolver (`lib/ai/models.ts`, `lib/ai/providers.ts`) instead of hardcoding model IDs in API route.
- **Model selector UX:** `selectedChatModel` is always sent from client; server stores model per chat row and updates on change. Cookie is retained only to seed first message in a new chat.
- **Provider scope:** Gemini-only to spend GCP credits; AI Gateway/non-Google provider work is deferred as a side track (not a numbered phase).
- **Sidebar:** Uses shadcn sidebar primitives instead of custom implementation. Cookie-based collapse persistence, defaults to collapsed.
- **Lint script:** `tsc --noEmit` (not `next lint`) because Next 16 dropped the previous invocation.
- **Tailwind v4:** Compatibility migration — kept existing theme tokens, switched PostCSS plugin to `@tailwindcss/postcss`, `globals.css` imports Tailwind and references `tailwind.config.ts`.
- **Chat API trust model:** Server now treats DB history as canonical and uses client payload only for the latest user message plus transport trigger metadata (`submit-message`/`regenerate-message`).
- **Rate limit metric:** Switched from user message count to assistant reply count so duplicate message-id replay cannot bypass limits.
- **Quota concurrency control:** Added DB reservation slots (`assistant_generation_reservations`) checked in a transaction before streaming to prevent parallel requests from overshooting daily assistant limits.
- **Auth hardening:** Added DB-backed lockout (5 failed attempts, 15-minute lock, 600ms failure delay) to keep brute-force protection minimal but effective for family-scale usage.
