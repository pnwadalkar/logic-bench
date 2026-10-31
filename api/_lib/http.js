/* Shared request helpers for the Vercel functions and the local dev server. */
"use strict";

const { HttpError } = require("./errors");

const COOKIE = "lb_session";
const MAX_AGE = 60 * 60 * 24 * 30;
const MAX_BODY = 4.5 * 1024 * 1024;

function https(req) {
  return String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https";
}

function cookieOf(req) {
  const raw = req.headers.cookie || "";
  const parts = raw.split(";");
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const cut = part.indexOf("=");
    if (cut < 0) continue;
    if (part.slice(0, cut).trim() === COOKIE) {
      try { return decodeURIComponent(part.slice(cut + 1).trim()); } catch (err) { return ""; }
    }
  }
  return "";
}

function setCookie(token, req) {
  const parts = [
    COOKIE + "=" + encodeURIComponent(token),
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    "Max-Age=" + MAX_AGE
  ];
  if (https(req)) parts.push("Secure");
  return parts.join("; ");
}

function clearCookie(req) {
  const parts = [COOKIE + "=", "HttpOnly", "Path=/", "SameSite=Lax", "Max-Age=0"];
  if (https(req)) parts.push("Secure");
  return parts.join("; ");
}

function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (fwd) return String(fwd).split(",")[0].trim();
  return (req.socket && req.socket.remoteAddress) || "local";
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return;
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  let ok = false;
  try { ok = new URL(origin).host === host; } catch (err) { ok = false; }
  if (!ok) throw new HttpError(403, "That request was refused.");
}

async function readJson(req) {
  if (req.body != null && req.body !== "") {
    if (Buffer.isBuffer(req.body)) return parse(req.body.toString("utf8"));
    if (typeof req.body === "string") return parse(req.body);
    if (typeof req.body === "object") return req.body;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new HttpError(413, "That is too large to save.");
    chunks.push(chunk);
  }
  if (!size) return {};
  return parse(Buffer.concat(chunks).toString("utf8"));
}

function parse(text) {
  if (!text) return {};
  try { return JSON.parse(text); } catch (err) { throw new HttpError(400, "That was not valid data."); }
}

function send(res, status, body, cookie) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  if (cookie) res.setHeader("Set-Cookie", cookie);
  res.end(JSON.stringify(body == null ? {} : body));
}

/* Plain Node response calls, so the same handler runs on Vercel and in tools/dev-server.mjs. */
function handle(fn) {
  return async function (req, res) {
    try {
      const result = await fn(req);
      send(res, result.status || 200, result.body, result.cookie);
    } catch (err) {
      const status = err.status || 500;
      if (status === 500) console.error(err);
      send(res, status, status === 500 ? { error: "Something went wrong." } : (err.body || { error: err.message }));
    }
  };
}

module.exports = { handle, readJson, cookieOf, setCookie, clearCookie, clientIp, sameOrigin };
