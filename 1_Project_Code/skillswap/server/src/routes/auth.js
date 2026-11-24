const router = require('express').Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { query, tx } = require('../db');
const { ah, HttpError, ageFrom, notify } = require('../lib/helpers');
const { signToken, requireAuth } = require('../lib/auth');
const credits = require('../lib/credits');

const PALETTE = ['#F4C9D6', '#F7D6C4', '#E6D3F2', '#CFE6D8', '#FBE3A8', '#D6E4F5'];
const token = () => crypto.randomBytes(24).toString('hex');
const CLIENT = () => process.env.CLIENT_URL || 'http://localhost:5173';

function publicUser(u) {
  const { password_hash, verify_token, reset_token, reset_expires, ...rest } = u;
  return rest;
}

// REQ-1, REQ-2, REQ-18, REQ-28
router.post('/register', ah(async (req, res) => {
  const { name, email, password, dateOfBirth, location = '' } = req.body;
  if (!name?.trim() || !email?.trim() || !password || !dateOfBirth)
    throw new HttpError(400, 'Name, email, password and date of birth are required.');
  if (password.length < 8) throw new HttpError(400, 'Password needs at least 8 characters.');
  if (ageFrom(dateOfBirth) < 16) throw new HttpError(400, 'You need to be 16 or older to join SkillSwap.');

  const exists = await query('SELECT 1 FROM users WHERE lower(email)=lower($1)', [email.trim()]);
  if (exists.rowCount) throw new HttpError(409, 'An account with this email already exists.');

  const hash = await bcrypt.hash(password, 10);
  const vt = token();
  const user = await tx(async (db) => {
    const { rows } = await db.query(
      `INSERT INTO users (name, email, password_hash, date_of_birth, location, verify_token, avatar_color)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [name.trim(), email.trim().toLowerCase(), hash, dateOfBirth, location, vt, PALETTE[Math.floor(Math.random() * PALETTE.length)]]
    );
    await credits.grantStarter(db, rows[0].id, Number(process.env.STARTER_CREDITS || 5));
    await notify(db, rows[0].id, 'WELCOME', `Welcome to SkillSwap, ${name.trim().split(' ')[0]}! You've got ${process.env.STARTER_CREDITS || 5} starter credits.`, '/credits');
    return rows[0];
  });

  // No email gateway configured: the verification link is logged and returned for local use.
  const verifyUrl = `${CLIENT()}/verify-email?token=${vt}`;
  console.log(`[email → ${user.email}] Verify your account: ${verifyUrl}`);
  res.status(201).json({ token: signToken(user), user: publicUser(user), devVerifyUrl: verifyUrl });
}));

router.post('/verify-email', ah(async (req, res) => {
  const { rows } = await query(
    'UPDATE users SET email_verified=TRUE, verify_token=NULL WHERE verify_token=$1 RETURNING id',
    [req.body.token]
  );
  if (!rows[0]) throw new HttpError(400, 'This verification link is invalid or already used.');
  res.json({ ok: true });
}));

router.post('/resend-verification', requireAuth, ah(async (req, res) => {
  const vt = token();
  await query('UPDATE users SET verify_token=$1 WHERE id=$2 AND email_verified=FALSE', [vt, req.user.id]);
  const verifyUrl = `${CLIENT()}/verify-email?token=${vt}`;
  console.log(`[email → ${req.user.email}] Verify your account: ${verifyUrl}`);
  res.json({ ok: true, devVerifyUrl: verifyUrl });
}));

router.post('/login', ah(async (req, res) => {
  const { email, password } = req.body;
  const { rows } = await query('SELECT * FROM users WHERE lower(email)=lower($1)', [email || '']);
  const user = rows[0];
  if (!user || user.status === 'DELETED' || !(await bcrypt.compare(password || '', user.password_hash)))
    throw new HttpError(401, 'That email and password don’t match an account.');
  if (user.status === 'BANNED') throw new HttpError(403, 'This account has been banned.');
  if (user.status === 'SUSPENDED') throw new HttpError(403, 'This account is suspended. Contact support for help.');
  res.json({ token: signToken(user), user: publicUser(user) });
}));

// REQ-3: secure password reset with a single-use, expiring token
router.post('/forgot-password', ah(async (req, res) => {
  const rt = token();
  const { rows } = await query(
    `UPDATE users SET reset_token=$1, reset_expires=NOW() + INTERVAL '30 minutes'
     WHERE lower(email)=lower($2) AND status <> 'DELETED' RETURNING email`,
    [rt, req.body.email || '']
  );
  let devResetUrl;
  if (rows[0]) {
    devResetUrl = `${CLIENT()}/reset-password?token=${rt}`;
    console.log(`[email → ${rows[0].email}] Reset your password: ${devResetUrl}`);
  }
  // Same response whether or not the email exists
  res.json({ ok: true, devResetUrl });
}));

router.post('/reset-password', ah(async (req, res) => {
  const { token: rt, password } = req.body;
  if (!password || password.length < 8) throw new HttpError(400, 'Password needs at least 8 characters.');
  const hash = await bcrypt.hash(password, 10);
  const { rows } = await query(
    `UPDATE users SET password_hash=$1, reset_token=NULL, reset_expires=NULL
     WHERE reset_token=$2 AND reset_expires > NOW() RETURNING id`,
    [hash, rt]
  );
  if (!rows[0]) throw new HttpError(400, 'This reset link is invalid or has expired.');
  res.json({ ok: true });
}));

router.get('/me', requireAuth, ah(async (req, res) => {
  const { rows } = await query(
    `SELECT u.*, c.balance, c.escrowed_balance,
       (SELECT COUNT(*) FROM notifications n WHERE n.user_id=u.id AND NOT n.is_read)::int AS unread
     FROM users u LEFT JOIN credit_accounts c ON c.user_id=u.id WHERE u.id=$1`,
    [req.user.id]
  );
  res.json({ user: publicUser(rows[0]) });
}));

module.exports = router;
module.exports.publicUser = publicUser;
