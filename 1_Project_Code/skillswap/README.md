# SkillSwap

A community skill-exchange web app: teach what you know, learn what you don't.
Built from the SkillSwap SRS and UML diagrams (Experiments 2–9).

- **Frontend:** React 19 + Vite, React Router, plain CSS (soft white & pink theme, fonts bundled locally)
- **Backend:** Node.js + Express REST API, JWT auth, bcrypt passwords
- **Database:** PostgreSQL (schema in `server/db/schema.sql`); runs built-in via PGlite, or on your own server
- **Cache:** Redis (optional — falls back to in-memory if `REDIS_URL` is empty)

```
skillswap/
├── client/              React app (Web UI → web-ui.bundle)
│   └── src/
│       ├── pages/       Landing, Auth, Home, Explore, Profile, MySkills,
│       │                Swaps, SwapDetail, Messages, Credits, Settings, Admin
│       └── components/  Nav, SwapTicket, Chat, Propose modal, UI kit
└── server/              Express API (SkillSwap Backend)
    ├── db/              schema.sql, init.js, seed.js
    └── src/
        ├── routes/      auth, users, listings, search, swaps, account, admin
        └── lib/         auth, credits (escrow ledger), calendar, cache, helpers
```

## Run it locally

**You only need Node.js 20 or newer.** No database to install: the backend uses a built-in
PostgreSQL (PGlite) and stores its data in `server/data/`. On first start it creates the
tables and loads the demo data by itself.

Open a terminal in the `skillswap` folder (the one with this README) and run:

```bash
npm install
npm run dev
```

Then open **http://localhost:5173**. That one command starts both the backend
(http://localhost:5000) and the frontend. Press `Ctrl+C` to stop both.

To get the demo data back, stop the app and run `npm run reset`.

### Using your own PostgreSQL server (optional)

Copy `server/.env.example` to `server/.env` and set `DATABASE_URL`, for example
`postgres://skillswap:skillswap@localhost:5432/skillswap`. The tables and demo data are
created automatically on first start, the same as the built-in database.

### Demo accounts (password: `password123`)

| Email | Who |
|---|---|
| aisha@example.com | Aisha Sharma — has a proposal waiting, a booked yoga session, and the completed "Python for Guitar" swap from the object diagram |
| rohan@example.com | Rohan Verma — verified user (trust badge) |
| kabir@example.com | Kabir Khan — sent Aisha a proposal |
| meera@example.com / priya@example.com | mid-negotiation swap |
| admin@skillswap.local | Admin dashboard |

Run `npm run reset` (with the app stopped) to restore the demo data.

## How the SRS maps to the code

| Requirement | Where |
|---|---|
| REQ-1–3 register, email verify, password reset | `routes/auth.js`, `pages/Auth.jsx` |
| REQ-4–5 profile, skills offered/wanted with level | `routes/users.js`, `routes/listings.js`, `pages/Settings.jsx`, `pages/MySkills.jsx` |
| REQ-6, 8 search + filters (keyword, category, city, availability, rating, verified) | `routes/search.js`, `pages/Explore.jsx` |
| REQ-7 rule-based matching (skill overlap, location, availability — no AI) | `GET /api/matches`, Home page |
| REQ-9–13 propose, accept/decline/counter, credits, schedule, reschedule/cancel | `routes/swaps.js`, `pages/SwapDetail.jsx` |
| REQ-14, 17 in-app messages per swap, link/profanity/spam filter | `routes/swaps.js` messages, `components/Chat.jsx` |
| REQ-15, 16 notifications + preferences | `lib/helpers.js notify()`, bell in `Nav.jsx`, Settings |
| REQ-18, 19, 22 starter credits, ledger, escrow | `lib/credits.js`, `pages/Credits.jsx` |
| REQ-20, 21 reviews, low-rating flag | `/swaps/:id/review`, Admin "Low ratings" |
| REQ-23–25 admin: moderate, reports, disputes, analytics | `routes/admin.js`, `pages/Admin.jsx` |
| REQ-28 age 16+ | registration check |
| REQ-30 in-person safety guidance | session card + scheduling form |
| REQ-34 role-restricted admin | `requireAdmin` middleware |
| REQ-35 right to erasure | `DELETE /api/users/me` (anonymises) |
| REQ-40 audit trail | `swap_events` + `credit_transactions` tables |

### Swap state machine (Experiment 6 state chart)

```
DRAFT → PROPOSED → DECLINED
            │  └→ NEGOTIATING ⟲ counter
            └──────────┴→ ACCEPTED → SCHEDULED ⟲ reschedule → CANCELLED
                                          └→ COMPLETED → CLOSED (both reviewed)
```

The sequence diagram (Experiment 7) is followed exactly: proposal → forward → respond →
both confirm → calendar event created → confirmation sent to both users.

Credits offered in a proposal are held in escrow when it's sent, returned on decline/cancel,
and released to the teacher when both users mark the swap complete. A dispute pauses completion
until an admin refunds or releases the credits.

## What's simulated in this local build

These need third-party accounts/keys (SRS 3.3), so they're stubbed with clear hooks:

- **Email/SMS (SendGrid/Twilio):** messages are printed to the server console; verification and reset links are also shown in the UI.
- **Google Calendar:** the backend generates an event id and a working "Add to Google Calendar" link instead of calling the API (`lib/calendar.js`).
- **OAuth (Google/Facebook) and MFA:** not wired up; email + password with JWT is implemented.
- **Identity verification vendor:** "Verify my identity" grants the trust badge once email is verified and the profile has a bio and city.
- **Real-time chat:** uses 4-second polling rather than WebSockets.

## API overview

All routes are under `/api`. Send `Authorization: Bearer <token>` for protected routes.

```
POST /auth/register | /auth/login | /auth/verify-email | /auth/forgot-password | /auth/reset-password
GET  /auth/me
PUT  /users/me | /users/me/notifications       POST /users/me/verify-identity     DELETE /users/me
GET  /users/:id
GET  /skills   POST /skills
GET  /listings/mine   POST /listings   PUT/DELETE /listings/:id
GET  /search?q=&category=&location=&availability=&type=OFFER|WANT&verified=true&minRating=&sort=
GET  /matches
GET  /swaps   POST /swaps   GET /swaps/:id   DELETE /swaps/:id (draft)
POST /swaps/:id/send | respond | session | confirm | reschedule | cancel | complete | review | dispute
GET/POST /swaps/:id/messages
GET  /notifications   POST /notifications/read-all   POST /notifications/:id/read
GET  /credits   POST /reports
GET  /admin/stats | /admin/users | /admin/flagged | /admin/reports | /admin/disputes
POST /admin/users/:id/action | /admin/reports/:id/close | /admin/disputes/:id/resolve
```
