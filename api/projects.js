"use strict";

/* One function for every shared-project call, picked by `action`:
   GET  → the projects you are in
   POST {action:"create", name, start, kind} · {action:"join", code} · {action:"open", id}
        {action:"sync", id, since, client, patch, here} · {action:"voice", id, client, on, m, signals}
        {action:"invite", id, to} · {action:"invites"} · {action:"accept", id} · {action:"decline", id}
        {action:"rename", id, name}
        {action:"leave", id} · {action:"delete", id} */
const accounts = require("./_lib/accounts");
const projects = require("./_lib/projects");
const { HttpError } = require("./_lib/errors");
const { handle, readJson, cookieOf, sameOrigin } = require("./_lib/http");

module.exports = handle(async function (req) {
  const user = await accounts.userForToken(cookieOf(req));
  if (!user) throw new HttpError(401, "Sign in first.");
  if (req.method === "GET") return { body: { projects: await projects.list(user) } };
  if (req.method !== "POST") throw new HttpError(405, "Use GET or POST.");
  sameOrigin(req);
  const b = await readJson(req);
  switch (b.action) {
    case "create": return { body: { project: await projects.create(user, b.name, b.start, b.kind) } };
    case "join": return { body: { project: await projects.join(user, b.code) } };
    case "invite": return { body: await projects.invite(user, b.id, b.to) };
    case "invites": return { body: { invites: await projects.invites(user) } };
    case "accept": return { body: { project: await projects.accept(user, b.id) } };
    case "decline": return { body: await projects.decline(user, b.id) };
    case "open": return { body: await projects.open(user, b.id) };
    case "sync": return { body: await projects.sync(user, b.id, b) };
    case "voice": return { body: await projects.voice(user, b.id, b) };
    case "rename": return { body: { project: await projects.rename(user, b.id, b.name) } };
    case "leave": return { body: await projects.leave(user, b.id) };
    case "delete": return { body: await projects.remove(user, b.id) };
    default: throw new HttpError(400, "Unknown action.");
  }
});
