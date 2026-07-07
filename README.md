# MeoW — Cat Safety Network

MeoW makes sure your cat is never left without a plan. Every cat gets a QR tag
and a chain of trusted guardians, so the right person is contacted — instantly
and automatically — whether a stranger finds your cat blocks from home or you're
simply unreachable.

---

## Two ways MeoW protects your cat

**1. Someone finds your cat (the QR tag flow)**

1. A finder scans the QR tag on your cat's collar with any phone.
2. They see your contact details and leave their name, phone, and where they found your cat.
3. You're alerted instantly by email with the finder's info.
4. If you don't respond within **10 minutes**, your guardians are contacted automatically, in priority order (10-minute window each).

**2. You trigger the alert (the guardian chain)**

1. You mark yourself unavailable from your dashboard.
2. Your first guardian is notified and given a **30-minute** window to accept.
3. If they don't respond, the next guardian is contacted automatically.
4. Whoever accepts gets a secure link to full care instructions — diet, meds, and vet contact — plus an AI care assistant.

Both escalation chains run on **durable Temporal workflows**, so they keep
running reliably in the background until someone responds — even across restarts.

---

## Tech stack

- **Runtime:** Node.js 20+ (ES modules)
- **Web:** Express 5, express-handlebars
- **Database:** MongoDB (native driver)
- **Auth:** Auth0 (password-realm grant) with a MongoDB-backed session layer
- **Durable workflows:** Temporal (Temporal Cloud)
- **Email:** Nodemailer (Gmail SMTP)
- **Image hosting:** Cloudinary (via multer uploads)
- **AI care assistant:** Groq (`llama-3.1-8b-instant`)
- **Security:** helmet CSP with per-request nonces, `csrf-csrf` double-submit CSRF, `express-rate-limit`

---

## Architecture

All application code lives under `src/`. A clean three-layer separation:

```
src/index.js          HTTP routes, middleware, CSP, CSRF, rate limiting
   |
src/presentation.js   thin pass-through / request shaping
   |
src/business.js       domain logic, ownership checks, workflow triggers
   |
src/persistance.js    MongoDB access (the only layer that talks to the DB)
```

Supporting modules:

- `src/temporal/` — durable workflow definitions, activities, client, and worker
- `src/mailer.js` — all transactional email
- `src/cloudinary.js` — image upload helpers
- `src/views/` — Handlebars templates and layouts
- `src/public/` — static assets (client JS)

### Temporal workflows

| Workflow | Trigger | Behavior |
|----------|---------|----------|
| `foundCatWorkflow` | Finder scans a QR tag | Waits 10 min for owner acknowledgment, then escalates to guardians (10-min windows each) |
| `ownerUnavailableWorkflow` | Owner marks themselves unavailable | Notifies each guardian in priority order with a 30-min window, emailing care links |
| `guardianEscalationWorkflow` | Legacy DB-only escalation | Retained for compatibility |

All workflows run on the `meow-escalation` task queue.

---

## Prerequisites

- **Node.js 20+**
- A **MongoDB** database (Atlas or self-hosted)
- An **Auth0** application with the password-realm grant enabled
- A **Temporal Cloud** namespace with an API key
- A **Gmail** account with an app password (for SMTP)
- A **Cloudinary** account (for image uploads)
- A **Groq** API key (for the guardian AI assistant)

---

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Create your environment file from the template
cp .env.example .env
#    then fill in every value (see the table below)

# 3. Start the web app
npm start                 # http://localhost:3000

# 4. In a second terminal, start the Temporal worker
npm run worker
```

The web app and the Temporal worker are **separate processes** — both must be
running for the escalation chains to fire. Without the worker, the site still
works but alerts won't escalate to guardians.

---

## Environment variables

All configuration lives in `.env` (git-ignored — never commit it).

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | MongoDB connection string |
| `MONGODB_DB_NAME` | Database name |
| `APP_URL` | Public base URL used in email links (e.g. `http://localhost:3000`) |
| `CSRF_SECRET` | Random secret for CSRF token signing |
| `AUTH0_ISSUER_BASE_URL` | Auth0 tenant issuer URL |
| `AUTH0_BASE_URL` | This app's base URL registered in Auth0 |
| `AUTH0_CLIENT_ID` / `AUTH0_CLIENT_SECRET` | Auth0 application credentials |
| `AUTH0_SECRET` | Auth0 session secret |
| `AUTH0_M2M_CLIENT_ID` / `AUTH0_M2M_CLIENT_SECRET` | Machine-to-machine credentials (management API) |
| `TEMPORAL_ADDRESS` | Temporal Cloud gRPC endpoint |
| `TEMPORAL_NAMESPACE` | Temporal namespace |
| `TEMPORAL_API_KEY` | Temporal Cloud API key |
| `GMAIL_USER` | Gmail address used to send mail |
| `GMAIL_APP_PASSWORD` | Gmail app password (not your login password) |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Cloudinary credentials |
| `GROQ_API_KEY` | Groq API key for the AI care assistant |

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start the Express web server |
| `npm run worker` | Start the Temporal worker (required for escalations) |
| `npm run migrate:images` | One-off: migrate stored images to Cloudinary |
| `npm run migrate:users` | One-off: migrate users to Auth0 |
| `npm run migrate:cats` | One-off: migrate cat age fields to date-of-birth |

---

## Trying the flow locally

You can't scan a screen with the same laptop, so a demo tool is built in:

1. Log in and open a cat's profile — copy its **QR Code ID**.
2. From the landing page, click **Try the QR Simulator**.
3. Paste the ID and press **Simulate scan** — you'll land on that cat's finder
   page exactly as if someone scanned the physical tag.

To watch the guardian escalation without waiting the full window, temporarily
lower the timers in `src/temporal/workflows.js` (e.g. `'10 minutes'` -> `'30 seconds'`),
restart the worker, and revert when done.

> **Opening a guardian magic link:** open it in a **private / incognito window**
> (or a browser where no owner is signed in). The session cookie uses
> `sameSite=strict` for stronger CSRF protection, which means that if an owner is
> already logged in in the same browser, their session identifier collides with
> the guardian request's CSRF token and the action is rejected. A clean
> (incognito) session avoids this. This is a deliberate security trade-off, not a
> bug — a real guardian on their own device would never hit it.

---

## Security

- **Authentication** is delegated to Auth0; the app keeps only a thin,
  MongoDB-backed session cookie (`httpOnly`, `sameSite=strict`, `secure` in
  production, 30-minute idle TTL).
- **Authorization:** every cat/guardian operation verifies ownership in the
  business layer, so users can only touch their own records.
- **CSRF:** double-submit protection on all state-changing form posts, including
  a CSRF-protected logout.
- **CSP:** helmet content-security-policy with a per-request nonce; no inline
  event handlers.
- **Rate limiting** on authentication, the public finder endpoint, and the AI chat.
- **Magic-link tokens** are UUIDv4, expire after 48 hours, and are single-use.
- **AI assistant** input is sanitized and screened for prompt injection before
  reaching the model.
- **Secrets** live only in `.env`, which is git-ignored and never committed.

---

## Documentation

Full project documentation is in [`documentation/`](documentation/) as PDFs:

- **Project-Report.pdf** — overview, architecture, tech stack, and testing matrix
- **Security-Scan-Report.pdf** — controls and the Aikido scan findings (all resolved), with before/after scan screenshots
- **Threat-Model.pdf** — trust boundaries and applicative threat scenarios

---

## License

ISC