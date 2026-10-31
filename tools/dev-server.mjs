/* Serves the bench and the /api routes together.
   On Vercel the api folder is deployed as functions; this is the local equivalent.
   Usage: node tools/dev-server.mjs [port] */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const routes = {
  "/api/auth/register": require("../api/auth/register.js"),
  "/api/auth/login": require("../api/auth/login.js"),
  "/api/auth/logout": require("../api/auth/logout.js"),
  "/api/auth/me": require("../api/auth/me.js"),
  "/api/state": require("../api/state.js")
};
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
  ".json": "application/json"
};

function safeFile(urlPath) {
  const rel = decodeURIComponent(urlPath.split("?")[0]);
  if (rel.includes("\0")) return null;
  const file = path.resolve(root, "." + (rel === "/" ? "/index.html" : rel));
  if (file !== root && !file.startsWith(root + path.sep)) return null;
  const inside = path.relative(root, file);
  if (inside.startsWith("..") || inside === ".data" || inside.startsWith(".data" + path.sep)) return null;
  if (inside === "node_modules" || inside.startsWith("node_modules" + path.sep)) return null;
  if (inside === ".git" || inside.startsWith(".git" + path.sep)) return null;
  return file;
}

function onRequest(req, res) {
  const url = new URL(req.url, "http://127.0.0.1");
  const route = routes[url.pathname];
  if (route) return route(req, res);
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.statusCode = 405;
    res.end("Method not allowed");
    return;
  }
  const file = safeFile(url.pathname);
  if (!file) { res.statusCode = 403; res.end("Forbidden"); return; }
  fs.stat(file, function (err, stat) {
    const target = !err && stat.isDirectory() ? path.join(file, "index.html") : file;
    fs.readFile(target, function (readErr, buf) {
      if (readErr) { res.statusCode = 404; res.end("Not found"); return; }
      res.setHeader("Content-Type", types[path.extname(target)] || "application/octet-stream");
      res.end(req.method === "HEAD" ? undefined : buf);
    });
  });
}

export function start(port) {
  return new Promise(function (resolve) {
    const server = http.createServer(onRequest);
    server.listen(port, "127.0.0.1", function () { resolve(server); });
  });
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const port = Number(process.argv[2] || process.env.PORT || 3000);
  start(port).then(function (server) {
    console.log("Logic Bench at http://127.0.0.1:" + server.address().port);
  });
}
