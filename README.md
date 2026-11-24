# SkillSwap

A community skill-exchange web app: teach what you know, learn what you don't.
Software Engineering final project by Vidushi Singh, Vikalp Tiwari and Vikalp Singh.

## Tech stack

- **Frontend:** React 19 + Vite, React Router, plain CSS
- **Backend:** Node.js + Express REST API, JWT auth, bcrypt passwords
- **Database:** PostgreSQL schema, runs built-in via PGlite (or your own server)
- **Cache:** Redis (optional, falls back to in-memory)

## Repository layout

```
1_Project_Code/skillswap/   Source code (client/ and server/)
2_Presentation/             Project presentation
```

## Run it locally

Requires **Node.js 20 or newer**. No database install needed; demo data is created on first start.

```bash
cd 1_Project_Code/skillswap
npm install
npm run dev
```

Open http://localhost:5173 (the API runs on http://localhost:5000).
Run `npm run reset` (with the app stopped) to restore the demo data.

## Demo accounts (password: `password123`)

| Email | Role |
|---|---|
| aisha@example.com | Regular user with a pending proposal and booked session |
| rohan@example.com | Verified user |
| kabir@example.com | Regular user |
| meera@example.com / priya@example.com | Mid-negotiation swap |
| admin@skillswap.local | Admin dashboard |

See [1_Project_Code/skillswap/README.md](1_Project_Code/skillswap/README.md) for more detail.
