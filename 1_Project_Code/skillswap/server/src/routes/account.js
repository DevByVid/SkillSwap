// Notifications, credit history and user reports
const router = require('express').Router();
const { query } = require('../db');
const { ah, HttpError, notify } = require('../lib/helpers');
const { requireAuth } = require('../lib/auth');

router.use(requireAuth);

router.get('/notifications', ah(async (req, res) => {
  const { rows } = await query(
    'SELECT * FROM notifications WHERE user_id=$1 ORDER BY sent_at DESC LIMIT 50', [req.user.id]);
  res.json({ notifications: rows, unread: rows.filter((n) => !n.is_read).length });
}));

router.post('/notifications/read-all', ah(async (req, res) => {
  await query('UPDATE notifications SET is_read=TRUE WHERE user_id=$1', [req.user.id]);
  res.json({ ok: true });
}));

router.post('/notifications/:id/read', ah(async (req, res) => {
  await query('UPDATE notifications SET is_read=TRUE WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
  res.json({ ok: true });
}));

// REQ-19: auditable credit history
router.get('/credits', ah(async (req, res) => {
  const acct = (await query('SELECT * FROM credit_accounts WHERE user_id=$1', [req.user.id])).rows[0];
  const { rows } = await query(
    'SELECT * FROM credit_transactions WHERE account_id=$1 ORDER BY created_at DESC, id DESC', [acct.id]);
  res.json({ account: acct, transactions: rows });
}));

// Use case 28 / REQ-29: report a user
router.post('/reports', ah(async (req, res) => {
  const { userId, reason } = req.body;
  if (!reason || reason.trim().length < 10) throw new HttpError(400, 'Tell us what happened in a sentence or two.');
  if (Number(userId) === req.user.id) throw new HttpError(400, 'You can’t report yourself.');
  const target = await query('SELECT id FROM users WHERE id=$1', [userId]);
  if (!target.rowCount) throw new HttpError(404, 'User not found.');
  await query('INSERT INTO reports (reporter_id, reported_user_id, reason) VALUES ($1,$2,$3)', [req.user.id, userId, reason.trim()]);
  const admins = await query(`SELECT id FROM users WHERE role='admin'`);
  for (const a of admins.rows) await notify({ query }, a.id, 'REPORT', 'A new report needs review.', '/admin');
  res.status(201).json({ ok: true });
}));

module.exports = router;
