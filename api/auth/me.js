"use strict";

const accounts = require("../_lib/accounts");
const { HttpError } = require("../_lib/errors");
const { handle, cookieOf } = require("../_lib/http");

module.exports = handle(async function (req) {
  if (req.method !== "GET") throw new HttpError(405, "Use GET.");
  const user = await accounts.userForToken(cookieOf(req));
  if (!user) throw new HttpError(401, "Sign in first.");
  return { body: { user: user } };
});
