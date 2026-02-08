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
