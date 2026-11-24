const router = require('express').Router();
const { query, tx } = require('../db');
const { ah, HttpError, notify } = require('../lib/helpers');
const { requireAuth } = require('../lib/auth');
const { publicUser } = require('./auth');

const LISTING_SELECT = `
  SELECT l.id, l.type, l.level, l.description, l.is_active, l.created_at,
         s.id AS skill_id, s.name AS skill, s.category
  FROM listings l JOIN skills s ON s.id=l.skill_id`;

// Update profile (REQ-4)
router.put('/me', requireAuth, ah(async (req, res) => {
  const { name, bio, location, availability, avatarColor } = req.body;
  if (name !== undefined && !name.trim()) throw new HttpError(400, 'Name can’t be empty.');
  const { rows } = await query(
    `UPDATE users SET
       name=COALESCE($1,name), bio=COALESCE($2,bio), location=COALESCE($3,location),
       availability=COALESCE($4,availability), avatar_color=COALESCE($5,avatar_color)
     WHERE id=$6 RETURNING *`,
    [name?.trim(), bio, location, availability, avatarColor, req.user.id]
  );
  res.json({ user: publicUser(rows[0]) });
}));

// Notification preferences (REQ-16)
router.put('/me/notifications', requireAuth, ah(async (req, res) => {
  const { email, sms, inapp } = req.body;
  const { rows } = await query(
    `UPDATE users SET notify_email=COALESCE($1,notify_email), notify_sms=COALESCE($2,notify_sms),
       notify_inapp=COALESCE($3,notify_inapp) WHERE id=$4 RETURNING *`,
    [email, sms, inapp, req.user.id]
  );
  res.json({ user: publicUser(rows[0]) });
}));

// Identity verification → trust badge. The vendor is TBD in the SRS (Appendix B), so this
// simulates a successful check once the email is verified and the profile is filled in.
router.post('/me/verify-identity', requireAuth, ah(async (req, res) => {
  const { rows } = await query('SELECT * FROM users WHERE id=$1', [req.user.id]);
  const u = rows[0];
  if (!u.email_verified) throw new HttpError(400, 'Verify your email address first.');
  if (!u.bio || !u.location) throw new HttpError(400, 'Add a bio and location to your profile first.');
  const upd = await query(
    `UPDATE users SET trust_badge=TRUE, verified_at=NOW(), verify_method=$1 WHERE id=$2 RETURNING *`,
    [req.body.method || 'ID_DOCUMENT', req.user.id]
  );
  await notify({ query }, req.user.id, 'VERIFIED', 'You’re verified. Your trust badge now shows on your profile.', '/profile');
  res.json({ user: publicUser(upd.rows[0]) });
}));

// Right to erasure (REQ-35): anonymise personal data, keep audit records intact
router.delete('/me', requireAuth, ah(async (req, res) => {
  await tx(async (db) => {
    const open = await db.query(
      `SELECT 1 FROM swaps WHERE (proposer_id=$1 OR recipient_id=$1)
       AND status IN ('PROPOSED','NEGOTIATING','ACCEPTED','SCHEDULED')`, [req.user.id]);
    if (open.rowCount) throw new HttpError(400, 'Finish or cancel your active swaps before deleting your account.');
    await db.query(
      `UPDATE users SET name='Deleted user', email=$2, bio='', location='', availability='',
         password_hash='x', status='DELETED', trust_badge=FALSE WHERE id=$1`,
      [req.user.id, `deleted-${req.user.id}@skillswap.local`]
    );
    await db.query('UPDATE listings SET is_active=FALSE WHERE user_id=$1', [req.user.id]);
    await db.query('DELETE FROM notifications WHERE user_id=$1', [req.user.id]);
  });
  res.json({ ok: true });
}));

// Public profile with listings, rating and reviews
router.get('/:id', ah(async (req, res) => {
  const { rows } = await query(
    `SELECT u.id, u.name, u.bio, u.location, u.availability, u.avatar_color, u.trust_badge,
            u.created_at, u.status,
            COALESCE(ROUND(AVG(r.rating)::numeric,1),0)::float AS rating, COUNT(r.id)::int AS review_count,
            (SELECT COUNT(*) FROM swaps s WHERE (s.proposer_id=u.id OR s.recipient_id=u.id)
               AND s.status IN ('COMPLETED','CLOSED'))::int AS swaps_done
     FROM users u LEFT JOIN reviews r ON r.reviewee_id=u.id
     WHERE u.id=$1 GROUP BY u.id`, [req.params.id]);
  const user = rows[0];
  if (!user || user.status === 'DELETED') throw new HttpError(404, 'This profile doesn’t exist.');
  const listings = await query(`${LISTING_SELECT} WHERE l.user_id=$1 AND l.is_active ORDER BY l.type, s.name`, [user.id]);
  const reviews = await query(
    `SELECT r.rating, r.comment, r.created_at, u.id AS reviewer_id, u.name AS reviewer, u.avatar_color
     FROM reviews r JOIN users u ON u.id=r.reviewer_id WHERE r.reviewee_id=$1 ORDER BY r.created_at DESC LIMIT 20`,
    [user.id]);
  res.json({ user, listings: listings.rows, reviews: reviews.rows });
}));

module.exports = router;
module.exports.LISTING_SELECT = LISTING_SELECT;
