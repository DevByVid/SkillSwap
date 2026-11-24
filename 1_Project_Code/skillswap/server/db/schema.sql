-- SkillSwap database schema (PostgreSQL)
-- Mirrors the class diagram (Experiment 5) and data stores D1–D6 (Experiment 3).

DROP TABLE IF EXISTS moderation_actions, disputes, reports, reviews, notifications,
  messages, swap_events, sessions, swaps, credit_transactions, credit_accounts,
  listings, skills, users CASCADE;

-- D1 Users (User / VerifiedUser / Admin via role + verified flags)
CREATE TABLE users (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(100) NOT NULL,
  email           VARCHAR(160) NOT NULL UNIQUE,
  password_hash   VARCHAR(200) NOT NULL,
  date_of_birth   DATE NOT NULL,
  bio             TEXT DEFAULT '',
  location        VARCHAR(100) DEFAULT '',
  availability    VARCHAR(200) DEFAULT '',
  avatar_color    VARCHAR(20) DEFAULT '#F4C9D6',
  role            VARCHAR(10) NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
  verify_token    VARCHAR(80),
  reset_token     VARCHAR(80),
  reset_expires   TIMESTAMPTZ,
  trust_badge     BOOLEAN NOT NULL DEFAULT FALSE,      -- VerifiedUser
  verified_at     TIMESTAMPTZ,
  verify_method   VARCHAR(30),
  notify_email    BOOLEAN NOT NULL DEFAULT TRUE,
  notify_sms      BOOLEAN NOT NULL DEFAULT FALSE,
  notify_inapp    BOOLEAN NOT NULL DEFAULT TRUE,
  status          VARCHAR(12) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','WARNED','SUSPENDED','BANNED','DELETED')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Skill catalogue
CREATE TABLE skills (
  id        SERIAL PRIMARY KEY,
  name      VARCHAR(80) NOT NULL UNIQUE,
  category  VARCHAR(60) NOT NULL
);

-- D2 Skill listings (offers / wants)
CREATE TABLE listings (
  id           SERIAL PRIMARY KEY,
  user_id      INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_id     INT NOT NULL REFERENCES skills(id),
  type         VARCHAR(5) NOT NULL CHECK (type IN ('OFFER','WANT')),
  level        VARCHAR(12) NOT NULL DEFAULT 'BEGINNER' CHECK (level IN ('BEGINNER','INTERMEDIATE','ADVANCED','EXPERT')),
  description  TEXT DEFAULT '',
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- D5 Credits
CREATE TABLE credit_accounts (
  id               SERIAL PRIMARY KEY,
  user_id          INT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  balance          INT NOT NULL DEFAULT 0 CHECK (balance >= 0),
  escrowed_balance INT NOT NULL DEFAULT 0 CHECK (escrowed_balance >= 0)
);

-- D3 Swaps (SwapProposal + Swap; status follows the state chart, Experiment 6)
CREATE TABLE swaps (
  id                     SERIAL PRIMARY KEY,
  proposer_id            INT NOT NULL REFERENCES users(id),
  recipient_id           INT NOT NULL REFERENCES users(id),
  offered_listing_id     INT REFERENCES listings(id) ON DELETE SET NULL,
  requested_listing_id   INT REFERENCES listings(id) ON DELETE SET NULL,
  credits_offered        INT NOT NULL DEFAULT 0 CHECK (credits_offered >= 0),
  message                TEXT DEFAULT '',
  status                 VARCHAR(12) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','PROPOSED','NEGOTIATING','ACCEPTED','SCHEDULED','COMPLETED','CLOSED','DECLINED','CANCELLED')),
  awaiting_user_id       INT REFERENCES users(id),
  proposer_confirmed     BOOLEAN NOT NULL DEFAULT FALSE,
  recipient_confirmed    BOOLEAN NOT NULL DEFAULT FALSE,
  proposer_completed     BOOLEAN NOT NULL DEFAULT FALSE,
  recipient_completed    BOOLEAN NOT NULL DEFAULT FALSE,
  agreed_at              TIMESTAMPTZ,
  completed_at           TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Session (composition: belongs to a swap)
CREATE TABLE sessions (
  id                 SERIAL PRIMARY KEY,
  swap_id            INT NOT NULL REFERENCES swaps(id) ON DELETE CASCADE,
  scheduled_at       TIMESTAMPTZ NOT NULL,
  duration_hours     NUMERIC(3,1) NOT NULL DEFAULT 1.0,
  mode               VARCHAR(10) NOT NULL DEFAULT 'VIRTUAL' CHECK (mode IN ('VIRTUAL','IN_PERSON')),
  place              VARCHAR(200) DEFAULT '',
  meeting_link       VARCHAR(300) DEFAULT '',
  calendar_event_id  VARCHAR(80),
  calendar_url       TEXT,
  status             VARCHAR(12) NOT NULL DEFAULT 'PROPOSED' CHECK (status IN ('PROPOSED','SCHEDULED','COMPLETED','CANCELLED')),
  reschedule_count   INT NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Negotiation / audit trail (REQ-40)
CREATE TABLE swap_events (
  id          SERIAL PRIMARY KEY,
  swap_id     INT NOT NULL REFERENCES swaps(id) ON DELETE CASCADE,
  actor_id    INT REFERENCES users(id),
  event       VARCHAR(30) NOT NULL,
  detail      TEXT DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE credit_transactions (
  id           SERIAL PRIMARY KEY,
  account_id   INT NOT NULL REFERENCES credit_accounts(id) ON DELETE CASCADE,
  amount       INT NOT NULL,
  type         VARCHAR(20) NOT NULL CHECK (type IN ('STARTER','ESCROW_HOLD','ESCROW_RELEASE','ESCROW_REFUND','ADJUSTMENT')),
  note         TEXT DEFAULT '',
  swap_id      INT REFERENCES swaps(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- D4 Messages (tied to a swap/proposal, REQ-14)
CREATE TABLE messages (
  id          SERIAL PRIMARY KEY,
  swap_id     INT NOT NULL REFERENCES swaps(id) ON DELETE CASCADE,
  sender_id   INT NOT NULL REFERENCES users(id),
  content     TEXT NOT NULL,
  is_flagged  BOOLEAN NOT NULL DEFAULT FALSE,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE notifications (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        VARCHAR(20) NOT NULL,
  content     TEXT NOT NULL,
  link        VARCHAR(200) DEFAULT '',
  channel     VARCHAR(10) NOT NULL DEFAULT 'IN_APP',
  is_read     BOOLEAN NOT NULL DEFAULT FALSE,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- D6 Ratings & reviews
CREATE TABLE reviews (
  id           SERIAL PRIMARY KEY,
  swap_id      INT NOT NULL REFERENCES swaps(id) ON DELETE CASCADE,
  reviewer_id  INT NOT NULL REFERENCES users(id),
  reviewee_id  INT NOT NULL REFERENCES users(id),
  rating       INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment      TEXT DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (swap_id, reviewer_id)
);

CREATE TABLE reports (
  id                SERIAL PRIMARY KEY,
  reporter_id       INT NOT NULL REFERENCES users(id),
  reported_user_id  INT NOT NULL REFERENCES users(id),
  reason            TEXT NOT NULL,
  status            VARCHAR(10) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSED')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE disputes (
  id                 SERIAL PRIMARY KEY,
  swap_id            INT NOT NULL REFERENCES swaps(id) ON DELETE CASCADE,
  filed_by           INT NOT NULL REFERENCES users(id),
  reason             TEXT NOT NULL,
  status             VARCHAR(10) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','RESOLVED')),
  resolved_by        INT REFERENCES users(id),
  resolution         TEXT DEFAULT '',
  credit_adjustment  INT NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE moderation_actions (
  id            SERIAL PRIMARY KEY,
  admin_id      INT NOT NULL REFERENCES users(id),
  target_id     INT NOT NULL REFERENCES users(id),
  type          VARCHAR(12) NOT NULL CHECK (type IN ('WARN','SUSPEND','BAN','REINSTATE')),
  reason        TEXT DEFAULT '',
  performed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_listings_user ON listings(user_id);
CREATE INDEX idx_listings_skill ON listings(skill_id);
CREATE INDEX idx_swaps_users ON swaps(proposer_id, recipient_id);
CREATE INDEX idx_messages_swap ON messages(swap_id);
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read);
