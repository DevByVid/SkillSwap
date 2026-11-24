const { query } = require('../db');

// Wrap async route handlers so errors reach the error middleware
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// REQ-15/16: create an in-app notification, respecting the user's preferences.
// Email/SMS delivery is simulated (logged) since no gateway keys are configured.
async function notify(db, userId, type, content, link = '') {
  const { rows } = await db.query('SELECT email, notify_email, notify_sms, notify_inapp FROM users WHERE id=$1', [userId]);
  const prefs = rows[0];
  if (!prefs) return;
  if (prefs.notify_inapp) {
    await db.query('INSERT INTO notifications (user_id, type, content, link) VALUES ($1,$2,$3,$4)', [userId, type, content, link]);
  }
  if (prefs.notify_email) console.log(`[email → ${prefs.email}] ${content}`);
  if (prefs.notify_sms) console.log(`[sms → user ${userId}] ${content}`);
}

async function logSwapEvent(db, swapId, actorId, event, detail = '') {
  await db.query('INSERT INTO swap_events (swap_id, actor_id, event, detail) VALUES ($1,$2,$3,$4)', [swapId, actorId, event, detail]);
}

// REQ-17: basic automated message filtering (spam / links / profanity)
const PROFANITY = ['damn', 'shit', 'fuck', 'bastard', 'idiot', 'stupid'];
function filterMessage(text) {
  let flagged = false;
  let clean = text;
  const linkRe = /(https?:\/\/|www\.)\S+/gi;
  if (linkRe.test(clean)) { flagged = true; clean = clean.replace(linkRe, '[link removed]'); }
  for (const w of PROFANITY) {
    const re = new RegExp(`\\b${w}\\b`, 'gi');
    if (re.test(clean)) { flagged = true; clean = clean.replace(re, '*'.repeat(w.length)); }
  }
  if (/(.)\1{9,}/.test(clean) || /\b(free money|click here|whatsapp me|telegram)\b/i.test(clean)) flagged = true;
  return { clean, flagged };
}

function ageFrom(dob) {
  const d = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

module.exports = { ah, HttpError, notify, logSwapEvent, filterMessage, ageFrom, query };
