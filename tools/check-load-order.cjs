/* The bench's modules import each other in circles, which is fine for functions
   that are only called later — but a module must not, while it is loading, use a
   value from a module that might not have loaded yet. This lists every such use
   and fails if the module it leans on could still be mid-load at that point
   (that is, if that module can reach back to this one through its own imports).
   Usage: node tools/check-load-order.cjs */
const fs = require("fs");
const path = require("path");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;

const dir = path.join(__dirname, "..", "src", "bench");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".js"));
const deps = new Map(), uses = [];
for (const f of files) {
  const ast = parser.parse(fs.readFileSync(path.join(dir, f), "utf8"), { sourceType: "module" });
  const from = new Map();
  deps.set(f, new Set());
  for (const st of ast.program.body) {
    if (st.type !== "ImportDeclaration") continue;
    const src = st.source.value.replace("./", "");
    deps.get(f).add(src);
    st.specifiers.forEach((s) => from.set(s.local.name, src));
  }
  traverse(ast, {
    Identifier(p) {
      if (!p.isReferencedIdentifier() || !from.has(p.node.name)) return;
      const b = p.scope.getBinding(p.node.name);
      if (!b || b.kind !== "module") return;
      /* inside a function it runs later, when everything has loaded — unless that function is called on the spot */
      let q = p, deferred = false;
      while ((q = q.getFunctionParent())) {
        const call = q.parentPath;
        if (!(call.isCallExpression() && call.node.callee === q.node)) { deferred = true; break; }
      }
      if (!deferred) uses.push({ f, name: p.node.name, from: from.get(p.node.name), line: p.node.loc.start.line });
    }
  });
}
function reaches(a, b, seen = new Set()) {
  if (a === b) return true;
  if (seen.has(a)) return false;
  seen.add(a);
  for (const d of deps.get(a) || []) if (reaches(d, b, seen)) return true;
  return false;
}
let bad = 0;
const shown = new Set();
for (const u of uses) {
  const circular = [...(deps.get(u.from) || [])].some((d) => reaches(d, u.f));
  const key = u.f + " " + u.name;
  if (circular && !shown.has(key)) { shown.add(key); bad++; console.log(u.f + ":" + u.line + " uses " + u.name + " while loading, but " + u.from + " imports its way back to " + u.f); }
}
console.log(bad ? bad + " load-order problems" : "load order is safe (" + uses.length + " load-time uses, none circular)");
process.exit(bad ? 1 : 0);
