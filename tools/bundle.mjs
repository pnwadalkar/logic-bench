/* Packs the whole bench into one self-contained HTML file - styles, scripts and
   fonts inlined - for carrying to a device by USB and opening with no internet.
   Usage: node tools/bundle.mjs [out]   (default: dist/logic-bench.html) */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.resolve(process.argv[2] || path.join(root, "dist", "logic-bench.html"));
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const dataUrl = (p, type) => `data:${type};base64,` + fs.readFileSync(path.join(root, p)).toString("base64");

let html = read("index.html");

/* stylesheets in place, with every font url turned into a data url */
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, href) => {
  const css = read(href).replace(/url\(([^)]+)\)/g, (m, u) =>
    u.startsWith("data:") ? m : `url(${dataUrl(path.join(path.dirname(href), u), "font/woff2")})`);
  return `<style>\n${css.trim()}\n</style>`;
});
/* scripts in place, each still its own tag so each keeps its own "use strict";
   the service worker only makes sense on the web, so offline.js stays behind */
html = html.replace(/<script src="([^"]+)"><\/script>\n?/g, (_, src) =>
  src.endsWith("offline.js") ? "" : `<script>\n${read(src).trim()}\n</script>\n`);
/* no network at all: the icon goes inline, the manifest and the font preload go */
html = html
  .replace(/<link rel="icon" href="([^"]+)"[^>]*>/, (_, href) => `<link rel="icon" href="${dataUrl(href, "image/svg+xml")}">`)
  .replace(/<link rel="(?:manifest|preload)"[^>]*>\r?\n/g, "");

const outside = html.match(/\b(?:src|href)="(?!data:|#)[^"]+"/);
if (outside) throw new Error("bundle still points at an outside file: " + outside[0]);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`wrote ${path.relative(process.cwd(), out)} (${Math.round(html.length / 1024)} KB)`);
