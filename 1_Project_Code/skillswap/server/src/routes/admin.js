// Admin & moderation (SRS 4.6, REQ-21, 23, 24, 25, 34)
const router = require('express').Router();
const { query, tx } = require('../db');
const { ah, HttpError, notify, logSwapEvent } = require('../lib/helpers');
const { requireAuth, requireAdmin } = require('../lib/auth');
const credits = require('../lib/credits');

router.use(requireAuth, requireAdmin);

// Low-rating threshold (SRS Appendix B leaves this TBD): avg ≤ 2.5 across 2+ reviews
const FLAG_SQL = `
  SELECT u.id, u.name, u.email, u.status, u.avatar_color,
         ROUND(AVG(r.rating)::numeric,1)::float AS rating, COUNT(r.id)::int AS review_count
  FROM users u JOIN reviews r ON r.reviewee_id=u.id
  WHERE u.status NOT IN ('BANNED','DELETED')
  GROUP BY u.id HAVING COUNT(r.id) >= 2 AND AVG(r.rating) <= 2.5`;

router.get('/stats', ah(async (req, res) => {
  const [users, swaps, byStatus, trending, weekly, open] = await Promise.all([
    query(`SELECT COUNT(*) FILTER (WHERE status IN ('ACTIVE','WARNED'))::int AS active,
                  COUNT(*) FILTER (WHERE trust_badge)::int AS verified,
                  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')::int AS new_30d
           FROM users WHERE role='user'`),
    query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status IN ('COMPLETED','CLOSED'))::int AS completed FROM swaps WHERE status<>'DRAFT'`),
    query(`SELECT status, COUNT(*)::int AS n FROM swaps WHERE status<>'DRAFT' GROUP BY status ORDER BY n DESC`),
    query(`SELECT s.category, COUNT(*)::int AS n FROM swaps sw JOIN listings l ON l.id=sw.requested_listing_id
           JOIN skills s ON s.id=l.skill_id WHERE sw.status<>'DRAFT' GROUP BY s.category ORDER BY n DESC LIMIT 6`),
    query(`SELECT to_char(d, 'DD Mon') AS day,
             (SELECT COUNT(*) FROM swaps WHERE status<>'DRAFT' AND created_at::date = d::date)::int AS n
           FROM generate_series(NOW() - INTERVAL '13 days', NOW(), INTERVAL '1 day') d`),
    query(`SELECT (SELECT COUNT(*) FROM reports WHERE status='OPEN')::int AS reports,
                  (SELECT COUNT(*) FROM disputes WHERE status='OPEN')::int AS disputes,
                  (SELECT COUNT(*) FROM messages WHERE is_flagged)::int AS flagged_messages`),
  ]);
  const flagged = await query(FLAG_SQL);
  res.json({
    users: users.rows[0], swaps: swaps.rows[0], byStatus: byStatus.rows, trending: trending.rows,
    daily: weekly.rows, open: { ...open.rows[0], flagged_accounts: flagged.rowCount },
  });
}));

router.get('/users', ah(async (req, res) => {
  const q = `%${req.query.q || ''}%`;
  const { rows } = await query(
    `SELECT u.id, u.name, u.email, u.role, u.status, u.trust_badge, u.location, u.created_at, u.avatar_color,
            COALESCE(ROUND(AVG(r.rating)::numeric,1),0)::float AS rating, COUNT(r.id)::int AS review_count,
            (SELECT COUNT(*) FROM reports rp WHERE rp.reported_user_id=u.id)::int AS reports
     FROM users u LEFT JOIN reviews r ON r.reviewee_id=u.id
     WHERE u.status<>'DELETED' AND (u.name ILIKE $1 OR u.email ILIKE $1)
     GROUP BY u.id ORDER BY u.created_at DESC LIMIT 100`, [q]);
  res.json({ users: rows });
}));

router.get('/flagged', ah(async (req, res) => {
  const { rows } = await query(FLAG_SQL + ' ORDER BY rating');
  res.json({ users: rows });
}));

// Take moderation action: warn / suspend / ban / reinstate
router.post('/users/:id/action', ah(async (req, res) => {
  const { type, reason = '' } = req.body;
  const map = { WARN: 'WARNED', SUSPEND: 'SUSPENDED', BAN: 'BANNED', REINSTATE: 'ACTIVE' };
  if (!map[type]) throw new HttpError(400, 'Choose warn, suspend, ban or reinstate.');
  await tx(async (db) => {
    const t = (await db.query('SELECT id, role FROM users WHERE id=$1', [req.params.id])).rows[0];
    if (!t) throw new HttpError(404, 'User not found.');
    if (t.role === 'admin') throw new HttpError(400, 'Admins can’t be moderated here.');
    await db.query('UPDATE users SET status=$1 WHERE id=$2', [map[type], t.id]);
    await db.query('INSERT INTO moderation_actions (admin_id, target_id, type, reason) VALUES ($1,$2,$3,$4)', [req.user.id, t.id, type, reason]);
    const msgs = {
      WARN: `You’ve received a warning from the SkillSwap team${reason ? `: ${reason}` : '.'}`,
      REINSTATE: 'Your account is active again. Welcome back.',
    };
    if (msgs[type]) await notify(db, t.id, 'MODERATION', msgs[type]);
  });
  res.json({ ok: true });
}));

router.get('/reports', ah(async (req, res) => {
  const { rows } = await query(
    `SELECT rp.*, a.name AS reporter, b.name AS reported, b.status AS reported_status
     FROM reports rp JOIN users a ON a.id=rp.reporter_id JOIN users b ON b.id=rp.reported_user_id
     ORDER BY (rp.status='OPEN') DESC, rp.created_at DESC LIMIT 100`);
  const flaggedMessages = await query(
    `SELECT m.id, m.content, m.sent_at, m.swap_id, u.id AS sender_id, u.name AS sender
     FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.is_flagged ORDER BY m.sent_at DESC LIMIT 50`);
  res.json({ reports: rows, flaggedMessages: flaggedMessages.rows });
}));

router.post('/reports/:id/close', ah(async (req, res) => {
  await query(`UPDATE reports SET status='CLOSED' WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
}));

router.get('/disputes', ah(async (req, res) => {
  const { rows } = await query(
    `SELECT d.*, f.name AS filed_by_name, sw.status AS swap_status, sw.credits_offered,
            sw.proposer_id, p.name AS proposer, sw.recipient_id, r.name AS recipient,
            sk.name AS skill
     FROM disputes d JOIN swaps sw ON sw.id=d.swap_id JOIN users f ON f.id=d.filed_by
     JOIN users p ON p.id=sw.proposer_id JOIN users r ON r.id=sw.recipient_id
     LEFT JOIN listings l ON l.id=sw.requested_listing_id LEFT JOIN skills sk ON sk.id=l.skill_id
     ORDER BY (d.status='OPEN') DESC, d.created_at DESC LIMIT 100`);
  res.json({ disputes: rows });
}));

// Resolve dispute (Adjust credits). outcome: 'release' pays the provider and completes the swap,
// 'refund' returns escrow to the proposer and cancels it. Optional extra adjustment to one user.
router.post('/disputes/:id/resolve', ah(async (req, res) => {
  const { outcome, resolution = '', adjustUserId, adjustAmount = 0 } = req.body;
  if (!resolution.trim()) throw new HttpError(400, 'Write a short note explaining the decision.');
  await tx(async (db) => {
    const d = (await db.query(`SELECT * FROM disputes WHERE id=$1 FOR UPDATE`, [req.params.id])).rows[0];
    if (!d || d.status !== 'OPEN') throw new HttpError(409, 'This dispute is already resolved.');
    const s = (await db.query('SELECT * FROM swaps WHERE id=$1 FOR UPDATE', [d.swap_id])).rows[0];

    if (s.status === 'SCHEDULED') {
      if (outcome === 'refund') {
        await credits.refund(db, s.proposer_id, s.credits_offered, s.id);
        await db.query(`UPDATE sessions SET status='CANCELLED' WHERE swap_id=$1 AND status='SCHEDULED'`, [s.id]);
        await db.query(`UPDATE swaps SET status='CANCELLED', updated_at=NOW() WHERE id=$1`, [s.id]);
      } else if (outcome === 'release') {
        await credits.release(db, s.proposer_id, s.recipient_id, s.credits_offered, s.id);
        await db.query(`UPDATE sessions SET status='COMPLETED' WHERE swap_id=$1 AND status='SCHEDULED'`, [s.id]);
        await db.query(`UPDATE swaps SET status='COMPLETED', completed_at=NOW(), updated_at=NOW() WHERE id=$1`, [s.id]);
      } else throw new HttpError(400, 'Choose whether to release or refund the held credits.');
    }
    const amt = parseInt(adjustAmount, 10) || 0;
    if (amt && adjustUserId) {
      if (![s.proposer_id, s.recipient_id].includes(Number(adjustUserId))) throw new HttpError(400, 'Adjustments can only go to someone in this swap.');
      await credits.adjust(db, Number(adjustUserId), amt, `Dispute #${d.id} adjustment`, s.id);
    }
    await db.query(`UPDATE disputes SET status='RESOLVED', resolved_by=$1, resolution=$2, credit_adjustment=$3 WHERE id=$4`,
      [req.user.id, resolution.trim(), amt, d.id]);
    await logSwapEvent(db, s.id, req.user.id, 'DISPUTE_RESOLVED', resolution.trim());
    for (const uid of [s.proposer_id, s.recipient_id])
      await notify(db, uid, 'DISPUTE', `Your dispute on swap #${s.id} was resolved: ${resolution.trim()}`, `/swaps/${s.id}`);
  });
  res.json({ ok: true });
}));

module.exports = router;
