# #hackthekitty 2026 — Project Report

**Project Name:** MeoW — Cat Safety Network
**Reference ID:** _[fill in your reference ID]_

---

## 1. Executive Summary

MeoW is a cat-safety network that makes sure a cat is never left without a plan.
Every cat carries a QR tag and a prioritised chain of trusted guardians, so the
right person is contacted — instantly and automatically — whether a stranger
finds a lost cat or the owner becomes unreachable. Recovery and care escalations
run on durable Temporal workflows, so the safety net keeps working reliably in
the background even across restarts.

---

## 2. Project Overview

### 2a. Why you're building what you're building

When a cat goes missing or its owner suddenly can't provide care (travel,
hospital, an emergency), there is usually **no automatic fallback**. A microchip
only helps if the cat reaches a vet; a phone number on a collar only helps if the
owner happens to answer. Nothing escalates on its own, and nobody with the cat's
care details (diet, medication, vet) is looped in.

MeoW closes that gap with two automatic escalation paths and a shared source of
truth for each cat's care instructions, so there is always a next step and always
someone who knows what the cat needs.

### 2b. How it relates to the theme

The theme is **#hackthekitty** — cats. MeoW is built end to end around cat
welfare: cat profiles, cat recovery via QR tags, and a guardian network whose
entire purpose is keeping cats cared for. The theme is the core of the product,
not a surface-level skin.

### 2c. Target Audience

- **Cat owners** who want peace of mind that their cat is covered if it's lost or
  if they can't be reached.
- **Guardians** (friends, family, neighbours, sitters) who step in during an
  emergency and need the cat's care details fast.
- **Finders** — any member of the public who finds a cat and scans its tag; they
  need no account and are guided through contacting the owner.

---

## 3. Key Features

- ☑ **QR-tag lost-cat recovery** — a finder scans a cat's tag, sees the owner's
  contact info, and submits their own details; the owner is alerted by email.
- ☑ **Auto-escalating guardian chain** — if the owner doesn't respond in 10
  minutes, guardians are notified in priority order automatically.
- ☑ **Owner "unavailable" mode** — the owner triggers the chain manually; each
  guardian gets a 30-minute window before the next is contacted.
- ☑ **Guardian magic-link access** — whoever accepts gets a secure, time-limited
  link to the cat's full care instructions.
- ☑ **AI care assistant** — a Groq-powered assistant answers guardians' care
  questions, scoped strictly to that cat's data, with prompt-injection defenses.
- ☑ **Cat & guardian profiles** — rich profiles (diet, meds, vet, personality)
  with image uploads to Cloudinary.
- ☑ **Durable workflows** — all escalations run on Temporal so timers and retries
  survive restarts.
- ☑ **QR code simulator** — a built-in demo tool to walk the scan flow without a
  physical tag.

---

## 4. Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend / templating | express-handlebars, vanilla JS, CSS |
| Backend | Node.js 20 (ES modules), Express 5 |
| Database | MongoDB (native driver) |
| Authentication | Auth0 (password-realm grant) + MongoDB-backed session layer |
| Durable workflows | Temporal (Temporal Cloud) |
| Email | Nodemailer (Gmail SMTP) |
| Image hosting | Cloudinary (uploads via multer) |
| AI assistant | Groq (`llama-3.1-8b-instant`) |
| QR generation | `qrcode` |
| Security | helmet (CSP + nonces), `csrf-csrf`, `express-rate-limit` |

---

## 5. Technical Architecture

The application follows a strict **three-layer separation**, with a separate
**Temporal worker** process running the durable workflows, and several external
services.

```
                         ┌──────────────────────────────┐
   Browser / Finder ───► │  index.js                    │
                         │  routes, CSP, CSRF, limits    │
                         └──────────────┬───────────────┘
                                        │
                         ┌──────────────▼───────────────┐
                         │  presentation.js              │
                         │  request shaping / pass-through│
                         └──────────────┬───────────────┘
                                        │
                         ┌──────────────▼───────────────┐
                         │  business.js                  │
                         │  domain logic, ownership checks│
                         │  workflow triggers            │
                         └──────────────┬───────────────┘
                                        │
                         ┌──────────────▼───────────────┐
                         │  persistance.js  ──►  MongoDB │
                         │  (only layer touching the DB) │
                         └───────────────────────────────┘

  Triggers (start / signal)          Runs the timers & emails
  business.js ──► temporal/client ─────────────► Temporal Cloud
                                                      │
                                          temporal/worker.js
                                          (workflows + activities)
                                                      │
                       activities call ──► mailer.js (Gmail SMTP)

  External services: Auth0 (auth) · Cloudinary (images) · Groq (AI chat)
```

**Request flow — finder scenario:** a finder opens `/scan?qr=<id>` → `index.js`
validates the QR format → `business.getCatInfoForScan` looks up the cat and owner
→ the finder submits details → `business.handleScan` creates an emergency event,
emails the owner, and starts a `foundCatWorkflow`. The workflow waits 10 minutes
for the owner to click an acknowledgment link (a Temporal **signal**); if it
never arrives, it notifies each guardian in priority order via activities that
send email and log escalation.

**Request flow — owner-unavailable scenario:** the owner posts to
`/owner/unavailable` → `business.setOwnerUnavailable` starts an
`ownerUnavailableWorkflow` that emails each guardian a magic link in priority
order, waiting 30 minutes per guardian, and stops as soon as one accepts (again
via a signal).

### Key technical decisions

- **Temporal for durable execution.** Escalation depends on long timers (10–30
  minutes) that must survive process restarts and deliver exactly once. A naive
  `setTimeout` would be lost on restart; Temporal makes the timers and retries
  durable.
- **Auth delegated to Auth0.** The app never stores or compares passwords; it
  keeps only a thin MongoDB-backed session cookie, decoupling our session model
  from Auth0's redirect flow.
- **Three-layer boundary.** Only `persistance.js` talks to MongoDB, which keeps
  ownership checks and domain rules centralized in `business.js` and makes the
  data layer swappable.
- **Cloudinary for images.** Offloads binary storage and delivery from the app
  and the database.

---

## 6. Testing Matrix

Manual test cases run against a local build (Node 20, connected to MongoDB and
Temporal Cloud). Re-confirm on your environment before final submission.

| Feature / Flow | Steps | Expected Result | Actual Result | Pass / Fail |
|----------------|-------|-----------------|---------------|-------------|
| Server boot | `npm start` | Connects to MongoDB, listens on :3000 | Connected + listening | Pass |
| Landing page (logged out) | Visit `/` | Landing page with both scenarios renders | Renders (HTTP 200) | Pass |
| Register | Submit register form | Account created via Auth0, success message | Account created | Pass |
| Login / session | Submit valid credentials | Session cookie set, redirect to `/homepage` | Logged in | Pass |
| Add cat | Add a cat with photo | Cat saved, photo on Cloudinary, QR ID generated | Cat created | Pass |
| Ownership guard (IDOR) | Try to edit another user's cat ID | "Cat not found" — no access | Access denied | Pass |
| QR scan lookup | Open `/scan?qr=<id>` | Cat + owner contact + finder form shown | Shown (HTTP 200) | Pass |
| Finder submit | Submit finder details | Event created, owner emailed, status page shown | Alert sent | Pass |
| Owner acknowledgment | Click ack link in email | Escalation stopped, success page | Escalation stopped | Pass |
| Guardian escalation | Leave scan unacknowledged | Guardian emailed after the wait window | Guardian notified | Pass |
| Owner unavailable | Mark unavailable | Guardian chain starts, magic link emailed | Chain started | Pass |
| AI care assistant | Ask a cat-care question via guardian link | Scoped answer; injection attempts refused | Answered / refused | Pass |
| Rate limit (finder) | Submit `/scan` repeatedly | Throttled after the limit | Throttled | Pass |
| CSRF-safe logout | Log out | POST with token succeeds; cross-site cannot | Logged out | Pass |
| QR simulator | Paste QR ID, "Simulate scan" | Redirects to that cat's finder page | Redirected | Pass |

---

## 8. Future Improvements

- ☐ **SMS / push notifications** in addition to email, for faster response.
- ☐ **Printable/orderable physical tags** (and NFC) generated from each cat's QR.
- ☐ **Automated test suite** (unit + integration) to replace the manual matrix.
- ☐ **Guardian mobile view / app** with one-tap accept.
- ☐ **Resolve the transitive Temporal SDK dependency advisory** on a pinned,
  tested version.

---

## 9. Tools You Used

- ☑ **Claude Code** — AI pair-programming assistant used throughout development.
- ☑ **VS Code** — editor / IDE.
- ☑ **Temporal Cloud, Auth0, Cloudinary, Groq** — managed platforms integrated
  into the app.
- ☑ **Git / GitHub** — version control and hosting.

---

## 11. Learnings & Takeaways

- **Durable execution changes how you model time.** Moving escalation timers from
  in-process timers to Temporal workflows made the logic both simpler and far more
  reliable — restarts and retries stopped being a concern.
- **Delegating auth pays off.** Using Auth0 removed a whole class of password and
  credential-handling risk, letting us focus on our own thin session layer.
- **Security is a design activity, not a final step.** Ownership checks, CSP
  nonces, CSRF, and rate limiting were most effective when built into each layer
  as we went; a later audit then caught the remaining edge cases (see the
  security report in `documentation/SECURITY.md`).

---

## 12. Acknowledgments

- **Temporal** for durable workflow execution and excellent docs.
- **Auth0** for authentication.
- **Cloudinary** for image hosting, **Groq** for fast LLM inference.
- The open-source maintainers of Express, the MongoDB Node driver,
  express-handlebars, helmet, csrf-csrf, nodemailer, multer, and qrcode.

---

## Submission Checklist

- ☐ Video demo (HD or at least 720p)
- ☑ `README.md` (prerequisites, run instructions, configuration)
- ☑ Project report (this document, in `documentation/`)
- ☐ Source code in `src/` — _note: this repo keeps source at the root; move into `src/` if the checklist is enforced strictly_
- ☑ No committed `node_modules/`, build output, or unrelated files