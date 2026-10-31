"use strict";

const accounts = require("../_lib/accounts");
const { HttpError } = require("../_lib/errors");
const { handle, readJson, setCookie, clientIp, sameOrigin } = require("../_lib/http");

module.exports = handle(async function (req) {
  if (req.method !== "POST") throw new HttpError(405, "Use POST.");
  sameOrigin(req);
  const body = await readJson(req);
  const out = await accounts.login(body.username, body.password, clientIp(req));
  return { cookie: setCookie(out.token, req), body: { user: out.user } };
});
