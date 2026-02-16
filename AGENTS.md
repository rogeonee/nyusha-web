# AGENTS.md

This file defines operating guidance for non-Claude coding agents working in this repo. Claude agents: see `CLAUDE.md` instead (same rules, different format).

## First Steps

1. Read `UPGRADE_PLAN.md` for the phase plan and project scope.
2. Read `notebook.md` — start with **Current State** for orientation, then check **Active Risks and Gotchas** before touching anything.
3. The `ai-chatbot/` directory is a reference implementation only. Do not merge it into the main app.

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

1. Use minimal schema only: users, sessions, chats, messages.
2. Persist user and assistant messages for each chat.
3. Keep database layer simple and explicit; avoid premature abstraction.
4. Write reversible migrations and keep schema changes small per PR.

## Implementation Priorities

1. Complete phases in order from `UPGRADE_PLAN.md`.
2. Finish streaming migration before auth and DB wiring.
3. Add tests/smoke checks for each phase before moving forward.
4. If a phase reveals unexpected breakage, document it in `notebook.md` and resolve before adding new features.

## Practical Working Style

1. Keep diffs focused and avoid cross-cutting refactors not tied to current phase.
2. Use `notebook.md` as described below.

## notebook.md Usage Rules

`notebook.md` is a shared scratchpad for agents — not a changelog. Keep it under ~80 lines.

**Structure (maintain these sections):**

1. **Current State** — Quick orientation: what's done, what's next, stack summary. Update this after every phase or major task completes.
2. **Active Risks and Gotchas** — Non-obvious things that will bite the next agent. Remove entries once resolved.
3. **Decisions Log** — Non-obvious technical choices and *why*. Remove entries once they're no longer relevant.

**Rules:**

- Do NOT record "what changed" file lists — git history covers that.
- Do NOT create per-session or per-date entries — update the existing sections in place.
- Do NOT duplicate information obvious from the code itself.
- DO add a risk/gotcha when you hit something surprising that isn't visible in code.
- DO add a decision entry when you choose between non-obvious alternatives.
- DO prune aggressively: after a phase ships, collapse its details into the "Current State" one-liner and remove resolved risks.

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
