# notebook.md

Agent working notebook. Read the usage rules in CLAUDE.md before writing here.

## Current State

- **Completed:** Phase 0 (deps + streaming), Phase 1 (auth), Phase 2 (chat persistence), Phase 3 (Gemini-only model routing + selector), sidebar shell rework, chat timeout increase.
- **Next phase:** Phase 4 — Quality-of-Life upgrades. Non-Google providers are deferred to a side track.
- **Stack:** Next.js 16, React 19, AI SDK 6, Tailwind 4, Drizzle ORM, Postgres.
- **Streaming:** `/api/chat` route + `useChat` hook via `@ai-sdk/react`, with `selectedChatModel` sent from client and validated against centralized allowlist.
- **Models:** Central registry in `lib/ai/models.ts` with Gemini-only options (3.0 Pro, 3.0 Flash, 2.5 Flash). Server-side validation rejects unknown model IDs (400). Stream errors surface user-facing message.
- **Model UX:** Compact picker in composer shows `shortName` in trigger, full names in dropdown. Model choice is persisted per chat (`chats.model_id`), while `chat-model` cookie is only a default seed for brand-new chats.
- **Reasoning:** Gemini thought summaries enabled for 3.x (`includeThoughts: true`, `thinkingLevel: 'high'`). 2.5 Flash is configured for cost-safe fallback (`thinkingBudget: 0`, `includeThoughts: false`). `sendReasoning` defaults to true in AI SDK.
- **Auth:** Invite-only credentials auth, JWT cookie sessions, DB-backed session records. Gated by `FAMILY_ALLOWED_EMAILS`.
- **DB schema:** `users`, `sessions`, `chats` (with `model_id`), `messages`. Migrations in `drizzle/`.
- **Layout:** shadcn sidebar primitives (`SidebarProvider` + `AppSidebar` + `SidebarInset`). Chat routes under `(chat)` route group; auth pages standalone.
- **Build/lint:** `pnpm build` and `pnpm lint` (`tsc --noEmit`) pass after Phase 3 updates.

## Active Risks and Gotchas

- `LanguageModelV1` vs `LanguageModel` type mismatch is still handled via cast, now isolated in `lib/ai/providers.ts`.
- Preview model fallback retries happen only when primary stream setup fails before streaming starts; mid-stream provider failures still return an error message.
- Gemini preview IDs can change over time; keep `lib/ai/models.ts` updated if Google renames/deprecates model IDs.
- Email uniqueness is case-normalized at app layer only (lowercase); no DB-level `citext`.
- No pagination on chat list — fine for 2-4 users, would need limits if user base grows.
- Chat title is set once from first user message and never updated.
- `EnvCard` warning banner is no longer visible after global header removal; relocate if still needed.
- No toast/feedback on chat deletion failures in sidebar.
- `/api/chat` `maxDuration` is 90s. If timeouts still occur, increase further or reduce generation length.
- Thinking tokens are billed even though only summaries are returned. If costs spike, lower `thinkingBudget`/`thinkingLevel` in `lib/ai/models.ts`.

## Decisions Log

Record non-obvious decisions here. Delete entries once they're no longer relevant.

- **Streaming approach:** Chose `createUIMessageStream` + `createUIMessageStreamResponse` (not `streamText().toUIMessageStreamResponse()`) to get `onFinish` access for message persistence.
- **Model routing:** Added centralized Gemini-only allowlist and provider resolver (`lib/ai/models.ts`, `lib/ai/providers.ts`) instead of hardcoding model IDs in API route.
- **Model selector UX:** `selectedChatModel` is always sent from client; server stores model per chat row and updates on change. Cookie is retained only to seed first message in a new chat.
- **Provider scope:** Gemini-only to spend GCP credits; AI Gateway/non-Google provider work is deferred as a side track (not a numbered phase).
- **Sidebar:** Uses shadcn sidebar primitives instead of custom implementation. Cookie-based collapse persistence, defaults to collapsed.
- **Lint script:** `tsc --noEmit` (not `next lint`) because Next 16 dropped the previous invocation.
- **Tailwind v4:** Compatibility migration — kept existing theme tokens, switched PostCSS plugin to `@tailwindcss/postcss`, `globals.css` imports Tailwind and references `tailwind.config.ts`.
