# AGENTS.md

This file defines operating guidance for non-Claude coding agents working in this repo. Claude agents: see `CLAUDE.md` instead (same rules, different format).

## First Steps

1. Read `notebook.md` before touching code, starting with **Current State** and then **Active Risks and Gotchas**.
2. Treat `ai-chatbot/` as reference only. Do not merge or replace the root app with it.
3. Keep your task scoped to the requested outcome and avoid unrelated refactors.

## Hard Project Constraints

1. Keep the existing app as the main codebase.
2. Keep product scope minimal for 2-4 family users.
3. Prefer direct, maintainable code over generalized frameworks.
4. Do not introduce artifact/document editor subsystems from the template app.
5. Do not enable open/public registration.

## Auth and Access Rules

1. Auth remains credentials-based (email + password), invite-only.
2. Registration must be gated by `FAMILY_ALLOWED_EMAILS`.
3. Chat and history endpoints must require session auth.
4. Any temporary dev auth bypass must be isolated, obvious, and short-lived.

## Model and Provider Rules

1. Model IDs must come from the centralized allowlist.
2. Gemini models route through direct Google provider (`GOOGLE_GENERATIVE_AI_API_KEY`).
3. Non-Google models, when enabled, must route through AI Gateway.
4. Never trust arbitrary client-supplied model IDs.
5. Keep a safe fallback model for each provider path.

## Data and Persistence Rules

1. Keep schema and DB layer lean and explicit.
2. Persist user and assistant messages per chat.
3. Keep migrations small and reversible.
4. Avoid premature database abstractions.

## Maintenance Priorities

1. Protect working production behavior first: auth, streaming, persistence, model routing.
2. Add or run relevant tests/smoke checks for every behavior you change.
3. Document non-obvious risks and decisions in `notebook.md`.
4. Resolve regressions before expanding scope.

## notebook.md Usage Rules

`notebook.md` is a shared scratchpad for agents, not a changelog. Keep it under ~80 lines.

**Structure (maintain these sections):**

1. **Current State**: Quick orientation (done/next/stack summary).
2. **Active Risks and Gotchas**: Non-obvious issues likely to surprise the next agent.
3. **Decisions Log**: Non-obvious technical choices and rationale.

**Rules:**

- Do NOT list file-by-file changes.
- Do NOT create per-session or per-date logs.
- Do NOT duplicate obvious code facts.
- DO add risks/gotchas that are not visible directly in code.
- DO add decisions when tradeoffs are non-obvious.
- DO prune resolved notes aggressively.

## Quick Validation Checklist

1. Can an invited user sign in successfully?
2. Does chat streaming work end-to-end?
3. Is chat history persisted and reloadable?
4. Do model selections map to the intended provider route?
5. Does deployment config run on Vercel with required env vars?

## Environment Variables (expected)

1. `AUTH_SECRET`
2. `POSTGRES_URL`
3. `GOOGLE_GENERATIVE_AI_API_KEY`
4. `AI_GATEWAY_API_KEY`
5. `FAMILY_ALLOWED_EMAILS`
