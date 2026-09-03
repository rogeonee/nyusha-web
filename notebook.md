# notebook.md

Agent working notebook. Read the usage rules in CLAUDE.md before writing here.

## Current State

- **Completed:** Phase 0–4 plus Phase 5 hardening pass (login lockout with atomic increments, server-canonical chat context, duplicate/tamper guards, atomic assistant-slot reservations for daily limits, delete confirmations/toasts, offline submit blocking).
- **Next phase:** Family evaluation of Gemini 3.8 Flash and GPT-5.6 Luna/Terra.
- **Stack:** Next.js 16, React 19, AI SDK 6, Tailwind 4, Drizzle ORM, Postgres.
- **Streaming:** `/api/chat` route + `useChat` hook via `@ai-sdk/react`, with `selectedChatModel` sent from client and validated against centralized allowlist.
- **Uploads:** Phase A live with direct client upload: browser uses Vercel Blob client uploads via `/api/files/upload-token`; `/api/files/upload` now finalizes server-verified metadata in `chat_files` and chat route links attachments via `message_file_attachments`.
- **Phase B:** Gemini Files reuse is now wired in `/api/chat`: runtime context hydration resolves file metadata from `chat_files`, refreshes expired/missing Gemini URIs on demand, and falls back to Blob URLs without failing the request.
- **Models:** Central registry in `lib/ai/models.ts` exposes Gemini 3.8 Flash / 3.1 Pro directly through Google and GPT-5.6 Luna / Terra through AI Gateway pinned to OpenAI. Server-side validation rejects unknown model IDs (400). Stream errors surface user-facing message.
- **Model UX:** Compact picker in composer shows `shortName` in the trigger and groups full model choices under Google and OpenAI. Gemini 3.8 Flash is the default; model choice is persisted per chat (`chats.model_id`), while `chat-model` cookie is only a default seed for brand-new chats.
- **Reasoning:** User-facing reasoning picker is cookie-backed with Low / Medium / High and defaults to Medium. Gemini receives provider-native `thinkingConfig`; GPT-5.6 receives matching reasoning effort plus summarized reasoning with response storage disabled. Legacy Standard/Extended cookies resolve to Medium/High. `sendReasoning` defaults to true in AI SDK.
- **Auth:** Invite-only credentials auth, JWT cookie sessions, DB-backed session records, and DB-backed lockout fields on `users` (`failed_login_attempts`, `locked_until`, `last_failed_login_at`). Gated by `FAMILY_ALLOWED_EMAILS`.
- **DB schema:** `users`, `sessions`, `chats`, `messages`, `assistant_generation_reservations`, plus upload tables `chat_files` and `message_file_attachments`. Migrations in `drizzle/`.
- **Layout:** shadcn sidebar primitives (`SidebarProvider` + `AppSidebar` + `SidebarInset`). Chat routes under `(chat)` route group; auth pages standalone.
- **Build/lint:** `pnpm build` and `pnpm lint` (`tsc --noEmit`) pass. React Doctor v0.9 uses `--scope full` (the old `--full` flag was removed); use changed scope to audit task regressions separately from repository-wide health.
- **Tests:** Vitest runs 38 tests, including PGlite characterization coverage for quota reservations, message-tail deletion, idempotent message/attachment saves, auth lockout arithmetic, and model/provider routing.
- **Validation:** `pnpm test`, `pnpm lint`, and `pnpm build` pass. Browser smoke scenarios (especially auth lockout + cross-account authz) should be re-checked with two real user sessions before production rollout.

## Active Risks and Gotchas

- `LanguageModelV1` vs `LanguageModel` type mismatch is still handled via cast, now isolated in `lib/ai/providers.ts`.
- Preview model fallback retries happen only when primary stream setup fails before streaming starts; mid-stream provider failures still return an error message.
- GPT-5.6 requests are pinned to the OpenAI provider, but billing mode is controlled in AI Gateway: team-level OpenAI BYOK uses the OpenAI account, while Gateway-managed credentials use Gateway credits and the catalog rate.
- Gemini preview IDs can change over time; keep `lib/ai/models.ts` updated if Google renames/deprecates model IDs.
- Email uniqueness is case-normalized at app layer only (lowercase); no DB-level `citext`.
- No pagination on chat list — fine for 2-4 users, would need limits if user base grows.
- Chat title is set once from first user message and never updated.
- `useChat` status values are `submitted | streaming | ready | error` (not `idle`); plan docs used wrong value.
- `/api/chat` `maxDuration` is 300s (5 minutes). If timeouts still occur, reduce generation length or investigate provider-side latency.
- Thinking tokens are billed even though only summaries are returned. If costs spike, lower `thinkingBudget`/`thinkingLevel` in `lib/ai/models.ts`.
- `/api/chat` now rebuilds model context from persisted DB messages and can return `409` on client/DB divergence; client should refresh state before retrying.
- Daily limiting now counts persisted assistant replies (completed generations). Aborted/failed generations before `onFinish` are not counted.
- Assistant quota reservations auto-expire after 5 minutes; severe server interruption can temporarily undercount available slots until reservation TTL elapses.
- File uploads require `BLOB_READ_WRITE_TOKEN`; upload/delete operations return explicit errors when missing and leave DB state unchanged.
- Client uploads request the Blob token explicitly before `put`, so token-route errors remain visible instead of being replaced by the Blob SDK's generic error.
- Upload media type is resolved from the filename extension via `resolveMediaType`; the browser-reported `File.type` is ignored (untrusted, varies by OS, and DnD bypasses the picker's `accept` filter — so a `.pdf` labeled `image/png` or a `.exe` labeled `application/pdf` must not be honored). The resolved canonical type is sent as the Blob `contentType` and validated identically on client and token route; filename length is guarded client-side to match the route's 255-char limit.
- Upload path ownership is validated by path segments, not a blanket `pathname.includes('..')` check; repeated dots are valid inside filenames such as `report..pdf`, while `.`/`..` traversal segments and nested paths remain rejected.
- Chat delete now performs blob cleanup before DB delete; transient blob API failures will block chat deletion until retry.
- Chat delete treats `BlobNotFoundError` as non-fatal so stale/missing blob keys do not block chat deletion.
- Upload rollback now attempts immediate blob deletion if DB metadata insert fails after blob upload.
- `/api/chat` now uses custom `experimental_download` for model file fetches, adding Blob auth headers for private blob URLs.
- File uploads now bypass function body limits by uploading bytes directly from browser to Blob; `/api/files/upload` expects JSON finalize payload (`chatId`, `pathname`, `filename`) and no longer accepts multipart file bodies.
- Upload finalize now treats `chat_files.storage_key` unique conflicts as idempotent retries and returns the existing row instead of deleting the blob.
- Gemini Files refresh currently runs inline in `/api/chat` under per-file DB row locks; for family-scale this is acceptable, but high concurrency would benefit from background refresh jobs.
- React Doctor is configured to ignore `ai-chatbot/**` because that folder is reference-only per repo policy.
- Image attachments display as thumbnails in the composer (local object URL) and in sent messages. Because the Blob store defaults to private, raw `storageUrl` is not browser-loadable, so persisted images are served via the authenticated proxy `GET /api/files/[id]` (owner-checked). Just-sent messages use the in-session `blob:` object URL directly to avoid a round-trip; object URLs are tracked in a ref and revoked on unmount.

## Decisions Log

Record non-obvious decisions here. Delete entries once they're no longer relevant.

- **Streaming approach:** Chose `createUIMessageStream` + `createUIMessageStreamResponse` (not `streamText().toUIMessageStreamResponse()`) to get `onFinish` access for message persistence.
- **Model routing:** Use a centralized provider-aware allowlist and resolver (`lib/ai/models.ts`, `lib/ai/providers.ts`) instead of hardcoding model IDs in the API route.
- **Model lineup:** Keep the latest stable Gemini Flash (currently 3.8) as the default, retain Gemini 3.1 Pro for Google quality, keep GPT-5.6 Luna/Terra as OpenAI alternatives, and leave Gemini Flash-Lite retired.
- **Model selector UX:** `selectedChatModel` is always sent from client; server stores model per chat row and updates on change. Cookie is retained only to seed first message in a new chat.
- **Reasoning selector UX:** `selectedReasoningLevel` is always sent from client and validated server-side, but is not stored in DB; cookie is the lightweight user preference for this family-scale app.
- **Provider scope:** Gemini models route directly through Google; GPT-5.6 models route through AI Gateway with `only: ['openai']` to prevent Azure/Bedrock routing. Team-level OpenAI BYOK can be enabled in Vercel without app code changes. Search tools and reasoning options are selected per provider.
- **Sidebar:** Uses shadcn sidebar primitives instead of custom implementation. Cookie-based collapse persistence, defaults to collapsed.
- **Lint script:** `tsc --noEmit` (not `next lint`) because Next 16 dropped the previous invocation.
- **shadcn/Tailwind v4:** Keep the established Radix UI behavior and visual classes, but use the current `new-york`/Radix registry, unified `radix-ui` package, CSS-first `@theme inline` tokens, and `tw-animate-css`; do not overwrite primitives from the registry because current defaults intentionally restyle controls.
- **Chat API trust model:** Server now treats DB history as canonical and uses client payload only for the latest user message plus transport trigger metadata (`submit-message`/`regenerate-message`).
- **Rate limit metric:** Switched from user message count to assistant reply count so duplicate message-id replay cannot bypass limits.
- **Quota concurrency control:** Added DB reservation slots (`assistant_generation_reservations`) checked in a transaction before streaming to prevent parallel requests from overshooting daily assistant limits.
- **Auth hardening:** Added DB-backed lockout (5 failed attempts, 15-minute lock, 600ms failure delay) to keep brute-force protection minimal but effective for family-scale usage.
- **Attachment trust model:** `fileId` is authoritative in `/api/chat`; server ignores client file URL/media metadata and hydrates canonical file parts from DB-owned rows.
- **First-turn uploads:** Upload route creates a `New Chat` row on demand (chat UUID is generated client-side before first message) to allow attachments before initial text submission.
- **Attachment write atomicity:** User message insert + message-file linkage insert now happen in one DB transaction for first-write paths.
- **Blob access mode:** Upload route defaults to private access and auto-falls back to public if the connected Blob store requires it (`BLOB_ACCESS` can override default).
- **Phase B reuse strategy:** Persisted message parts remain Blob-canonical; Gemini file URIs are used only at runtime model assembly so history stays provider-agnostic and tamper-resistant.
- **Hydration stability:** Mounted-only client UI now uses `useSyncExternalStore` (`useMounted`) to avoid SSR/client Radix `useId` drift without mount-effect state.
- **Migration portability:** Keep Drizzle `--> statement-breakpoint` markers between commands in migration files; the PGlite migrator executes each chunk as a prepared statement and rejects multi-command chunks.
- **MessageScroller setup:** Use the official `@shadcn/react` runtime and new-york-v4 wrapper; vendor only its upstream `scroll-fade-b` utility because installing the full `shadcn` CLI package violates the workspace's `trustPolicy=no-downgrade`, while preserving Nyusha's theme and button variants. Keep registry `content-visibility` off transcript items: its intrinsic placeholders make client-nav `last-anchor` restoration mismeasure long Markdown and settle at the absolute bottom.
- **First-turn chat URL:** After the first response finishes, update `/` to `/chat/{id}` with native `history.replaceState` instead of App Router navigation; Next integrates native history updates with `usePathname`, while avoiding a route-tree remount that resets MessageScroller from the live edge to `last-anchor`.
- **Transcript overflow:** Keep the transcript viewport vertical-only and leave wide code, tables, and math to nested scrollers; hiding all scrollbars during auto-scroll can feed viewport resize loops when horizontal overflow exists.
