# notebook.md

Agent working notebook. Read the usage rules in CLAUDE.md before writing here.

## Current State

- **Completed:** Phase 0–4 plus Phase 5 hardening pass (login lockout with atomic increments, server-canonical chat context, duplicate/tamper guards, atomic assistant-slot reservations for daily limits, delete confirmations/toasts, offline submit blocking).
- **Next phase:** None scheduled. Non-Google providers deferred to a side track.
- **Stack:** Next.js 16, React 19, AI SDK 6, Tailwind 4, Drizzle ORM, Postgres.
- **Streaming:** `/api/chat` route + `useChat` hook via `@ai-sdk/react`, with `selectedChatModel` sent from client and validated against centralized allowlist.
- **Uploads:** Phase A live with direct client upload: browser uses Vercel Blob client uploads via `/api/files/upload-token`; `/api/files/upload` now finalizes server-verified metadata in `chat_files` and chat route links attachments via `message_file_attachments`.
- **Phase B:** Gemini Files reuse is now wired in `/api/chat`: runtime context hydration resolves file metadata from `chat_files`, refreshes expired/missing Gemini URIs on demand, and falls back to Blob URLs without failing the request.
- **Models:** Central registry in `lib/ai/models.ts` with Gemini-only options (3.1 Pro, 3.5 Flash, 3.1 Flash-Lite). Server-side validation rejects unknown model IDs (400). Stream errors surface user-facing message.
- **Model UX:** Compact picker in composer shows `shortName` in trigger, full names in dropdown grouped by `Pro` and `Flash`. Model choice is persisted per chat (`chats.model_id`), while `chat-model` cookie is only a default seed for brand-new chats.
- **Reasoning:** Gemini thought summaries enabled for 3.1 Pro / 3.5 Flash (`includeThoughts: true`). User-facing reasoning picker is cookie-backed with Standard→`medium` and Extended→`high`; server validates the selected level before applying Gemini `thinkingConfig`. 3.1 Flash-Lite keeps `includeThoughts: false`. `sendReasoning` defaults to true in AI SDK.
- **Auth:** Invite-only credentials auth, JWT cookie sessions, DB-backed session records, and DB-backed lockout fields on `users` (`failed_login_attempts`, `locked_until`, `last_failed_login_at`). Gated by `FAMILY_ALLOWED_EMAILS`.
- **DB schema:** `users`, `sessions`, `chats`, `messages`, `assistant_generation_reservations`, plus upload tables `chat_files` and `message_file_attachments`. Migrations in `drizzle/`.
- **Layout:** shadcn sidebar primitives (`SidebarProvider` + `AppSidebar` + `SidebarInset`). Chat routes under `(chat)` route group; auth pages standalone.
- **Build/lint:** `pnpm build`, `pnpm lint` (`tsc --noEmit`), and `npx react-doctor@latest --score --full` (100) pass on the current branch.
- **Validation:** `pnpm lint` and `pnpm build` pass after Phase 5 hardening. Browser smoke scenarios (especially auth lockout + cross-account authz) should be re-checked with two real user sessions before production rollout.

## Active Risks and Gotchas

- `LanguageModelV1` vs `LanguageModel` type mismatch is still handled via cast, now isolated in `lib/ai/providers.ts`.
- Preview model fallback retries happen only when primary stream setup fails before streaming starts; mid-stream provider failures still return an error message.
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
- **Model routing:** Added centralized Gemini-only allowlist and provider resolver (`lib/ai/models.ts`, `lib/ai/providers.ts`) instead of hardcoding model IDs in API route.
- **Model lineup:** Defaulted new chats to Gemini 3.5 Flash for everyday use, kept Gemini 3.1 Pro as the deliberate high-quality option, and use stable Gemini 3.1 Flash-Lite as the low-cost fallback / fast option.
- **Model selector UX:** `selectedChatModel` is always sent from client; server stores model per chat row and updates on change. Cookie is retained only to seed first message in a new chat.
- **Reasoning selector UX:** `selectedReasoningLevel` is always sent from client and validated server-side, but is not stored in DB; cookie is the lightweight user preference for this family-scale app.
- **Provider scope:** Gemini-only to spend GCP credits; AI Gateway/non-Google provider work is deferred as a side track (not a numbered phase).
- **Sidebar:** Uses shadcn sidebar primitives instead of custom implementation. Cookie-based collapse persistence, defaults to collapsed.
- **Lint script:** `tsc --noEmit` (not `next lint`) because Next 16 dropped the previous invocation.
- **Tailwind v4:** Compatibility migration — kept existing theme tokens, switched PostCSS plugin to `@tailwindcss/postcss`, `globals.css` imports Tailwind and references `tailwind.config.ts`.
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
