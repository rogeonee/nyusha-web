# Nyusha Chat (Web)

Minimal family chat app on Next.js + AI SDK.

## Local Setup

1. Install dependencies:

```bash
pnpm install
```

2. Copy environment template and fill values:

```bash
cp .env.example .env.local
```

3. Generate and run database migration:

```bash
pnpm db:generate
pnpm db:migrate
```

4. Start development server:

```bash
pnpm dev
```

## Required Environment Variables

- `AUTH_SECRET`
- `POSTGRES_URL`
- `GOOGLE_GENERATIVE_AI_API_KEY`
- `AI_GATEWAY_API_KEY`
- `FAMILY_ALLOWED_EMAILS` (comma-separated invite list)

## Scripts

- `pnpm dev`
- `pnpm lint`
- `pnpm build`
- `pnpm db:generate`
- `pnpm db:migrate`

## Deploy (Vercel)

1. Create a Vercel Postgres database.
2. Set env vars in Vercel project settings (Production + Preview).
3. Run migrations during deploy (`pnpm db:migrate`).
