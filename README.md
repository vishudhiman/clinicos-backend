# ClinicOS Backend

ElysiaJS + Prisma + PostgreSQL API for ClinicOS, including the LangGraph/Gemini
appointment agent and a simple in-process notification system (email + in-app).

Pairs with [clinicos-frontend](../clinicos-frontend) — set `NEXT_PUBLIC_API_URL` in that
repo to wherever this one is running.

## Setup

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL, GEMINI_API_KEY, etc.
npm run prisma:migrate
npm run prisma:seed
npm run dev
```

Runs on `http://localhost:4002` by default (`PORT` in `.env` to change it).

## Structure

```text
src/
  agents/       LangGraph appointment agent
  routes/       Elysia route handlers
  services/     scheduling engine, notification service
  schemas/      zod request validation
  tools/        LangChain tools the agent calls
prisma/
  schema.prisma
  seed.ts
```

## Notifications

Booking confirmations, cancellations, reschedules, and 24h/1h reminders are sent via
email (nodemailer/SMTP) and recorded in-app (`Notification` model). No queue or worker
process — a simple in-process interval (`services/notifications/scheduler.ts`) polls for
due reminders. Adding a channel (WhatsApp, voice) means implementing
`NotificationChannelHandler` and registering it — no appointment logic changes.
