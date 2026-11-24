const jwt = require('jsonwebtoken');
const { query } = require('../db');

const SECRET = () => process.env.JWT_SECRET || 'dev-secret';

function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, SECRET(), { expiresIn: '7d' });
}

// Requires a valid JWT and an account that is not suspended/banned/deleted.
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Please sign in to continue.' });
  try {
    const payload = jwt.verify(token, SECRET());
    const { rows } = await query('SELECT id, name, email, role, status FROM users WHERE id=$1', [payload.id]);
    const user = rows[0];
    if (!user || user.status === 'DELETED') return res.status(401).json({ error: 'Account not found.' });
    if (user.status === 'BANNED') return res.status(403).json({ error: 'This account has been banned.' });
    if (user.status === 'SUSPENDED') return res.status(403).json({ error: 'This account is suspended. Contact support for help.' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
  }
}

// REQ-34: admin functions are role-restricted
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admins only.' });
  next();
}

module.exports = { signToken, requireAuth, requireAdmin };
