/* Invitations by username, against the in-memory store and a temporary accounts folder. */
import { createRequire } from "node:module";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
const require = createRequire(import.meta.url);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lb-inv-"));
process.env.LOGIC_BENCH_DATA = dir;
delete process.env.VERCEL; delete process.env.DATABASE_URL; delete process.env.POSTGRES_URL;
delete process.env.BLOB_READ_WRITE_TOKEN;
const accounts = require("../api/_lib/accounts.js");
const projects = require("../api/_lib/projects.js");

let bad = 0, n = 0;
const ok = (c, what) => { n++; if (!c) { bad++; console.log("FAIL", what); } };
const fails = async (fn, status, what) => {
  try { await fn(); ok(false, what + " (did not fail)"); } catch (e) { ok(e.status === status, what + " (" + e.status + " " + e.message + ")"); }
};
const mk = async (name) => (await accounts.register(name, "password-123", "ip-" + name)).user;

const alex = await mk("Alex"), bo = await mk("Bo Lee"), cy = await mk("Cyrus"), dee = await mk("Deedee");
const p = await projects.create(alex, "Adder", null, "classical");

ok((await projects.invites(bo)).length === 0, "nothing waiting at first");

/* asking */
const r = await projects.invite(alex, p.id, "bo lee");
ok(r.to.name === "Bo Lee", "the name is found whatever the capitals");
let list = await projects.invites(bo);
ok(list.length === 1 && list[0].pid === p.id && list[0].project === "Adder" && list[0].from === "Alex", "Bo has the invitation, with who and what");
ok((await projects.invites(cy)).length === 0, "nobody else does");
await projects.invite(alex, p.id, "Bo Lee");
ok((await projects.invites(bo)).length === 1, "asking twice leaves one");

/* refused asks */
await fails(() => projects.invite(alex, p.id, "nobodyhere"), 404, "unknown username");
await fails(() => projects.invite(alex, p.id, ""), 400, "empty username");
await fails(() => projects.invite(alex, p.id, "Alex"), 400, "inviting yourself");
await fails(() => projects.invite(cy, p.id, "Deedee"), 404, "a non-member cannot invite");
await fails(() => projects.invite(alex, "zzzz", "Deedee"), 400, "bad project id");

/* not a member until accepted */
await fails(() => projects.open(bo, p.id), 404, "Bo cannot open it yet");
await fails(() => projects.accept(cy, p.id), 404, "Cy has no invitation to accept");
const got = await projects.accept(bo, p.id);
ok(got.members.length === 2 && got.members.some((m) => m.id === bo.id), "accepting makes Bo a member");
ok((await projects.invites(bo)).length === 0, "the invitation is used up");
ok((await projects.list(bo)).length === 1, "the project is on Bo's list");
await fails(() => projects.invite(alex, p.id, "Bo Lee"), 400, "already in it");
await projects.open(bo, p.id);

/* a member (not only the owner) can bring someone else in */
await projects.invite(bo, p.id, "Cyrus");
ok((await projects.invites(cy)).length === 1, "Bo invited Cy");

/* declining */
await projects.decline(cy, p.id);
ok((await projects.invites(cy)).length === 0, "declined: gone");
await fails(() => projects.open(cy, p.id), 404, "declining does not add them");

/* an invitation to a deleted project is cleared */
await projects.invite(alex, p.id, "Deedee");
await projects.remove(alex, p.id);
ok((await projects.invites(dee)).length === 0, "deleted project: invitation cleared");

/* one that goes unanswered for a week goes away */
const q = await projects.create(alex, "Old", null, "classical");
await projects.invite(alex, q.id, "Deedee");
const realNow = Date.now;
Date.now = () => realNow() + 8 * 24 * 3600 * 1000;
ok((await projects.invites(dee)).length === 0, "a week old: cleared");
Date.now = realNow;

/* lookups */
ok((await accounts.find("alex")).id === "alex" && !(await accounts.find("a/../b")) && !(await accounts.find("")), "accounts.find");

fs.rmSync(dir, { recursive: true, force: true });
console.log(bad ? bad + " of " + n + " checks FAILED" : "invites: all " + n + " checks passed");
process.exit(bad ? 1 : 0);
