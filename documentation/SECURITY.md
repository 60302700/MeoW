# Security Report — MeoW

This document describes the security posture of MeoW: the threat model, the
controls in place, the findings from an internal audit, and how each was
resolved. It is intended as both a reference for maintainers and a summary for
reviewers.

---

## Threat model

MeoW handles three categories of sensitive data:

- **Owner accounts** — identity, contact details, and authenticated sessions.
- **Cat care data** — diet, medications, medical conditions, and vet contacts.
- **Contact exposure** — a finder who scans a cat's tag is deliberately shown
  the owner's contact info, and guardians receive time-limited care links.

The primary adversaries we design against:

1. An unauthenticated attacker hitting public endpoints (`/scan`, guardian
   magic links, login/register).
2. A logged-in user attempting to read or modify another user's cats,
   guardians, or account (horizontal privilege escalation / IDOR).
3. A cross-site attacker trying to ride a victim's session (CSRF) or inject
   script into a rendered page (XSS).
4. Abuse of public, side-effecting endpoints (email bombing, workflow spam).
5. Prompt injection against the guardian AI care assistant.

---

## Controls in place

### Authentication & sessions
- Authentication is fully delegated to **Auth0** (password-realm grant). The app
  never stores or compares passwords itself.
- On top of Auth0, the app maintains a thin **MongoDB-backed session** keyed by a
  UUIDv4 cookie value.
- Session cookies are `httpOnly`, `sameSite=strict`, and `secure` in production,
  with a **30-minute idle TTL** enforced by a MongoDB TTL index.

### Authorization
- Every cat and guardian operation (view, edit, delete, toggle, photo upload)
  resolves the user from the session and **verifies record ownership** in the
  business layer before acting. A mismatch returns a generic "not found" error,
  avoiding resource enumeration.

### CSRF
- **Double-submit CSRF protection** (`csrf-csrf`) is applied to all
  state-changing form posts via a global middleware.
- Multipart routes re-apply the check explicitly after the file parser runs
  (the token isn't available until then); this requirement is documented inline
  so future upload routes don't silently skip it.
- Logout is a **CSRF-protected POST**, so a cross-site page cannot force-logout a
  user.

### Content Security Policy
- **helmet** sets a strict CSP with a **per-request nonce** for scripts.
- `script-src-attr 'none'` blocks all inline event handlers; scripts are
  nonce'd, external blocks.
- `frame-ancestors 'none'` prevents clickjacking.

### Rate limiting
- **Authentication** endpoints: 10 requests / 15 min per IP.
- **Public finder endpoint** (`POST /scan`): 8 / hour per IP — it emails the
  owner and starts a workflow, so it is a prime abuse target.
- **AI chat**: IP-based and per-token limits to stop a single link being hammered.

### Tokens & magic links
- Guardian access tokens and owner-acknowledgment tokens are **UUIDv4**
  (122 bits of entropy — not guessable or enumerable).
- Guardian tokens **expire after 48 hours**, are single-use, and can be
  invalidated when a peer accepts.

### Output handling
- All templating uses Handlebars with **automatic HTML escaping**. The only
  triple-stache usage is the layout body slot, never user data — so there is no
  stored/reflected XSS surface.

### AI care assistant
- User messages are length-capped, **screened against a prompt-injection pattern
  set**, and stripped of control characters before reaching the model.
- The system prompt treats all cat data strictly as data, and the endpoint
  requires an acknowledged guardian token.

### Secrets management
- All credentials (MongoDB, Auth0, Temporal, Gmail, Cloudinary, Groq, CSRF
  secret) live only in `.env`, which is **git-ignored and never committed**.
  A credential-free `.env.example` documents the required keys.

---

## Internal audit — findings & resolutions

An internal review was performed across the routing, business, persistence, and
template layers. Findings, by severity:

### Medium

| Finding | Resolution |
|---------|-----------|
| `POST /scan` (public) sent email + created a DB event + started a workflow with **no rate limit**, enabling email-bombing of an owner. | Added an 8/hour-per-IP limiter. |
| `server.log` was **committed to the repo**, leaking submitted cat data. | Removed from tracking and added to `.gitignore`. |
| `POST /scan/:eventId/claim` accepted **any guardian ID** with no ownership check, letting anyone prematurely stop an escalation. | The business layer now verifies the guardian belongs to the event's cat owner before assigning. |

### Low / hardening

| Finding | Resolution |
|---------|-----------|
| `express.json()` is global, so auth fields could arrive as objects (`{"$ne":null}`) — a NoSQL-operator injection surface. Not exploitable today (auth goes through Auth0), but unguarded. | Added string-type guards on login, register, and forgot-password inputs. |
| The CSRF multipart exemption was **fragile** — a future upload route could forget to re-apply protection. | Documented the requirement inline at the middleware. |
| Logout was a `GET` (logout-CSRF). | Converted to a CSRF-protected `POST`. |

### Known / accepted

- **Dependencies:** `npm audit` reports 9 moderate advisories, all transitive
  from `protobufjs` inside the Temporal SDK. The only fix is a breaking SDK
  downgrade, and the practical risk is low (Temporal communicates solely with a
  trusted Temporal Cloud namespace). Tracked, not yet applied, to avoid
  destabilizing the durable workflows.
- **Owner contact exposure on scan** is intentional: a finder must be able to
  reach the owner. Enumeration is mitigated because the QR code is an
  unguessable UUIDv4.

---

## Aikido security scan

The repository was scanned with **Aikido** (SAST + AI code audit). Every
addressable finding has been fixed; the remaining flagged items were
investigated and confirmed to be false positives. Screenshots of the scan
(including the post-fix **Retest** state) are attached to the project report.

### Fixed

| Class | Severity | Location | Fix |
|-------|----------|----------|-----|
| NoSQL injection | Critical | `src/persistance.js`, `src/temporal/activities.js` | Every `findOne` / `updateOne` / `deleteOne` filter built from an external value (`sessionId`, `token`, `authSub`, `email`, `qrCodeId`, cat `name`, guardian `priorityOrder`) now wraps it as `{ $eq: value }`, so an attacker-supplied object can never be interpreted as a query operator (blocks the `?field[$ne]=x` trick). |
| Open redirect | Critical | `src/index.js` (CSRF error handler) | The `redirectTo` derived from the `Referer` pathname now must start with a single `/` and not `//` or `/\`, so a scheme-relative `//evil.com` cannot send users off-site. |
| Stored HTML injection | Medium | `src/mailer.js` (`sendGuardianMagicLinkEmail`) | `guardianName`, `ownerName`, and `catList` are now HTML-escaped with `xmlEsc` before interpolation into the email body, matching the other email functions in the file. |
| NoSQL injection (auth inputs) | — | `src/index.js` | String-type guards (`allStrings`) on login / register / forgot-password inputs, as defense-in-depth alongside the `$eq` wrapping. |

### Investigated — false positives (no change needed)

| Flagged class | Why it is not exploitable |
|---------------|---------------------------|
| SSTI via `express.render()` | Every `res.render` call uses a **hardcoded template name**; only the locals are dynamic, and Handlebars auto-escapes `{{ }}` output. User input never controls a template's source or path. |
| XSS via `{{{body}}}` | Both occurrences are the **express-handlebars layout convention**, where `body` is the already-rendered, already-escaped HTML of the child view — never attacker-supplied. No route sets a `body` local manually. |

### Reproducing the scan

- Static/code scan: connect the repository at **app.aikido.dev** and open the
  report; use **Retest** after fixes to confirm resolution.
- Dependency scan: `npm audit --omit=dev` (the remaining moderate advisories are
  transitive from the Temporal SDK — see *Known / accepted* above).

### Scan screenshots

_Attach the Aikido scan screenshots here (or in the project report), showing the
findings and their resolved/Retested state._

---

## Responsible disclosure

If you discover a vulnerability, please open a private report to the maintainers
rather than a public issue, and allow a reasonable window for a fix before any
disclosure.