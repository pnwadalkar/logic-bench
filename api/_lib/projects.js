/* Shared projects: one bench that several accounts build on together.

   A project is its parts and its wires, each kept by id as the exact text the
   bench wrote for it, plus a numbered log of change sets. A device sends what it
   changed since the number it last saw and gets back everything after that number,
   so all devices replay the same changes in the same order; the latest change to
   any one part or wire is the one that stands. Anyone in the project can change
   anything in it. Joining takes the project's invite code. */
"use strict";

const crypto = require("crypto");
const { kv, flatToObj } = require("./kv");
const { HttpError, StoreError } = require("./errors");
const accounts = require("./accounts");

const CODE_ABC = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const ID = /^[nw][\w.-]{1,40}$/;
const MAX_ENTITY = 6000;          /* one part or wire, as text */
const MAX_PATCH = 3000;           /* parts and wires in one change set */
const MAX_PARTS = 20000;          /* parts and wires in one project */
const MAX_PROJECTS = 50;

const K = (pid, part) => "lb:p:{" + pid + "}:" + part;
const keysOf = (pid) => [K(pid, "mem"), K(pid, "n"), K(pid, "w"), K(pid, "rev"), K(pid, "log"), K(pid, "here")];
const mine = (uid) => "lb:u:" + encodeURIComponent(uid) + ":proj";
const codeKey = (code) => "lb:code:" + code;
const invKey = (uid) => "lb:u:" + encodeURIComponent(uid) + ":inv";
const INVITE_LIFE = 7 * 24 * 60 * 60 * 1000;   /* an invitation nobody answers goes away */
const MAX_INVITES = 30;                         /* waiting for one person */
const MAX_MEMBERS = 20;

async function guard(fn) {
  try { return await fn(); } catch (err) {
    if (err instanceof StoreError && err.code === "UNAVAILABLE") throw new HttpError(503, err.message);
    throw err;
  }
}

function cleanName(name) {
  name = String(name || "").trim().replace(/\s+/g, " ").slice(0, 40);
  if (!name) throw new HttpError(400, "Give the project a name.");
  return name;
}
function cleanPid(pid) {
  if (!/^[a-f0-9]{16}$/.test(String(pid || ""))) throw new HttpError(400, "No such project.");
  return pid;
}
function cleanCode(code) {
  code = String(code || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length !== 6) throw new HttpError(400, "An invite code is 6 letters and numbers.");
  return code;
}
function newCode() {
  let s = "";
  for (let i = 0; i < 6; i++) s += CODE_ABC[crypto.randomInt(CODE_ABC.length)];
  return s;
}

/* A change set from a device: {id: text | null}. Each text must be one JSON
   object that names the same id. It is stored exactly as sent. */
function cleanSide(side, kind) {
  const out = [];
  if (side == null) return out;
  if (typeof side !== "object" || Array.isArray(side)) throw new HttpError(400, "That change was not valid.");
  for (const id of Object.keys(side)) {
    const v = side[id];
    if (!ID.test(id) || id[0] !== kind) throw new HttpError(400, "That change was not valid.");
    if (v === null) { out.push([id, ""]); continue; }
    if (typeof v !== "string" || v.length > MAX_ENTITY) throw new HttpError(400, "That change was not valid.");
    let o;
    try { o = JSON.parse(v); } catch (err) { throw new HttpError(400, "That change was not valid."); }
    if (!o || typeof o !== "object" || o.id !== id) throw new HttpError(400, "That change was not valid.");
    out.push([id, v]);
  }
  return out;
}
function cleanPatch(p) {
  p = p || {};
  const n = cleanSide(p.n, "n"), w = cleanSide(p.w, "w");
  if (n.length + w.length > MAX_PATCH) throw new HttpError(413, "That is too many changes at once.");
  return { n, w };
}

async function meta(pid) {
  const raw = await kv().get(K(pid, "meta"));
  return raw ? JSON.parse(raw) : null;
}
async function members(pid) {
  const h = await kv().hgetall(K(pid, "mem"));
  return Object.keys(h).map(function (id) {
    const m = JSON.parse(h[id]);
    return { id: id, name: m.name, color: m.color, joined: m.joined };
  }).sort(function (a, b) { return a.joined - b.joined; });
}
async function summary(pid, m) {
  m = m || await meta(pid);
  if (!m) return null;
  const [mem, parts, rev] = await Promise.all([members(pid), kv().hlen(K(pid, "n")), kv().get(K(pid, "rev"))]);
  return { id: pid, name: m.name, kind: m.kind === "quantum" ? "quantum" : "classical", owner: m.owner, code: m.code, created: m.created, members: mem, parts: parts, rev: Number(rev || 0) };
}
async function needMember(user, pid) {
  if (!await kv().hexists(K(pid, "mem"), user.id)) throw new HttpError(404, "That project is gone, or you are not in it.");
}
function memberRow(user) {
  return JSON.stringify({ name: user.name, color: user.color, joined: Date.now() });
}

async function list(user) {
  return guard(async function () {
    const ids = await kv().smembers(mine(user.id));
    const rows = await Promise.all(ids.map(async function (pid) {
      const s = await summary(pid);
      if (!s || !s.members.some(function (m) { return m.id === user.id; })) { await kv().srem(mine(user.id), pid); return null; }
      return s;
    }));
    return rows.filter(Boolean).sort(function (a, b) { return b.created - a.created; });
  });
}

/* A new project, empty or started from a sheet (a change set of its parts and wires). */
async function create(user, name, start, kind) {
  return guard(async function () {
    name = cleanName(name);
    const patch = cleanPatch(start);
    if ((await kv().smembers(mine(user.id))).length >= MAX_PROJECTS) throw new HttpError(400, "You are in too many projects. Leave one first.");
    const pid = crypto.randomBytes(8).toString("hex");
    let code = null;
    for (let i = 0; i < 8 && !code; i++) {
      const c = newCode();
      if (await kv().set(codeKey(c), pid, { nx: true })) code = c;
    }
    if (!code) throw new HttpError(503, "Could not make an invite code. Try again.");
    const m = { id: pid, name: name, owner: user.id, created: Date.now(), code: code };
    if (kind === "quantum") m.kind = "quantum";   /* a project is classical or quantum for good */
    await kv().set(K(pid, "meta"), JSON.stringify(m));
    await kv().hset(K(pid, "mem"), { [user.id]: memberRow(user) });
    const n = {}, w = {};
    patch.n.forEach(function (e) { if (e[1]) n[e[0]] = e[1]; });
    patch.w.forEach(function (e) { if (e[1]) w[e[0]] = e[1]; });
    await kv().hset(K(pid, "n"), n);
    await kv().hset(K(pid, "w"), w);
    await kv().set(K(pid, "rev"), "0");
    await kv().sadd(mine(user.id), pid);
    return summary(pid, m);
  });
}

async function join(user, code) {
  return guard(async function () {
    code = cleanCode(code);
    const pid = await kv().get(codeKey(code));
    const m = pid && await meta(pid);
    if (!m) throw new HttpError(404, "No project has that invite code. Check it with whoever sent it.");
    if (!await kv().hexists(K(pid, "mem"), user.id)) {
      if ((await kv().hlen(K(pid, "mem"))) >= 20) throw new HttpError(400, "That project is full (20 people).");
      await kv().hset(K(pid, "mem"), { [user.id]: memberRow(user) });
    }
    await kv().sadd(mine(user.id), pid);
    return summary(pid, m);
  });
}

/* ---------- invitations ----------
   Someone in a project names another account; the invitation waits in that
   account's inbox, and their page shows it as a popup. Accepting is what adds them. */
async function invite(user, pid, toName) {
  return guard(async function () {
    pid = cleanPid(pid);
    await needMember(user, pid);
    const m = await meta(pid);
    if (!m) throw new HttpError(404, "That project is gone.");
    const typed = String(toName || "").trim();
    if (!typed) throw new HttpError(400, "Type the username of the person to invite.");
    const target = await accounts.find(typed);
    if (!target) throw new HttpError(404, "Nobody has the username “" + typed.slice(0, 20) + "”. Check how it is spelled.");
    if (target.id === user.id) throw new HttpError(400, "That is you.");
    if (await kv().hexists(K(pid, "mem"), target.id)) throw new HttpError(400, target.name + " is already in this project.");
    if ((await kv().hlen(K(pid, "mem"))) >= MAX_MEMBERS) throw new HttpError(400, "That project is full (" + MAX_MEMBERS + " people).");
    const waiting = await kv().hgetall(invKey(target.id));
    if (!waiting[pid] && Object.keys(waiting).length >= MAX_INVITES) throw new HttpError(400, target.name + " has too many invitations waiting.");
    await kv().hset(invKey(target.id), { [pid]: JSON.stringify({
      pid: pid, project: m.name, kind: m.kind === "quantum" ? "quantum" : "classical",
      from: user.id, fromName: user.name, fromColor: user.color, at: Date.now()
    }) });
    return { to: { id: target.id, name: target.name, color: target.color } };
  });
}

/* What is waiting for this person. Invitations to projects that are gone, or that
   they are in already, or that went unanswered for a week, are cleared as they are found. */
async function invites(user) {
  return guard(async function () {
    const rows = await kv().hgetall(invKey(user.id));
    const out = [];
    for (const pid of Object.keys(rows)) {
      let o = null;
      try { o = JSON.parse(rows[pid]); } catch (err) {}
      const dead = !o || !(Date.now() - o.at < INVITE_LIFE) || !(await meta(pid)) || await kv().hexists(K(pid, "mem"), user.id);
      if (dead) { await kv().hdel(invKey(user.id), pid); continue; }
      out.push({ pid: pid, project: o.project, kind: o.kind, from: o.fromName, color: o.fromColor, at: o.at });
    }
    return out.sort(function (a, b) { return a.at - b.at; });
  });
}

async function accept(user, pid) {
  return guard(async function () {
    pid = cleanPid(pid);
    const rows = await kv().hgetall(invKey(user.id));
    if (!rows[pid]) throw new HttpError(404, "That invitation is no longer there.");
    const m = await meta(pid);
    if (!m) { await kv().hdel(invKey(user.id), pid); throw new HttpError(404, "That project is gone."); }
    if (!await kv().hexists(K(pid, "mem"), user.id)) {
      if ((await kv().hlen(K(pid, "mem"))) >= MAX_MEMBERS) throw new HttpError(400, "That project is full (" + MAX_MEMBERS + " people).");
      await kv().hset(K(pid, "mem"), { [user.id]: memberRow(user) });
    }
    await kv().sadd(mine(user.id), pid);
    await kv().hdel(invKey(user.id), pid);
    return summary(pid, m);
  });
}

async function decline(user, pid) {
  return guard(async function () {
    await kv().hdel(invKey(user.id), cleanPid(pid));
    return {};
  });
}

/* Everything in a project, at one instant, to start from. */
async function open(user, pid) {
  return guard(async function () {
    pid = cleanPid(pid);
    const k = keysOf(pid);
    const out = await kv().full([k[0], k[1], k[2], k[3]], [user.id]);
    if (Number(out[0]) === -1) throw new HttpError(404, "That project is gone, or you are not in it.");
    return { project: await summary(pid), rev: Number(out[0]), n: flatToObj(out[1] || []), w: flatToObj(out[2] || []) };
  });
}

/* Send what changed here (maybe nothing) and where this person is; get back
   everything that happened since `since`, and who else is here. */
async function sync(user, pid, body) {
  return guard(async function () {
    pid = cleanPid(pid);
    const since = Math.max(-1, Math.floor(Number(body.since)));
    if (!isFinite(since)) throw new HttpError(400, "That change was not valid.");
    const client = String(body.client || "");
    if (!/^[a-z0-9]{4,16}$/.test(client)) throw new HttpError(400, "That change was not valid.");
    const patch = cleanPatch(body.patch);
    const now = Date.now();
    let here = "";
    if (body.here && typeof body.here === "object") {
      const h = body.here;
      const sel = Array.isArray(h.sel) ? h.sel.filter(function (s) { return typeof s === "string" && ID.test(s); }).slice(0, 80) : [];
      here = now + "|" + JSON.stringify({
        u: user.id, name: user.name, color: user.color, k: client,
        x: isFinite(h.x) ? Math.round(h.x) : null, y: isFinite(h.y) ? Math.round(h.y) : null,
        on: !!h.on, sel: sel
      });
    }
    if (patch.n.length + patch.w.length && (await kv().hlen(K(pid, "n"))) + (await kv().hlen(K(pid, "w"))) > MAX_PARTS) {
      if (patch.n.concat(patch.w).some(function (e) { return e[1]; })) throw new HttpError(413, "This project is full.");
    }
    const n = {}, w = {};
    patch.n.forEach(function (e) { n[e[0]] = e[1] || null; });
    patch.w.forEach(function (e) { w[e[0]] = e[1] || null; });
    const tail = JSON.stringify({ c: client, u: user.id, n: n, w: w }).slice(1);
    const args = [user.id, since, now, client, here, patch.n.length];
    patch.n.forEach(function (e) { args.push(e[0], e[1]); });
    args.push(patch.w.length);
    patch.w.forEach(function (e) { args.push(e[0], e[1]); });
    args.push(tail);
    const out = await kv().sync(keysOf(pid), args);
    if (Number(out[0]) === -1) throw new HttpError(404, "That project is gone, or you are not in it.");
    const res = { rev: Number(out[0]), mine: Number(out[1]), now: now, here: [] };
    const hf = out[3] || [];
    for (let i = 1; i < hf.length; i += 2) {
      const cut = String(hf[i]).indexOf("|");
      try { res.here.push(Object.assign({ t: Number(String(hf[i]).slice(0, cut)) }, JSON.parse(String(hf[i]).slice(cut + 1)))); } catch (err) {}
    }
    if (Number(out[2]) === 1) res.log = (out[4] || []).map(function (s) { return JSON.parse(s); });
    if (Number(out[2]) === 2) res.full = { n: flatToObj(out[4] || []), w: flatToObj(out[5] || []) };
    return res;
  });
}

/* ---------- voice ----------
   Voice goes straight between the browsers (WebRTC); the server only carries the
   hellos. Each person in the call keeps a presence row, refreshed on every call
   here, and has a mailbox where the others leave offers, answers and network
   candidates. One call takes what you have to say, gives back what was left for
   you, and lists who else is in the call. */
const VOICE_MAX = 8;              /* everyone hears everyone, so each person holds a link to each other one */
const VOICE_TTL = 15000;          /* a presence row older than this is dropped */
const VOICE_MAIL_TTL = 60;        /* seconds a hello waits in a mailbox */
const VOICE_MAIL_CAP = 200;
const VOICE_SIGNALS = 40;         /* in one call */
const VOICE_SIGNAL_SIZE = 8000;   /* one offer, answer or candidate, as text */
const CLIENT_ID = /^[a-z0-9]{4,16}$/;
const mailbox = (pid, client) => K(pid, "vm") + ":" + client;

/* The servers a browser may use to find a way through to the others. STUN is
   enough for most networks; a TURN relay (VOICE_TURN_URLS, VOICE_TURN_USER,
   VOICE_TURN_PASS in the Vercel settings) is for the ones that block direct links. */
function voiceServers() {
  const out = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302", "stun:stun.cloudflare.com:3478"] }];
  const urls = String(process.env.VOICE_TURN_URLS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (urls.length) out.push({ urls: urls, username: process.env.VOICE_TURN_USER || "", credential: process.env.VOICE_TURN_PASS || "" });
  return out;
}

async function voice(user, pid, body) {
  return guard(async function () {
    pid = cleanPid(pid);
    await needMember(user, pid);
    const client = String(body.client || "");
    if (!CLIENT_ID.test(client)) throw new HttpError(400, "That was not valid.");
    const now = Date.now();
    const vc = K(pid, "vc");
    if (!body.on) {
      await kv().hdel(vc, client);
      await kv().drain(mailbox(pid, client));
      return { peers: [], signals: [], now: now };
    }
    const rows = await kv().hgetall(vc);
    const live = [];
    for (const k of Object.keys(rows)) {
      const cut = String(rows[k]).indexOf("|");
      const t = Number(String(rows[k]).slice(0, cut));
      let o = null;
      try { o = JSON.parse(String(rows[k]).slice(cut + 1)); } catch (err) {}
      if (!o || !(now - t < VOICE_TTL)) { await kv().hdel(vc, k); continue; }
      live.push({ k: k, t: t, u: o.u, name: o.name, color: o.color, m: !!o.m });
    }
    if (!live.some((p) => p.k === client) && live.length >= VOICE_MAX) throw new HttpError(400, "The voice chat is full (" + VOICE_MAX + " people).");
    await kv().hset(vc, { [client]: now + "|" + JSON.stringify({ u: user.id, name: user.name, color: user.color, m: !!body.m }) });
    /* leave hellos for the others */
    const sent = Array.isArray(body.signals) ? body.signals.slice(0, VOICE_SIGNALS) : [];
    const byTo = new Map();
    for (const s of sent) {
      if (!s || !CLIENT_ID.test(String(s.to || "")) || s.to === client) continue;
      if (typeof s.d !== "string" || s.d.length > VOICE_SIGNAL_SIZE) continue;
      if (!live.some((p) => p.k === s.to)) continue;
      if (!byTo.has(s.to)) byTo.set(s.to, []);
      byTo.get(s.to).push(JSON.stringify({ f: client, d: s.d }));
    }
    for (const [to, vals] of byTo) await kv().post(mailbox(pid, to), vals, VOICE_MAIL_CAP, VOICE_MAIL_TTL);
    /* and take what the others left for this one */
    const mail = [];
    for (const raw of await kv().drain(mailbox(pid, client))) {
      try { const o = JSON.parse(raw); if (o && typeof o.f === "string" && typeof o.d === "string") mail.push({ f: o.f, d: o.d }); } catch (err) {}
    }
    const peers = live.filter((p) => p.k !== client).map((p) => ({ k: p.k, u: p.u, name: p.name, color: p.color, m: p.m }));
    return { peers: peers, signals: mail, ice: voiceServers(), now: now };
  });
}

async function rename(user, pid, name) {
  return guard(async function () {
    pid = cleanPid(pid);
    await needMember(user, pid);
    const m = await meta(pid);
    if (!m) throw new HttpError(404, "That project is gone.");
    m.name = cleanName(name);
    await kv().set(K(pid, "meta"), JSON.stringify(m));
    return summary(pid, m);
  });
}

async function wipe(pid, m) {
  const mem = await kv().hgetall(K(pid, "mem"));
  await Promise.all(Object.keys(mem).map(function (uid) { return kv().srem(mine(uid), pid); }));
  if (m && m.code) await kv().del(codeKey(m.code));
  await kv().del(K(pid, "meta"), K(pid, "vc"), ...keysOf(pid));
}

/* Leaving takes the project off your list. The last one out takes it with them;
   if the owner leaves, the longest-standing member becomes the owner. */
async function leave(user, pid) {
  return guard(async function () {
    pid = cleanPid(pid);
    await needMember(user, pid);
    const m = await meta(pid);
    await kv().hdel(K(pid, "mem"), user.id);
    await kv().srem(mine(user.id), pid);
    const rest = await members(pid);
    if (!rest.length) { await wipe(pid, m); return { gone: true }; }
    if (m && m.owner === user.id) { m.owner = rest[0].id; await kv().set(K(pid, "meta"), JSON.stringify(m)); }
    return { gone: false };
  });
}

async function remove(user, pid) {
  return guard(async function () {
    pid = cleanPid(pid);
    const m = await meta(pid);
    if (!m) return { gone: true };
    if (m.owner !== user.id) throw new HttpError(403, "Only the project's owner can delete it. You can leave it instead.");
    await wipe(pid, m);
    return { gone: true };
  });
}

module.exports = { list, create, join, invite, invites, accept, decline, open, sync, voice, rename, leave, remove };
