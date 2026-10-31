/* Where accounts and benches are kept.
   On Vercel this is Upstash Redis when it is connected (see kv.js) — it takes
   frequent small writes cheaply — or else a private Blob store
   (BLOB_READ_WRITE_TOKEN, or OIDC + BLOB_STORE_ID). Locally, with neither of those set, it is the .data folder
   so the login can be tried without a store. A Vercel deploy with no store
   connected refuses to write, rather than pretending a temporary disk is durable. */
"use strict";

const fs = require("fs");
const path = require("path");
const { StoreError } = require("./errors");
const kvMod = require("./kv");

const SESSION_TTL = 30 * 24 * 60 * 60;

const KEY = /^logic-bench\/(users|sessions|state)\/[a-f0-9]{64}\.json$/;

function blobConfigured() {
  return !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

function dataRoot() {
  return process.env.LOGIC_BENCH_DATA || path.join(__dirname, "..", "..", ".data");
}

function fileOf(key) {
  if (!KEY.test(key)) throw new StoreError("BADKEY", "Bad storage key.");
  return path.join(dataRoot(), key);
}

let blobMod;
function blobApi() {
  if (!blobMod) blobMod = import("@vercel/blob");
  return blobMod;
}

async function streamText(stream) {
  if (!stream) return "";
  if (typeof stream.getReader === "function") {
    const reader = stream.getReader();
    const parts = [];
    const dec = new TextDecoder();
    for (;;) {
      const step = await reader.read();
      if (step.done) break;
      parts.push(dec.decode(step.value, { stream: true }));
    }
    parts.push(dec.decode());
    return parts.join("");
  }
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function readJson(key) {
  if (!KEY.test(key)) throw new StoreError("BADKEY", "Bad storage key.");
  if (kvMod.configured()) {
    const text = await kvMod.kv().get(key);
    return text ? JSON.parse(text) : null;
  }
  if (blobConfigured()) {
    const { get } = await blobApi();
    const result = await get(key, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    const text = await streamText(result.stream);
    return text ? JSON.parse(text) : null;
  }
  if (process.env.VERCEL) {
    throw new StoreError("UNAVAILABLE",
      "Account storage is not connected. In the Vercel project open Storage, add Upstash for Redis (or a private Blob store), connect it to this project, and redeploy.");
  }
  try {
    return JSON.parse(fs.readFileSync(fileOf(key), "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

async function writeJson(key, value, exclusive) {
  if (!KEY.test(key)) throw new StoreError("BADKEY", "Bad storage key.");
  const body = JSON.stringify(value);
  if (kvMod.configured()) {
    const opt = { nx: !!exclusive };
    if (key.indexOf("logic-bench/sessions/") === 0) opt.ex = SESSION_TTL;
    if (!await kvMod.kv().set(key, body, opt)) throw new StoreError("EXISTS", "Already there.");
    return;
  }
  if (blobConfigured()) {
    const { put } = await blobApi();
    try {
      await put(key, body, {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: !exclusive,
        contentType: "application/json",
        cacheControlMaxAge: 60
      });
    } catch (err) {
      if (exclusive && await readJson(key)) throw new StoreError("EXISTS", "Already there.");
      throw err;
    }
    return;
  }
  if (process.env.VERCEL) {
    throw new StoreError("UNAVAILABLE",
      "Account storage is not connected. In the Vercel project open Storage, create a private Blob store, connect it to this project, and redeploy.");
  }
  const file = fileOf(key);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    fs.writeFileSync(file, body, { flag: exclusive ? "wx" : "w" });
  } catch (err) {
    if (err.code === "EEXIST") throw new StoreError("EXISTS", "Already there.");
    throw err;
  }
}

async function remove(key) {
  if (!KEY.test(key)) throw new StoreError("BADKEY", "Bad storage key.");
  if (kvMod.configured()) { await kvMod.kv().del(key); return; }
  if (blobConfigured()) {
    const { del } = await blobApi();
    await del(key);
    return;
  }
  if (process.env.VERCEL) return;
  try { fs.unlinkSync(fileOf(key)); } catch (err) { if (err.code !== "ENOENT") throw err; }
}

module.exports = { readJson, writeJson, remove };
