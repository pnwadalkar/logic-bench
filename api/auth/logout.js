"use strict";

const accounts = require("../_lib/accounts");
const { HttpError } = require("../_lib/errors");
const { handle, cookieOf, clearCookie, sameOrigin } = require("../_lib/http");

module.exports = handle(async function (req) {
  if (req.method !== "POST") throw new HttpError(405, "Use POST.");
  sameOrigin(req);
  await accounts.logout(cookieOf(req));
  return { cookie: clearCookie(req), body: {} };
});
