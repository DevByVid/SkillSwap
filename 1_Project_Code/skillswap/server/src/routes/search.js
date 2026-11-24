const router = require('express').Router();
const jwt = require('jsonwebtoken');
const { query } = require('../db');
const { ah } = require('../lib/helpers');
const { requireAuth } = require('../lib/auth');
const cache = require('../lib/cache');

function viewerId(req) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return null;
  try { return jwt.verify(h.slice(7), process.env.JWT_SECRET || 'dev-secret').id; } catch { return null; }
}

// REQ-6 / REQ-8: search by keyword, category, location, availability; filter by rating,
// distance (same city) and verification. Public so guests can browse (use case 2).
router.get('/search', ah(async (req, res) => {
  const me = viewerId(req);
  const { q = '', category = '', location = '', availability = '', type = 'OFFER', verified, minRating, sort = 'relevance' } = req.query;
  const key = `search:${me}:${JSON.stringify(req.query)}`;
  const cached = await cache.get(key);
  if (cached) return res.json(cached);

  let myLocation = '';
  if (me) {
    const r = await query('SELECT location FROM users WHERE id=$1', [me]);
    myLocation = r.rows[0]?.location || '';
  }

  const params = [type === 'WANT' ? 'WANT' : 'OFFER'];
  const where = [`l.is_active`, `u.status IN ('ACTIVE','WARNED')`, `l.type=$1`];
  const add = (sql, v) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
  if (q) add(`(s.name ILIKE ? OR l.description ILIKE $${params.length + 1} OR s.category ILIKE $${params.length + 1})`, `%${q}%`);
  if (category) add('s.category = ?', category);
  if (location) add('u.location ILIKE ?', `%${location}%`);
  if (availability) add('u.availability ILIKE ?', `%${availability}%`);
  if (verified === 'true') where.push('u.trust_badge');
  if (me) add('u.id <> ?', me);

  params.push(q || ''); const qIdx = params.length;
  params.push(myLocation); const locIdx = params.length;

  let sql = `
    SELECT l.id, l.type, l.level, l.description, s.id AS skill_id, s.name AS skill, s.category,
           u.id AS user_id, u.name AS user_name, u.location, u.availability, u.avatar_color, u.trust_badge,
           COALESCE(rt.avg,0)::float AS rating, COALESCE(rt.cnt,0)::int AS review_count,
           (CASE WHEN $${qIdx} <> '' AND lower(s.name)=lower($${qIdx}) THEN 3
                 WHEN $${qIdx} <> '' AND s.name ILIKE '%'||$${qIdx}||'%' THEN 2 ELSE 0 END
            + CASE WHEN $${locIdx} <> '' AND lower(u.location)=lower($${locIdx}) THEN 2 ELSE 0 END
            + COALESCE(rt.avg,0)/5.0) AS score,
           ($${locIdx} <> '' AND lower(u.location)=lower($${locIdx})) AS near_you
    FROM listings l
    JOIN skills s ON s.id=l.skill_id
    JOIN users u ON u.id=l.user_id
    LEFT JOIN (SELECT reviewee_id, ROUND(AVG(rating)::numeric,1) AS avg, COUNT(*) AS cnt FROM reviews GROUP BY reviewee_id) rt
      ON rt.reviewee_id=u.id
    WHERE ${where.join(' AND ')}`;
  if (minRating) { params.push(Number(minRating)); sql += ` AND COALESCE(rt.avg,0) >= $${params.length}`; }
  sql += sort === 'rating' ? ' ORDER BY rating DESC, score DESC' : sort === 'newest' ? ' ORDER BY l.created_at DESC' : ' ORDER BY score DESC, l.created_at DESC';
  sql += ' LIMIT 60';

  const { rows } = await query(sql, params);
  const payload = { results: rows };
  await cache.set(key, payload, 30);
  res.json(payload);
}));

// REQ-7: rule-based matching (overlapping skill tags, location, availability). No ML.
router.get('/matches', requireAuth, ah(async (req, res) => {
  const me = req.user.id;
  const mine = await query(
    `SELECT l.id, l.type, l.skill_id, s.name AS skill FROM listings l JOIN skills s ON s.id=l.skill_id
     WHERE l.user_id=$1 AND l.is_active`, [me]);
  const meRow = (await query('SELECT location, availability FROM users WHERE id=$1', [me])).rows[0];
  const myOffers = mine.rows.filter((l) => l.type === 'OFFER');
  const myWants = mine.rows.filter((l) => l.type === 'WANT');
  if (!myOffers.length && !myWants.length) return res.json({ matches: [], needsListings: true });

  const { rows } = await query(
    `SELECT l.id, l.type, l.skill_id, l.level, s.name AS skill, s.category,
            u.id AS user_id, u.name, u.location, u.availability, u.avatar_color, u.trust_badge,
            COALESCE(rt.avg,0)::float AS rating, COALESCE(rt.cnt,0)::int AS review_count
     FROM listings l JOIN skills s ON s.id=l.skill_id JOIN users u ON u.id=l.user_id
     LEFT JOIN (SELECT reviewee_id, ROUND(AVG(rating)::numeric,1) AS avg, COUNT(*) AS cnt FROM reviews GROUP BY reviewee_id) rt
       ON rt.reviewee_id=u.id
     WHERE l.is_active AND u.id<>$1 AND u.status IN ('ACTIVE','WARNED')
       AND ((l.type='OFFER' AND l.skill_id = ANY($2)) OR (l.type='WANT' AND l.skill_id = ANY($3)))`,
    [me, myWants.map((w) => w.skill_id), myOffers.map((o) => o.skill_id)]);

  const byUser = new Map();
  for (const r of rows) {
    if (!byUser.has(r.user_id)) {
      byUser.set(r.user_id, {
        user: { id: r.user_id, name: r.name, location: r.location, availability: r.availability,
                avatar_color: r.avatar_color, trust_badge: r.trust_badge, rating: r.rating, review_count: r.review_count },
        theyTeach: [], theyWant: [],
      });
    }
    const m = byUser.get(r.user_id);
    if (r.type === 'OFFER') m.theyTeach.push({ listingId: r.id, skill: r.skill, level: r.level });
    else m.theyWant.push({ listingId: r.id, skill: r.skill, myListingId: myOffers.find((o) => o.skill_id === r.skill_id)?.id });
  }

  const words = (s) => new Set((s || '').toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2));
  const myAvail = words(meRow.availability);

  const matches = [...byUser.values()].map((m) => {
    const reasons = [];
    let score = 0;
    if (m.theyTeach.length) { score += 3; reasons.push(`Teaches ${m.theyTeach.map((t) => t.skill).join(', ')}`); }
    if (m.theyWant.length) { score += 3; reasons.push(`Wants to learn ${m.theyWant.map((t) => t.skill).join(', ')}`); }
    const mutual = m.theyTeach.length > 0 && m.theyWant.length > 0;
    if (mutual) score += 4;
    if (meRow.location && m.user.location && meRow.location.toLowerCase() === m.user.location.toLowerCase()) {
      score += 2; reasons.push(`Also in ${m.user.location}`);
    }
    const overlap = [...words(m.user.availability)].filter((w) => myAvail.has(w));
    if (overlap.length) { score += 1; reasons.push(`Free ${overlap.join(', ')} too`); }
    if (m.user.trust_badge) score += 1;
    score += m.user.rating / 5;
    return { ...m, mutual, score: Math.round(score * 10) / 10, reasons };
  }).sort((a, b) => b.score - a.score).slice(0, 20);

  res.json({ matches });
}));

module.exports = router;
