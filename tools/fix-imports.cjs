/* Keeps the imports of src/bench/*.js right. The bench's modules use each other's
   functions freely, by name; this reads what each one exports and what each one
   uses, and writes every file's import lines to match.
   Usage: node tools/fix-imports.cjs        (prints anything it cannot place) */
const fs = require("fs");
const path = require("path");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;

const dir = path.join(__dirname, "..", "src", "bench");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".js")).sort();
const IMPORT = /^import \{[^}]*\} from "\.\/[\w-]+\.js";\n/gm;
/* names the browser, or the language, provides */
const GLOBALS = new Set(["window", "document", "localStorage", "navigator", "location", "history", "screen", "console", "crypto", "fetch",
  "requestAnimationFrame", "cancelAnimationFrame", "getComputedStyle", "setTimeout", "clearTimeout", "setInterval", "clearInterval",
  "queueMicrotask", "URL", "URLSearchParams", "Blob", "FileReader", "TextEncoder", "Uint8Array", "Float64Array", "Promise", "Map", "Set",
  "Math", "JSON", "Object", "Array", "String", "Number", "Date", "Error", "Infinity", "NaN", "undefined", "isFinite", "parseInt", "parseFloat",
  "arguments", "encodeURIComponent", "decodeURIComponent", "AbortController", "btoa", "atob", "WebSocket"]);

const mods = files.map((f) => {
  const src = fs.readFileSync(path.join(dir, f), "utf8").replace(/\r\n/g, "\n").replace(IMPORT, "");
  const ast = parser.parse(src, { sourceType: "module" });
  const exports = new Set();
  for (const st of ast.program.body) {
    if (st.type !== "ExportNamedDeclaration" || !st.declaration) continue;
    if (st.declaration.id) exports.add(st.declaration.id.name);
    else st.declaration.declarations.forEach((d) => exports.add(d.id.name));
  }
  return { f, src, ast, exports };
});
const home = new Map();
let bad = 0;
for (const m of mods) for (const name of m.exports) {
  if (home.has(name)) { console.log("exported twice: " + name + " (" + home.get(name) + ", " + m.f + ")"); bad++; }
  home.set(name, m.f);
}
for (const m of mods) {
  const need = new Map();
  traverse(m.ast, {
    Identifier(p) {
      const name = p.node.name, par = p.parent;
      if (p.scope.getBinding(name)) return;
      const lhs = (par.type === "AssignmentExpression" && par.left === p.node) || par.type === "UpdateExpression";
      if (!lhs && !p.isReferencedIdentifier()) return;
      const from = home.get(name);
      if (from && from !== m.f) {
        if (lhs) { console.log(m.f + ":" + p.node.loc.start.line + " assigns to " + name + ", which " + from + " owns"); bad++; }
        if (!need.has(from)) need.set(from, new Set());
        need.get(from).add(name);
      } else if (!from && !GLOBALS.has(name)) { console.log(m.f + ":" + p.node.loc.start.line + " uses " + name + ", which nothing exports"); bad++; }
    }
  });
  const lines = [...need.keys()].sort((a, b) => (a === "state.js" ? -1 : b === "state.js" ? 1 : a < b ? -1 : 1))
    .map((f) => "import { " + [...need.get(f)].sort().join(", ") + ' } from "./' + f + '";\n').join("");
  /* the file's opening comment stays first */
  const c = /^\/\*[\s\S]*?\*\/\n/.exec(m.src);
  const body = (c ? m.src.slice(c[0].length) : m.src).replace(/^\n+/, "");
  fs.writeFileSync(path.join(dir, m.f), (c ? c[0] : "") + lines + (lines ? "\n" : "") + body);
}
console.log(bad ? bad + " to look at" : files.length + " files, imports in order");
process.exit(bad ? 1 : 0);
