const router = require('express').Router();
const { query } = require('../db');
const { ah, HttpError } = require('../lib/helpers');
const { requireAuth } = require('../lib/auth');
const cache = require('../lib/cache');
const { LISTING_SELECT } = require('./users');

const LEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'];

// Skill catalogue (public)
router.get('/skills', ah(async (req, res) => {
  const { rows } = await query('SELECT id, name, category FROM skills ORDER BY category, name');
  res.json({ skills: rows, categories: [...new Set(rows.map((r) => r.category))] });
}));

// Add a skill to the catalogue if it doesn't exist yet
router.post('/skills', requireAuth, ah(async (req, res) => {
  const name = (req.body.name || '').trim();
  const category = (req.body.category || 'Other').trim();
  if (!name) throw new HttpError(400, 'Give the skill a name.');
  const { rows } = await query(
    `INSERT INTO skills (name, category) VALUES ($1,$2)
     ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name RETURNING *`, [name, category]);
  res.status(201).json({ skill: rows[0] });
}));

router.get('/listings/mine', requireAuth, ah(async (req, res) => {
  const { rows } = await query(`${LISTING_SELECT} WHERE l.user_id=$1 AND l.is_active ORDER BY l.created_at DESC`, [req.user.id]);
  res.json({ listings: rows });
}));

// REQ-5
router.post('/listings', requireAuth, ah(async (req, res) => {
  const { skillId, type, level = 'BEGINNER', description = '' } = req.body;
  if (!['OFFER', 'WANT'].includes(type)) throw new HttpError(400, 'Choose whether you can teach this or want to learn it.');
  if (!LEVELS.includes(level)) throw new HttpError(400, 'Pick a proficiency level.');
  const skill = await query('SELECT id FROM skills WHERE id=$1', [skillId]);
  if (!skill.rowCount) throw new HttpError(400, 'Pick a skill from the list.');
  const dup = await query('SELECT 1 FROM listings WHERE user_id=$1 AND skill_id=$2 AND type=$3 AND is_active', [req.user.id, skillId, type]);
  if (dup.rowCount) throw new HttpError(409, 'You already have this skill on your list.');
  const { rows } = await query(
    'INSERT INTO listings (user_id, skill_id, type, level, description) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [req.user.id, skillId, type, level, description]);
  await cache.clear('search:');
  const full = await query(`${LISTING_SELECT} WHERE l.id=$1`, [rows[0].id]);
  res.status(201).json({ listing: full.rows[0] });
}));

router.put('/listings/:id', requireAuth, ah(async (req, res) => {
  const { level, description } = req.body;
  if (level && !LEVELS.includes(level)) throw new HttpError(400, 'Pick a proficiency level.');
  const { rowCount } = await query(
    'UPDATE listings SET level=COALESCE($1,level), description=COALESCE($2,description) WHERE id=$3 AND user_id=$4',
    [level, description, req.params.id, req.user.id]);
  if (!rowCount) throw new HttpError(404, 'Listing not found.');
  await cache.clear('search:');
  const full = await query(`${LISTING_SELECT} WHERE l.id=$1`, [req.params.id]);
  res.json({ listing: full.rows[0] });
}));

router.delete('/listings/:id', requireAuth, ah(async (req, res) => {
  const { rowCount } = await query('UPDATE listings SET is_active=FALSE WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
  if (!rowCount) throw new HttpError(404, 'Listing not found.');
  await cache.clear('search:');
  res.json({ ok: true });
}));

module.exports = router;
