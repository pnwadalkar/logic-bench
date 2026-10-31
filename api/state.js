"use strict";

const accounts = require("./_lib/accounts");
const { HttpError } = require("./_lib/errors");
const { handle, readJson, cookieOf, sameOrigin } = require("./_lib/http");

module.exports = handle(async function (req) {
  const user = await accounts.userForToken(cookieOf(req));
  if (!user) throw new HttpError(401, "Sign in first.");
  if (req.method === "GET") return { body: await accounts.readState(user) };
  if (req.method === "POST" || req.method === "PUT") {
    sameOrigin(req);
    const body = await readJson(req);
    const saved = await accounts.writeState(user, body);
    return { body: saved };
  }
  throw new HttpError(405, "Use GET or POST.");
});
