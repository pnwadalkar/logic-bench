/* The voice chat's server side, against the in-memory store:
   presence, mailboxes, who may talk to whom, the size limit. */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
delete process.env.VERCEL; delete process.env.DATABASE_URL; delete process.env.POSTGRES_URL;
const projects = require("../api/_lib/projects.js");

let bad = 0, n = 0;
const ok = (c, what) => { n++; if (!c) { bad++; console.log("FAIL", what); } };
const fails = async (fn, status, what) => {
  try { await fn(); ok(false, what + " (did not fail)"); } catch (e) { ok(e.status === status, what + " (" + e.status + ")"); }
};
const U = (i) => ({ id: "u" + i, name: "User" + i, color: i * 40 });
const call = (u, pid, client, o) => projects.voice(u, pid, Object.assign({ client: client, on: true }, o || {}));
const sig = (to, d) => ({ to: to, d: JSON.stringify(d) });

const a = U(1), b = U(2), c = U(3), out = U(9);
const p = await projects.create(a, "Room", null, "classical");
await projects.join(b, p.code);

/* alone */
let r = await call(a, p.id, "aaaa");
ok(r.peers.length === 0 && r.signals.length === 0, "alone: nobody else");
ok(r.ice.length >= 1 && String(r.ice[0].urls).includes("stun:"), "ice servers include STUN");

/* the second person sees the first, and names come from the server */
r = await call(b, p.id, "bbbb", { m: true });
ok(r.peers.length === 1 && r.peers[0].k === "aaaa" && r.peers[0].name === "User1" && r.peers[0].m === false, "b sees a");
r = await call(a, p.id, "aaaa");
ok(r.peers.length === 1 && r.peers[0].k === "bbbb" && r.peers[0].m === true, "a sees b muted");

/* a hello is delivered once, to the right mailbox */
await call(b, p.id, "bbbb", { signals: [sig("aaaa", { s: "x", t: "offer", sdp: "v=0" })] });
r = await call(a, p.id, "aaaa");
ok(r.signals.length === 1 && r.signals[0].f === "bbbb" && JSON.parse(r.signals[0].d).t === "offer", "a gets b's offer");
r = await call(a, p.id, "aaaa");
ok(r.signals.length === 0, "and only once");
r = await call(b, p.id, "bbbb");
ok(r.signals.length === 0, "b did not get its own");

/* limits: hellos to nobody, to oneself, oversized and malformed ones are dropped */
await call(a, p.id, "aaaa", { signals: [sig("zzzz", { s: "x" }), sig("aaaa", { s: "x" }),
  { to: "bbbb", d: "x".repeat(9000) }, { to: "bbbb", d: 5 }, { to: "BAD ID", d: "{}" }, null, "str"] });
r = await call(b, p.id, "bbbb");
ok(r.signals.length === 0, "junk hellos are dropped");
const many = []; for (let i = 0; i < 60; i++) many.push(sig("bbbb", { s: "x", i: i }));
await call(a, p.id, "aaaa", { signals: many });
r = await call(b, p.id, "bbbb");
ok(r.signals.length === 40, "at most 40 hellos per call (" + r.signals.length + ")");

/* someone outside the project cannot take part */
await fails(() => call(out, p.id, "oooo"), 404, "a non-member is turned away");
await fails(() => call(a, p.id, "BAD ID"), 400, "a bad client id is refused");
await fails(() => call(a, "nope", "aaaa"), 400, "a bad project id is refused");

/* leaving takes the row and the mailbox away */
await call(b, p.id, "bbbb", { signals: [sig("aaaa", { s: "y" })] });
await call(a, p.id, "aaaa", { on: false });
r = await call(b, p.id, "bbbb");
ok(r.peers.length === 0, "a left: b is alone");
r = await call(a, p.id, "aaaa");
ok(r.signals.length === 0, "a's mailbox was emptied on leaving");

/* a row that stops being refreshed expires */
const realNow = Date.now;
Date.now = () => realNow() + 20000;
r = await call(a, p.id, "aaaa");
Date.now = realNow;
ok(r.peers.length === 0, "b's stale row has expired");

await call(a, p.id, "aaaa", { on: false });

/* eight at most; the same person can come back to a place they hold */
await projects.join(c, p.code);
const many8 = [];
for (let i = 0; i < 8; i++) {
  const u = U(20 + i);
  await projects.join(u, p.code);
  many8.push(u);
}
let admitted = 0;
for (let i = 0; i < 8; i++) { await call(many8[i], p.id, "clnt" + i); admitted++; }
await fails(() => call(c, p.id, "cccc"), 400, "the ninth is refused");
r = await call(many8[0], p.id, "clnt0");
ok(r.peers.length === 7, "an existing member can still call (" + r.peers.length + ")");

/* the project's end takes the call with it */
await projects.remove(a, p.id);
await fails(() => call(b, p.id, "bbbb"), 404, "deleted project: voice is gone");

console.log(bad ? bad + " of " + n + " checks FAILED" : "voice: all " + n + " checks passed");
process.exit(bad ? 1 : 0);
