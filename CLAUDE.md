# CLAUDE.md

This file defines project-specific operating guidance for coding agents working in `/Users/rogeonee/Development/projects/nyusha-web`.

## Source of Truth

1. Agent working notes (private, implementation scratchpad): `/Users/rogeonee/Development/projects/nyusha-web/notebook.md`
2. Legacy reference implementation to borrow patterns from only: `/Users/rogeonee/Development/projects/nyusha-web/ai-chatbot`
3. Existing production app behavior and constraints in this repo are the default baseline; do not replace the root app.

## Hard Project Constraints

1. Keep the existing app as the main codebase. Do not replace root app with the template app.
2. Keep product minimal for 2-4 users. Reject unnecessary enterprise abstractions.
3. Prefer direct, maintainable code over generalized frameworks.
4. Do not introduce artifact/document editor subsystems from template.
5. Do not enable open registration for public users.

## Auth and Access Rules

1. Auth approach is credentials-based (email+password), invite-only.
2. Gate registration with `FAMILY_ALLOWED_EMAILS`.
3. All chat/history endpoints must require session auth.
4. If auth is temporarily disabled in development, keep that change isolated and clearly marked.

## Model and Provider Rules

1. Model IDs must come from a centralized allowlist.
2. Gemini models route via direct Google provider (`GOOGLE_GENERATIVE_AI_API_KEY`).
3. Grok/Kimi models route via AI Gateway.
4. Do not accept arbitrary model IDs from client input.
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

`notebook.md` is a shared scratchpad for agents — not a changelog. Keep it under ~80 lines.

**Structure (maintain these sections):**

1. **Current State** — Quick orientation (done/next/stack summary).
2. **Active Risks and Gotchas** — Non-obvious issues likely to surprise the next agent.
3. **Decisions Log** — Non-obvious technical choices and rationale.

**Rules:**

- Do NOT record "what changed" file lists — git history covers that.
- Do NOT create per-session or per-date entries — update the existing sections in place.
- Do NOT duplicate information obvious from the code itself.
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
