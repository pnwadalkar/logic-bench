/* A small key-value layer for the things that change many times a minute:
   shared projects, and (when connected) accounts and personal builds too.

   On Vercel this is Upstash Redis from the Vercel Marketplace, which sets
   KV_REST_API_URL / KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL / _TOKEN).
   Locally, with neither set, it is an in-memory stand-in with the same two
   scripts, so `npm run dev` works with no setup (projects last until it stops).

   The two scripts are where order matters. SYNC applies one person's changes and
   gives that change set the next number in one step, so every change a project
   has ever had sits in a single numbered line that every device replays the same. */
"use strict";

const { StoreError } = require("./errors");

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const LOG_KEEP = 300;          /* change sets kept for catching up; behind that, a full copy is sent */
const HERE_TTL = 60000;        /* a presence row older than this is dropped */

function configured() { return !!(URL_ && TOKEN); }

/* KEYS: mem n w rev log here
   ARGV: uid since now hereField hereValue nN [id val]*  nW [id val]*  entryTail
   An empty val deletes. Returns {-1} for a non-member, else
   {rev, mine, 0, here}            nothing new since `since`
   {rev, mine, 1, here, entries}   the change sets after `since`
   {rev, mine, 2, here, n, w}      too far behind: everything */
const SYNC_LUA = `
if redis.call('HEXISTS', KEYS[1], ARGV[1]) == 0 then return {-1} end
local since = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
if ARGV[5] ~= '' then redis.call('HSET', KEYS[6], ARGV[4], ARGV[5]) end
local i = 6
local changed = false
local nn = tonumber(ARGV[i]); i = i + 1
for k = 1, nn do
  if ARGV[i + 1] == '' then redis.call('HDEL', KEYS[2], ARGV[i]) else redis.call('HSET', KEYS[2], ARGV[i], ARGV[i + 1]) end
  i = i + 2; changed = true
end
local nw = tonumber(ARGV[i]); i = i + 1
for k = 1, nw do
  if ARGV[i + 1] == '' then redis.call('HDEL', KEYS[3], ARGV[i]) else redis.call('HSET', KEYS[3], ARGV[i], ARGV[i + 1]) end
  i = i + 2; changed = true
end
local rev = tonumber(redis.call('GET', KEYS[4]) or '0')
local mine = 0
if changed then
  rev = redis.call('INCR', KEYS[4]); mine = rev
  redis.call('RPUSH', KEYS[5], '{"r":' .. rev .. ',' .. ARGV[i])
  local over = redis.call('LLEN', KEYS[5]) - ${LOG_KEEP}
  if over > 0 then redis.call('LTRIM', KEYS[5], over, -1) end
end
local all = redis.call('HGETALL', KEYS[6])
local here = {}
for j = 1, #all, 2 do
  local t = tonumber(string.match(all[j + 1], '^(%d+)|'))
  if t and now - t < ${HERE_TTL} then here[#here + 1] = all[j]; here[#here + 1] = all[j + 1]
  else redis.call('HDEL', KEYS[6], all[j]) end
end
if since == rev then return {rev, mine, 0, here} end
local len = redis.call('LLEN', KEYS[5])
local first = rev - len + 1
if since >= 0 and since < rev and since + 1 >= first then
  return {rev, mine, 1, here, redis.call('LRANGE', KEYS[5], since + 1 - first, -1)}
end
return {rev, mine, 2, here, redis.call('HGETALL', KEYS[2]), redis.call('HGETALL', KEYS[3])}
`;

/* KEYS: mem n w rev   ARGV: uid   → {-1} or {rev, n, w} taken at one instant */
const FULL_LUA = `
if redis.call('HEXISTS', KEYS[1], ARGV[1]) == 0 then return {-1} end
return {tonumber(redis.call('GET', KEYS[4]) or '0'), redis.call('HGETALL', KEYS[2]), redis.call('HGETALL', KEYS[3])}
`;

/* ---------- Upstash ---------- */
function upstash() {
  const { Redis } = require("@upstash/redis");
  const r = new Redis({ url: URL_, token: TOKEN, automaticDeserialization: false });
  const sync = r.createScript(SYNC_LUA), full = r.createScript(FULL_LUA);
  const obj = function (h) { return h && typeof h === "object" && !Array.isArray(h) ? h : flatToObj(h || []); };
  return {
    kind: "redis",
    get: (k) => r.get(k),
    set: (k, v, opt) => {
      opt = opt || {};
      const o = {};
      if (opt.nx) o.nx = true;
      if (opt.ex) o.ex = opt.ex;
      return r.set(k, v, o).then((res) => res === "OK" || res === true);
    },
    del: (...k) => r.del(...k),
    hset: (k, o) => Object.keys(o).length ? r.hset(k, o) : 0,
    hdel: (k, f) => r.hdel(k, f),
    hexists: (k, f) => r.hexists(k, f).then((n) => !!n),
    hgetall: (k) => r.hgetall(k).then(obj),
    hlen: (k) => r.hlen(k),
    sadd: (k, m) => r.sadd(k, m),
    srem: (k, m) => r.srem(k, m),
    smembers: (k) => r.smembers(k),
    sync: (keys, args) => sync.exec(keys, args.map(String)),
    full: (keys, args) => full.exec(keys, args.map(String))
  };
}

function flatToObj(a) {
  const o = {};
  for (let i = 0; i + 1 < a.length; i += 2) o[a[i]] = a[i + 1];
  return o;
}

/* ---------- in memory, for local use ---------- */
function memory() {
  const db = new Map();
  const hash = (k) => { let h = db.get(k); if (!(h instanceof Map)) { h = new Map(); db.set(k, h); } return h; };
  const list = (k) => { let l = db.get(k); if (!Array.isArray(l)) { l = []; db.set(k, l); } return l; };
  const set_ = (k) => { let s = db.get(k); if (!(s instanceof Set)) { s = new Set(); db.set(k, s); } return s; };
  const flat = (h) => { const a = []; h.forEach((v, f) => { a.push(f, v); }); return a; };
  const expiry = new Map();
  const alive = (k) => { const t = expiry.get(k); if (t && t < Date.now()) { db.delete(k); expiry.delete(k); } return db.has(k); };
  const api = {
    kind: "memory",
    get: async (k) => (alive(k) && typeof db.get(k) === "string" ? db.get(k) : null),
    set: async (k, v, opt) => {
      opt = opt || {};
      if (opt.nx && alive(k)) return false;
      db.set(k, String(v));
      if (opt.ex) expiry.set(k, Date.now() + opt.ex * 1000); else expiry.delete(k);
      return true;
    },
    del: async (...ks) => { ks.forEach((k) => db.delete(k)); return ks.length; },
    hset: async (k, o) => { const h = hash(k); Object.keys(o).forEach((f) => h.set(f, String(o[f]))); return 1; },
    hdel: async (k, f) => (db.get(k) instanceof Map ? +db.get(k).delete(f) : 0),
    hexists: async (k, f) => db.get(k) instanceof Map && db.get(k).has(f),
    hgetall: async (k) => (db.get(k) instanceof Map ? Object.fromEntries(db.get(k)) : {}),
    hlen: async (k) => (db.get(k) instanceof Map ? db.get(k).size : 0),
    sadd: async (k, m) => { set_(k).add(m); return 1; },
    srem: async (k, m) => (db.get(k) instanceof Set ? +db.get(k).delete(m) : 0),
    smembers: async (k) => (db.get(k) instanceof Set ? Array.from(db.get(k)) : []),
    /* the same steps as SYNC_LUA, run in one go (Node does not interleave them) */
    sync: async (K, A) => {
      A = A.map(String);
      if (!(db.get(K[0]) instanceof Map) || !db.get(K[0]).has(A[0])) return [-1];
      const since = Number(A[1]), now = Number(A[2]);
      if (A[4] !== "") hash(K[5]).set(A[3], A[4]);
      let i = 5, changed = false;
      for (const key of [K[1], K[2]]) {
        const count = Number(A[i]); i++;
        for (let k = 0; k < count; k++) {
          if (A[i + 1] === "") hash(key).delete(A[i]); else hash(key).set(A[i], A[i + 1]);
          i += 2; changed = true;
        }
      }
      let rev = Number(db.get(K[3]) || 0), mine = 0;
      const log = list(K[4]);
      if (changed) {
        rev += 1; mine = rev; db.set(K[3], String(rev));
        log.push('{"r":' + rev + "," + A[i]);
        if (log.length > LOG_KEEP) log.splice(0, log.length - LOG_KEEP);
      }
      const here = [];
      hash(K[5]).forEach((v, f) => {
        const m = /^(\d+)\|/.exec(v);
        if (m && now - Number(m[1]) < HERE_TTL) here.push(f, v); else hash(K[5]).delete(f);
      });
      if (since === rev) return [rev, mine, 0, here];
      const first = rev - log.length + 1;
      if (since >= 0 && since < rev && since + 1 >= first) return [rev, mine, 1, here, log.slice(since + 1 - first)];
      return [rev, mine, 2, here, flat(hash(K[1])), flat(hash(K[2]))];
    },
    full: async (K, A) => {
      if (!(db.get(K[0]) instanceof Map) || !db.get(K[0]).has(String(A[0]))) return [-1];
      return [Number(db.get(K[3]) || 0), flat(hash(K[1])), flat(hash(K[2]))];
    }
  };
  return api;
}

let client = null;
function kv() {
  if (client) return client;
  if (configured()) return (client = upstash());
  if (process.env.VERCEL) {
    throw new StoreError("UNAVAILABLE",
      "Shared projects need Redis. In the Vercel project open Storage, add Upstash for Redis (free), connect it to this project, and redeploy.");
  }
  return (client = memory());
}

module.exports = { kv, configured, SYNC_LUA, FULL_LUA, flatToObj, _memory: memory };
