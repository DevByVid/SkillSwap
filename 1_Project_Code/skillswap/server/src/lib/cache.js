// Small cache layer: Redis when REDIS_URL is set (deployment diagram), in-memory otherwise.
const memory = new Map();
let redis = null;

async function init() {
  if (!process.env.REDIS_URL) return;
  try {
    const { createClient } = require('redis');
    redis = createClient({ url: process.env.REDIS_URL });
    redis.on('error', () => {});
    await redis.connect();
    console.log('Redis cache connected');
  } catch (e) {
    console.warn('Redis unavailable, falling back to in-memory cache');
    redis = null;
  }
}

async function get(key) {
  if (redis) {
    const v = await redis.get(key);
    return v ? JSON.parse(v) : null;
  }
  const hit = memory.get(key);
  if (!hit || hit.exp < Date.now()) return null;
  return hit.value;
}

async function set(key, value, ttlSec = 60) {
  if (redis) return redis.set(key, JSON.stringify(value), { EX: ttlSec });
  memory.set(key, { value, exp: Date.now() + ttlSec * 1000 });
}

async function clear(prefix) {
  if (redis) {
    const keys = await redis.keys(prefix + '*');
    if (keys.length) await redis.del(keys);
    return;
  }
  for (const k of memory.keys()) if (k.startsWith(prefix)) memory.delete(k);
}

module.exports = { init, get, set, clear };
