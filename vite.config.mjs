/* Logic Bench is a Vite + React app. Vercel builds it with `vite build` into dist/
   and deploys api/ beside it as functions.
     npm run dev      the app with hot reload, and the /api routes served alongside
     npm run build    the website, into dist/
     npm run bundle   the whole bench as one offline file, dist-single/logic-bench.html */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/* The layout (laptop or tablet) has to be picked before the first paint, so the
   little script that picks it goes into the page itself, ahead of everything. */
function layoutBoot() {
  return {
    name: "logic-bench-layout-boot",
    transformIndexHtml(html) {
      const js = fs.readFileSync(path.join(root, "src", "layout-boot.js"), "utf8");
      return html.replace("<!--layout-boot-->", () => `<script>\n${js.trim()}\n</script>`);
    }
  };
}

/* The /api routes, served by the dev and preview servers the way Vercel serves them. */
function apiRoutes() {
  const routes = {
    "/api/auth/register": "./api/auth/register.js",
    "/api/auth/login": "./api/auth/login.js",
    "/api/auth/logout": "./api/auth/logout.js",
    "/api/auth/me": "./api/auth/me.js",
    "/api/state": "./api/state.js",
    "/api/projects": "./api/projects.js"
  };
  const mount = (server) => {
    server.middlewares.use((req, res, next) => {
      const route = routes[(req.url || "").split("?")[0]];
      if (!route) return next();
      require(route)(req, res);
    });
  };
  return { name: "logic-bench-api", configureServer: mount, configurePreviewServer: mount };
}

/* Offline: once the build is written, list every file in it for the service worker
   to keep on the device. The version is a hash of the list, so a new deploy
   replaces the old copy by itself. */
function serviceWorker() {
  let outDir = "";
  const walk = (dir, base) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name), base + e.name + "/") : [base + e.name]);
  return {
    name: "logic-bench-sw",
    apply: "build",
    configResolved(c) { outDir = path.resolve(c.root, c.build.outDir); },
    closeBundle() {
      if (!fs.existsSync(path.join(outDir, "index.html"))) return;
      const files = walk(outDir, "").filter((f) => f !== "sw.js").sort();
      const hash = crypto.createHash("sha256");
      files.forEach((f) => hash.update(f).update(fs.readFileSync(path.join(outDir, f))));
      const sw = fs.readFileSync(path.join(root, "src", "sw.template.js"), "utf8")
        .replace("__VERSION__", "logic-bench-" + hash.digest("hex").slice(0, 12))
        .replace("__FILES__", JSON.stringify(["./"].concat(files)));
      fs.writeFileSync(path.join(outDir, "sw.js"), sw);
    }
  };
}

/* The one-file build: no manifest (nothing to install from a file), the icon
   inline, and the page named for what it is. */
function singleFile() {
  let outDir = "";
  return {
    name: "logic-bench-single",
    configResolved(c) { outDir = path.resolve(c.root, c.build.outDir); },
    transformIndexHtml(html) {
      const icon = "data:image/svg+xml;base64," + fs.readFileSync(path.join(root, "public", "icon.svg")).toString("base64");
      return html.replace(/<link rel="manifest"[^>]*>\s*/, "").replace(/(<link rel="icon" href=")[^"]+/, "$1" + icon);
    },
    closeBundle() {
      const from = path.join(outDir, "index.html");
      if (fs.existsSync(from)) fs.renameSync(from, path.join(outDir, "logic-bench.html"));
    }
  };
}

export default defineConfig(({ mode }) => {
  const single = mode === "single";
  return {
    plugins: [react(), layoutBoot(), apiRoutes()].concat(single ? [viteSingleFile(), singleFile()] : [serviceWorker()]),
    publicDir: single ? false : "public",
    define: { __SINGLE_FILE__: JSON.stringify(single) },
    build: {
      outDir: single ? "dist-single" : "dist",
      emptyOutDir: true,
      assetsInlineLimit: single ? 100000000 : 4096,
      chunkSizeWarningLimit: 900
    },
    server: { port: 3000, host: "127.0.0.1" },
    preview: { port: 3000, host: "127.0.0.1" }
  };
});
