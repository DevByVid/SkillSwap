require('dotenv').config({ quiet: true });
const express = require('express');
const cors = require('cors');
const cache = require('./lib/cache');
const { ensureDatabase } = require('../db/init');
const { embedded } = require('./db');

const app = express();
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api', require('./routes/listings'));
app.use('/api', require('./routes/search'));
app.use('/api/swaps', require('./routes/swaps'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api', require('./routes/account'));

app.use((req, res) => res.status(404).json({ error: 'Not found.' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
});

const PORT = process.env.PORT || 5000;
ensureDatabase()
  .then(() => cache.init())
  .then(() => {
    app.listen(PORT, () => {
      console.log(`SkillSwap API running on http://localhost:${PORT}`);
      console.log(embedded ? 'Database: built-in (stored in server/data)' : 'Database: PostgreSQL from DATABASE_URL');
    });
  })
  .catch((e) => {
    console.error('Could not start the database:', e.message);
    if (embedded) console.error('If another SkillSwap server is already running, close it first.');
    process.exit(1);
  });
