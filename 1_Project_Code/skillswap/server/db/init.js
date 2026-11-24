// Database setup.
//   node db/init.js          → drop everything, recreate tables (no data)
//   node db/init.js --seed   → same, then load the demo data
// ensureDatabase() is used by the server on start-up: it creates and seeds the
// database only if it doesn't exist yet, so a fresh copy works with no setup.
const fs = require('fs');
const path = require('path');

const SCHEMA = path.join(__dirname, 'schema.sql');

async function createSchema(db) {
  await db.exec(fs.readFileSync(SCHEMA, 'utf8'));
  console.log('Database schema created.');
}

async function ensureDatabase() {
  const db = require('../src/db');
  const { rows } = await db.query(`SELECT to_regclass('public.users') AS t`);
  if (rows[0].t) return;
  console.log('First run: setting up the database with demo data…');
  await createSchema(db);
  await require('./seed').seed();
}

module.exports = { ensureDatabase };

if (require.main === module) {
  (async () => {
    // Embedded mode: delete the data folder for a truly fresh start
    require('dotenv').config({ quiet: true });
    const dataDir = path.join(__dirname, '..', 'data', 'pgdata');
    if (!process.env.DATABASE_URL && fs.existsSync(dataDir)) {
      try { fs.rmSync(dataDir, { recursive: true, force: true }); }
      catch { throw new Error('Couldn’t clear the database. Stop the server (Ctrl+C) and try again.'); }
    }
    const db = require('../src/db');
    await createSchema(db);
    if (process.argv.includes('--seed')) await require('./seed').seed();
    await db.end();
  })().catch((e) => { console.error(e.message); process.exit(1); });
}
