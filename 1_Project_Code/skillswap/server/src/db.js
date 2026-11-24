require('dotenv').config({ quiet: true });
const path = require('path');

// Two modes:
//  - DATABASE_URL set   → a real PostgreSQL server (node-postgres)
//  - DATABASE_URL empty → embedded PostgreSQL (PGlite), stored in server/data. Nothing to install.
const DATA_DIR = path.join(__dirname, '..', 'data', 'pgdata');
const embedded = !process.env.DATABASE_URL;

let pg, lite, liteReady;

if (embedded) {
  liteReady = (async () => {
    require('fs').mkdirSync(path.dirname(DATA_DIR), { recursive: true });
    const { PGlite } = await import('@electric-sql/pglite');
    lite = new PGlite(DATA_DIR);
    await lite.waitReady;
  })();
} else {
  const { Pool } = require('pg');
  pg = new Pool({ connectionString: process.env.DATABASE_URL });
}

// PGlite runs one connection, so transactions and standalone queries take turns.
let chain = Promise.resolve();
function exclusive(fn) {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}
const shape = (r) => ({ rows: r.rows, rowCount: r.rows.length || r.affectedRows || 0 });

async function query(text, params) {
  if (!embedded) return pg.query(text, params);
  await liteReady;
  return exclusive(async () => shape(await lite.query(text, params)));
}

// Run fn inside a transaction; fn receives a client with .query
async function tx(fn) {
  if (!embedded) {
    const client = await pg.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
  await liteReady;
  return exclusive(() => lite.transaction((t) => fn({ query: async (q, p) => shape(await t.query(q, p)) })));
}

// Multi-statement SQL (schema file)
async function exec(sql) {
  if (!embedded) return pg.query(sql);
  await liteReady;
  return exclusive(() => lite.exec(sql));
}

async function end() {
  if (!embedded) return pg.end();
  await liteReady;
  await chain;
  return lite.close();
}

const pool = { query, end };
module.exports = { pool, query, tx, exec, end, embedded, DATA_DIR };
