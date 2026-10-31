/* Register, sign in, and the bench that belongs to an account.
   A password is stored only as a salted scrypt hash. The session cookie holds
   a random token; the store keeps the hash of that token, not the token. */
"use strict";

const crypto = require("crypto");
const { promisify } = require("util");
const store = require("./store");
const { HttpError, StoreError } = require("./errors");

const scryptAsync = promisify(crypto.scrypt);
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const NAME = /^[\w .-]{3,20}$/;
const DAY = 24 * 60 * 60 * 1000;
const SESSION = 30 * DAY;

const attempts = new Map();

function idOf(name) {
  return String(name || "").trim().toLowerCase();
}

function digest(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function userKey(id) { return "logic-bench/users/" + digest(id) + ".json"; }
function sessionKey(token) { return "logic-bench/sessions/" + digest(token) + ".json"; }
function stateKey(id) { return "logic-bench/state/" + digest(id) + ".json"; }

function publicUser(row) {
  return { id: row.id, name: row.name, color: row.color, created: row.created };
}

async function hashPassword(password, salt) {
  const buf = await scryptAsync(password, salt, 32, SCRYPT);
  return buf.toString("hex");
}

function sameHash(a, b) {
  const left = Buffer.from(String(a || ""), "hex");
  const right = Buffer.from(String(b || ""), "hex");
  return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
}

function checkName(name) {
  name = String(name || "").trim();
  if (!NAME.test(name)) {
    throw new HttpError(400, "Username must be 3–20 letters, numbers, spaces, dots or dashes.");
  }
  return name;
}

function checkPassword(password) {
  password = String(password || "");
  if (password.length < 6) throw new HttpError(400, "Password must be at least 6 characters.");
  if (password.length > 200) throw new HttpError(400, "Password is too long.");
  return password;
}

function limit(ip) {
  const now = Date.now();
  const recent = (attempts.get(ip) || []).filter(function (t) { return now - t < 10 * 60 * 1000; });
  if (recent.length >= 30) throw new HttpError(429, "Too many attempts. Wait a few minutes and try again.");
  recent.push(now);
  attempts.set(ip, recent);
}

async function guard(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof StoreError && err.code === "UNAVAILABLE") throw new HttpError(503, err.message);
    if (err instanceof StoreError && err.code === "EXISTS") throw new HttpError(409, "That username is already taken.");
    throw err;
  }
}

async function openSession(row) {
  const token = crypto.randomBytes(32).toString("hex");
  await store.writeJson(sessionKey(token), {
    userId: row.id,
    exp: Date.now() + SESSION,
    user: publicUser(row)
  }, false);
  return token;
}

async function register(name, password, ip) {
  name = checkName(name);
  password = checkPassword(password);
  limit(ip || "local");
  const id = idOf(name);
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await hashPassword(password, salt);
  const row = {
    id: id,
    name: name,
    salt: salt,
    hash: hash,
    color: crypto.randomInt(360),
    created: Date.now()
  };
  await guard(function () { return store.writeJson(userKey(id), row, true); });
  return { user: publicUser(row), token: await openSession(row) };
}

async function login(name, password, ip) {
  password = checkPassword(password);
  limit(ip || "local");
  const id = idOf(String(name || "").trim());
  const row = NAME.test(String(name || "").trim()) ? await guard(function () { return store.readJson(userKey(id)); }) : null;
  const hash = await hashPassword(password, row ? row.salt : "00000000000000000000000000000000");
  if (!row || !sameHash(hash, row.hash)) throw new HttpError(401, "Wrong username or password.");
  return { user: publicUser(row), token: await openSession(row) };
}

/* A shared project asks who is calling about once a second, so a session that was
   just looked up is remembered for a few seconds by this running instance. */
const recent = new Map();
const RECENT_MS = 20000;

async function userForToken(token) {
  if (!/^[a-f0-9]{64}$/.test(token || "")) return null;
  const hit = recent.get(token);
  if (hit && hit.until > Date.now()) return hit.user;
  const row = await guard(function () { return store.readJson(sessionKey(token)); });
  if (!row || !row.user || row.exp < Date.now()) {
    recent.delete(token);
    if (row) await store.remove(sessionKey(token));
    return null;
  }
  if (recent.size > 2000) recent.clear();
  recent.set(token, { user: row.user, until: Date.now() + RECENT_MS });
  return row.user;
}

async function logout(token) {
  recent.delete(token);
  if (/^[a-f0-9]{64}$/.test(token || "")) await store.remove(sessionKey(token));
}

function cleanState(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "Nothing to save.");
  const lib = body.lib && typeof body.lib === "object" && !Array.isArray(body.lib) ? body.lib : {};
  if (Object.keys(lib).length > 400) throw new HttpError(413, "Too many builds to save.");
  let cur = null;
  if (body.cur && typeof body.cur === "object" && body.cur.doc && typeof body.cur.doc === "object") {
    cur = { doc: body.cur.doc, dirty: !!body.cur.dirty };
  }
  return { lib: lib, cur: cur };
}

async function readState(user) {
  const row = await guard(function () { return store.readJson(stateKey(user.id)); });
  if (!row) return { lib: {}, cur: null, rev: 0 };
  return { lib: row.lib || {}, cur: row.cur || null, rev: row.rev || 0 };
}

/* body.base is the rev the device last saw. If another device has saved since,
   the write is refused with the newer copy, and the device merges and tries again. */
async function writeState(user, body) {
  const clean = cleanState(body);
  const prev = await guard(function () { return store.readJson(stateKey(user.id)); });
  const have = prev && prev.rev || 0;
  if (typeof body.base === "number" && body.base !== have) {
    const err = new HttpError(409, "Saved from another device since.");
    err.body = { error: err.message, lib: prev.lib || {}, cur: prev.cur || null, rev: have };
    throw err;
  }
  const next = {
    lib: clean.lib,
    cur: clean.cur,
    rev: (prev && prev.rev || 0) + 1,
    updated: Date.now()
  };
  await guard(function () { return store.writeJson(stateKey(user.id), next, false); });
  return { rev: next.rev };
}

module.exports = { register, login, logout, userForToken, readState, writeState };
