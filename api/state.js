"use strict";

const accounts = require("./_lib/accounts");
const { HttpError } = require("./_lib/errors");
const { handle, readJson, cookieOf, sameOrigin } = require("./_lib/http");

module.exports = handle(async function (req) {
  const user = await accounts.userForToken(cookieOf(req));
  if (!user) throw new HttpError(401, "Sign in first.");
  if (req.method === "GET") {
    const state = await accounts.readState(user);
    /* a device polling for news sends the rev it has; if nothing is newer, say so in a few bytes */
    const since = Number(new URL(req.url || "/", "http://x").searchParams.get("since"));
    if (since > 0 && since === state.rev) return { body: { same: true, rev: state.rev } };
    return { body: state };
  }
  if (req.method === "POST" || req.method === "PUT") {
    sameOrigin(req);
    const body = await readJson(req);
    const saved = await accounts.writeState(user, body);
    return { body: saved };
  }
  throw new HttpError(405, "Use GET or POST.");
});
