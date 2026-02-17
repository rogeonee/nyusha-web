# Nyusha Web Chatbot Upgrade Plan (2026)

## Goal

Modernize the existing minimal chatbot app in-place (do not replace with template), while keeping operations simple for 2-4 family users.

## Key Decisions

1. Codebase strategy: Upgrade current app (`/Users/rogeonee/Development/projects/nyusha-web`) and keep `/Users/rogeonee/Development/projects/nyusha-web/ai-chatbot` only as reference.
2. Auth: Use lightweight email+password auth with invite-only registration.
3. Persistence: Add Postgres + Drizzle for per-user chat history.
4. Model setup:

- Google models use direct BYOK (`GOOGLE_GENERATIVE_AI_API_KEY`) to spend GCP credits.
- Non-Google models via Vercel AI Gateway are deferred to a side track (not part of numbered phases).

5. Primary model menu:

- Gemini: `gemini-3-flash-preview` (fallback `gemini-2.5-flash`)

6. Deployment target: Vercel + managed Postgres.
7. Keep scope lean: no artifact/doc editor tooling, no heavy enterprise features.

## Non-Goals (MVP)

1. Social OAuth providers.
2. Multi-tenant/team permissions.
3. Complex agent/tool orchestration.
4. Blob file uploads and document workflows.
5. Admin UI beyond basic config.

## Phase Plan

## Phase 0 - Baseline Migration

1. Upgrade framework/runtime packages (Next.js/React/AI SDK/Tailwind).
2. Replace `ai/rsc` flow with API route + AI SDK UI hook approach.
3. Preserve existing visual style unless needed for migration.

Deliverable: App streams chat responses using modern AI SDK path, with no DB/auth yet.

## Phase 1 - Auth Foundation

1. Add credentials auth (email+password).
2. Add invite allowlist using `FAMILY_ALLOWED_EMAILS`.
3. Disable public/open registration flows.
4. Add basic session handling and route protection.

Deliverable: Only invited family accounts can access chats.

## Phase 2 - Chat Persistence

1. Add Drizzle schema and migrations:

- `users`
- `sessions`
- `chats`
- `messages`

2. Save user prompts and assistant replies per chat.
3. Implement chat list, open previous chat, delete chat.
4. Auto-generate chat title from first user prompt.

Deliverable: History survives reload and is user-scoped.

## Phase 3 - Model Routing and Controls

1. Implement strict model registry (typed allowlist).
2. Add per-chat model selection.
3. Route Gemini IDs via Google provider only (Gemini-only scope).
4. Add safe fallback if a selected model is unavailable.

Deliverable: Reliable Gemini model support aligned with cost goals.

## Phase 4 - Quality-of-Life Upgrades

1. Regenerate last assistant response.
2. Edit and resend user prompt.
3. Better loading/error/offline states.
4. Basic per-user daily rate limiting.
5. Show lightweight response metadata (latency/tokens when available).

Deliverable: Day-to-day usability on par with modern small-team chat apps.

## Phase 5 - Production Hardening

1. Finalize Vercel env vars and deployment settings.
2. Run migrations in CI/deploy workflow.
3. Validate auth, persistence, and model routing in production.
4. Share final family URL.

Deliverable: Stable production deployment with clear operational setup.

## Side Track - Non-Google Providers (Deferred)

1. Re-introduce AI Gateway routing for non-Google models after Gemini credits/cost strategy changes.
2. Add model allowlist entries for Grok/Kimi when side track is activated.
3. Keep Gemini path unchanged while side track is deferred.

## Environment Variables

1. `AUTH_SECRET`
2. `POSTGRES_URL`
3. `GOOGLE_GENERATIVE_AI_API_KEY`
4. `AI_GATEWAY_API_KEY`
5. `FAMILY_ALLOWED_EMAILS` (comma-separated)

## Risks and Mitigations

1. AI SDK migration breakage from old `ai/rsc` usage.

- Mitigation: Complete Phase 0 first and verify streaming before adding DB/auth complexity.

2. Model ID/provider changes over time.

- Mitigation: central model registry with fallback model per provider.

3. Overengineering for tiny user base.

- Mitigation: keep schema and auth minimal, defer non-essential features to post-MVP.
