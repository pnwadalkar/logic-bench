/* A small key-value layer for the things that change many times a minute:
   shared projects, and (when connected) accounts and personal builds too.

   On Vercel this is a Postgres database — Neon's free plan from the Vercel
   Marketplace, which sets DATABASE_URL (any other Postgres works too: Supabase,
   or your own, via DATABASE_URL or POSTGRES_URL). The tables are made on first use.
   Locally, with neither set, it is an in-memory stand-in with the same calls,
   so `npm run dev` works with no setup (projects last until it stops).

   The one step where order matters is SYNC (the lb_sync function in the database):
   it applies one person's changes and gives that change set the next number while
   holding the project's lock, so every change a project has ever had sits in a
   single numbered line that every device replays the same. */
"use strict";

const { StoreError } = require("./errors");

const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
const LOG_KEEP = 300;          /* change sets kept for catching up; behind that, a full copy is sent */
const HERE_TTL = 60000;        /* a presence row older than this is dropped */

function configured() { return !!DB_URL; }

/* Strings (with an optional expiry, ms since 1970), hashes, sets, mailboxes and
   each project's change log, as five tables. Run as one statement list, so it is
   one transaction, behind a lock, so two cold starts don't make them at once. */
const SCHEMA = String.raw`
select pg_advisory_xact_lock(4120917);
create table if not exists lb_str (k text primary key, v text not null, exp bigint);
create index if not exists lb_str_exp on lb_str (exp) where exp is not null;
create table if not exists lb_hash (k text not null, f text not null, v text not null, primary key (k, f));
create table if not exists lb_set (k text not null, m text not null, primary key (k, m));
create table if not exists lb_mail (i bigserial primary key, k text not null, v text not null, exp bigint not null);
create index if not exists lb_mail_k on lb_mail (k, i);
create index if not exists lb_mail_exp on lb_mail (exp);
create table if not exists lb_log (k text not null, r bigint not null, v text not null, primary key (k, r));

/* ks: mem n w rev log here
   a:  uid since now hereField hereValue nN [id val]*  nW [id val]*  entryTail
   An empty val deletes. Returns [-1] for a non-member, else
   [rev, mine, 0, here]            nothing new since 'since'
   [rev, mine, 1, here, entries]   the change sets after 'since'
   [rev, mine, 2, here, n, w]      too far behind: everything
   (here, n and w as {field: value}) */
create or replace function lb_sync(ks text[], a text[]) returns jsonb language plpgsql as $f$
declare
  _since bigint := a[2]::bigint;
  _now bigint := a[3]::bigint;
  _i int := 6;
  _cnt int;
  _key text;
  _changed boolean := false;
  _rev bigint;
  _mine bigint := 0;
  _first bigint;
  _here jsonb;
begin
  if not exists (select 1 from lb_hash where k = ks[1] and f = a[1]) then return '[-1]'::jsonb; end if;
  perform pg_advisory_xact_lock(hashtext(ks[4]));
  if a[5] <> '' then
    insert into lb_hash (k, f, v) values (ks[6], a[4], a[5]) on conflict (k, f) do update set v = excluded.v;
  end if;
  foreach _key in array array[ks[2], ks[3]] loop
    _cnt := a[_i]::int; _i := _i + 1;
    for _j in 1.._cnt loop
      if a[_i + 1] = '' then
        delete from lb_hash where k = _key and f = a[_i];
      else
        insert into lb_hash (k, f, v) values (_key, a[_i], a[_i + 1]) on conflict (k, f) do update set v = excluded.v;
      end if;
      _i := _i + 2; _changed := true;
    end loop;
  end loop;
  select coalesce((select v::bigint from lb_str where k = ks[4]), 0) into _rev;
  if _changed then
    _rev := _rev + 1; _mine := _rev;
    insert into lb_str (k, v, exp) values (ks[4], _rev::text, null) on conflict (k) do update set v = excluded.v, exp = null;
    insert into lb_log (k, r, v) values (ks[5], _rev, '{"r":' || _rev || ',' || a[_i]);
    delete from lb_log where k = ks[5] and r <= _rev - ${LOG_KEEP};
  end if;
  delete from lb_hash where k = ks[6]
    and (substring(v from '^(\d+)\|') is null or _now - substring(v from '^(\d+)\|')::bigint >= ${HERE_TTL});
  select coalesce(jsonb_object_agg(f, v), '{}'::jsonb) into _here from lb_hash where k = ks[6];
  if _since = _rev then return jsonb_build_array(_rev, _mine, 0, _here); end if;
  select min(r) into _first from lb_log where k = ks[5];
  if _since >= 0 and _since < _rev and _first is not null and _since + 1 >= _first then
    return jsonb_build_array(_rev, _mine, 1, _here,
      (select coalesce(jsonb_agg(v order by r), '[]'::jsonb) from lb_log where k = ks[5] and r > _since));
  end if;
  return jsonb_build_array(_rev, _mine, 2, _here,
    (select coalesce(jsonb_object_agg(f, v), '{}'::jsonb) from lb_hash where k = ks[2]),
    (select coalesce(jsonb_object_agg(f, v), '{}'::jsonb) from lb_hash where k = ks[3]));
end
$f$;
`;

/* KEYS: mem n w rev   ARGV: uid   → [-1] or [rev, n, w] taken at one instant (one statement) */
const FULL_SQL = `
select case when exists (select 1 from lb_hash where k = $1 and f = $5) then jsonb_build_array(
  coalesce((select v::bigint from lb_str where k = $4), 0),
  (select coalesce(jsonb_object_agg(f, v), '{}'::jsonb) from lb_hash where k = $2),
  (select coalesce(jsonb_object_agg(f, v), '{}'::jsonb) from lb_hash where k = $3)
) else '[-1]'::jsonb end as out`;

function objToFlat(o) {
  const a = [];
  Object.keys(o || {}).forEach(function (f) { a.push(f, o[f]); });
  return a;
}

/* ---------- Postgres ----------
   `query(text, params)` → rows. On Vercel it is a pg Pool; the tests pass their own. */
function postgres(query) {
  let ready = null;
  const q = async function (text, params) {
    if (!ready) ready = query(SCHEMA).catch(function (err) { ready = null; throw err; });
    await ready;
    return query(text, params);
  };
  const now = () => Date.now();
  const sometimes = () => Math.random() < 0.02;
  const strs = (a) => a.map(String);
  return {
    kind: "postgres",
    get: async (k) => {
      const rows = await q("select v from lb_str where k = $1 and (exp is null or exp > $2)", [k, now()]);
      return rows.length ? rows[0].v : null;
    },
    set: async (k, v, opt) => {
      opt = opt || {};
      const t = now();
      if (opt.ex && sometimes()) await q("delete from lb_str where exp <= $1", [t]);
      /* with nx, a live row stays as it is and nothing comes back */
      const rows = await q(
        "insert into lb_str (k, v, exp) values ($1, $2, $3) on conflict (k) do update set v = excluded.v, exp = excluded.exp" +
        " where not $4::boolean or (lb_str.exp is not null and lb_str.exp <= $5) returning 1 as ok",
        [k, String(v), opt.ex ? t + opt.ex * 1000 : null, !!opt.nx, t]);
      return rows.length > 0;
    },
    del: async (...ks) => {
      await q("delete from lb_str where k = any($1)", [ks]);
      await q("delete from lb_hash where k = any($1)", [ks]);
      await q("delete from lb_set where k = any($1)", [ks]);
      await q("delete from lb_mail where k = any($1)", [ks]);
      await q("delete from lb_log where k = any($1)", [ks]);
      return ks.length;
    },
    hset: async (k, o) => {
      const f = Object.keys(o);
      if (!f.length) return 0;
      await q("insert into lb_hash (k, f, v) select $1::text, * from unnest($2::text[], $3::text[])" +
        " on conflict (k, f) do update set v = excluded.v", [k, f, f.map((x) => String(o[x]))]);
      return f.length;
    },
    hdel: async (k, f) => (await q("delete from lb_hash where k = $1 and f = $2 returning 1 as ok", [k, f])).length,
    hexists: async (k, f) => (await q("select 1 as ok from lb_hash where k = $1 and f = $2", [k, f])).length > 0,
    hgetall: async (k) => {
      const o = {};
      (await q("select f, v from lb_hash where k = $1", [k])).forEach((r) => { o[r.f] = r.v; });
      return o;
    },
    hlen: async (k) => Number((await q("select count(*) as n from lb_hash where k = $1", [k]))[0].n),
    sadd: async (k, m) => (await q("insert into lb_set (k, m) values ($1, $2) on conflict do nothing returning 1 as ok", [k, String(m)])).length,
    srem: async (k, m) => (await q("delete from lb_set where k = $1 and m = $2 returning 1 as ok", [k, String(m)])).length,
    smembers: async (k) => (await q("select m from lb_set where k = $1", [k])).map((r) => r.m),
    /* a mailbox: add to the end (keeping the newest `cap`, all gone `ttl` s after the last post), take everything */
    post: async (k, vals, cap, ttl) => {
      if (!vals.length) return 0;
      const exp = now() + ttl * 1000;
      await q("insert into lb_mail (k, v, exp) select $1::text, x, $3::bigint from unnest($2::text[]) with ordinality as t(x, o) order by o", [k, strs(vals), exp]);
      await q("update lb_mail set exp = $2 where k = $1", [k, exp]);
      await q("delete from lb_mail where k = $1 and i not in (select i from lb_mail where k = $1 order by i desc limit $2)", [k, cap]);
      return vals.length;
    },
    drain: async (k) => {
      const t = now();
      if (sometimes()) await q("delete from lb_mail where exp <= $1", [t]);
      const rows = await q("delete from lb_mail where k = $1 returning i, v, exp", [k]);
      return rows.filter((r) => Number(r.exp) > t).sort((a, b) => Number(a.i) - Number(b.i)).map((r) => r.v);
    },
    sync: async (keys, args) => {
      const out = (await q("select lb_sync($1::text[], $2::text[]) as out", [keys, strs(args)]))[0].out;
      if (out[0] === -1) return [-1];
      const res = [out[0], out[1], out[2], objToFlat(out[3])];
      if (out[2] === 1) res.push(out[4]);
      if (out[2] === 2) res.push(objToFlat(out[4]), objToFlat(out[5]));
      return res;
    },
    full: async (keys, args) => {
      const out = (await q(FULL_SQL, [keys[0], keys[1], keys[2], keys[3], String(args[0])]))[0].out;
      if (out[0] === -1) return [-1];
      return [out[0], objToFlat(out[1]), objToFlat(out[2])];
    }
  };
}

/* The connection: TLS for anything that isn't this machine (sslmode=disable turns
   it off); PGSSL_NO_VERIFY=1 accepts a certificate Node can't check (other hosts). */
function pgPool() {
  const { Pool } = require("pg");
  const u = new URL(DB_URL);
  const mode = u.searchParams.get("sslmode");
  ["sslmode", "sslrootcert", "sslcert", "sslkey", "uselibpqcompat"].forEach((p) => u.searchParams.delete(p));
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname);
  /* Supabase signs with its own root certificate, which Node doesn't carry: still encrypted, just not checked */
  const supabase = /(^|\.)supabase\.(com|co)$/.test(u.hostname);
  const ssl = mode === "disable" || (local && !mode) ? false
    : { rejectUnauthorized: !supabase && process.env.PGSSL_NO_VERIFY !== "1" };
  const pool = new Pool({ connectionString: u.toString(), ssl: ssl, max: 4, idleTimeoutMillis: 10000, connectionTimeoutMillis: 10000 });
  pool.on("error", function () {});   /* an idle connection the server closed; the next query opens another */
  return postgres((text, params) => pool.query(text, params).then((r) => r.rows));
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
    post: async (k, vals, cap, ttl) => {
      if (!vals.length) return 0;
      alive(k);
      const l = list(k);
      l.push(...vals);
      if (l.length > cap) l.splice(0, l.length - cap);
      expiry.set(k, Date.now() + ttl * 1000);
      return vals.length;
    },
    drain: async (k) => {
      if (!alive(k) || !Array.isArray(db.get(k))) return [];
      const l = db.get(k); db.delete(k); expiry.delete(k);
      return l;
    },
    /* the same steps as lb_sync, run in one go (Node does not interleave them) */
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
  if (configured()) return (client = pgPool());
  if (process.env.VERCEL) {
    throw new StoreError("UNAVAILABLE",
      "Shared projects need a database. In the Vercel project open Storage, add Neon (Postgres, free), connect it to this project, and redeploy.");
  }
  return (client = memory());
}

module.exports = { kv, configured, flatToObj, SCHEMA, _memory: memory, _postgres: postgres };
