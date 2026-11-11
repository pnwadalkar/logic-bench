/* Headless checks for the Cleaner and for saved-area chips.
   Usage: node tools/test-cleaner.mjs
   Loads the bench's own scripts into a vm with a stub DOM, builds circuits, runs
   cleanUp() and asserts the circuit still computes the same thing AND is still
   readable: no wire through a part, no two nets drawn on top of each other, no
   slants, nothing moves on a second press. */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const g2d = {
  setTransform(){}, lineWidth: 1, lineCap: "", lineJoin: "", strokeStyle: "", fillStyle: "",
  beginPath(){}, moveTo(){}, lineTo(){}, closePath(){}, stroke(){}, fill(){}, arc(){},
  fillRect(){}, strokeRect(){}, setLineDash(){}, translate(){}, scale(){}, clearRect(){},
  fillText(){}, measureText(){ return { width: 0 }; }, rect(){}, clip(){}, save(){}, restore(){},
  createPattern(){ return {}; }, quadraticCurveTo(){}, bezierCurveTo(){}, rotate(){}
};
const els = {};
const el = (sel) => els[sel] || (els[sel] = {
  textContent: "", classList: { add(){}, remove(){}, toggle(){} }, appendChild(){}, style: {},
  hidden: false, getContext: () => g2d, addEventListener(){}, setAttribute(){}, getAttribute(){ return null; },
  clientWidth: 1000, clientHeight: 700
});
const store = {};
const ctx = {
  document: {
    documentElement: { getAttribute: () => "desktop" },
    querySelector: el, querySelectorAll: () => [],
    createElement: () => ({ setAttribute(){}, appendChild(){}, style: {}, classList: { add(){}, remove(){}, toggle(){} },
      getContext: () => g2d, addEventListener(){} })
  },
  navigator: { userAgent: "" },
  localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
  requestAnimationFrame: () => 0, cancelAnimationFrame(){},
  getComputedStyle: () => ({ getPropertyValue: () => "#000" }),
  clearTimeout(){}, setTimeout: () => 0,
  HOST: { kind(){}, quantum(){}, chooseKind(){} },
  Collab: { active: () => false, peers: () => [], clock: () => 0, mergeUndo: (d) => d },
  console
};
ctx.window = ctx;
vm.createContext(ctx);
const run = (code) => vm.runInContext(code, ctx);
const load = (f) => run(fs.readFileSync(path.join(root, "src", "engine", f), "utf8"));
["core.js", "shapes.js", "symbols.js", "sim.js", "quantum.js", "render.js", "edit.js", "cleaner.js", "builds.js"].forEach(load);

/* the harness's own helpers, living inside the bench's global scope */
run(`
var T = {};
T.reset = function(){ nodes = []; wires = []; seq = 1; byId = new Map(); stepPlay = false; };
T.zoomShow = function(){};
if (typeof zoomShow === "undefined") zoomShow = function(){};
T.add = function(t, x, y, l){ var n = addNode(t, x, y); if (l) n.l = l; return n; };
T.wire = function(a, b, p, q){ wires.push({id: newId("w"), a: a.id, q: q | 0, b: b.id, p: p | 0, fa: null, fb: null}); };
T.truth = function(){
  var sw = nodes.filter(function(n){ return n.t === "SWITCH"; }).sort(function(a, b){ return a.l < b.l ? -1 : a.l > b.l ? 1 : 0; });
  var lp = nodes.filter(function(n){ return n.t === "LAMP"; }).sort(function(a, b){ return a.l < b.l ? -1 : a.l > b.l ? 1 : 0; });
  var out = [], m, i;
  for (m = 0; m < (1 << sw.length); m++){
    for (i = 0; i < sw.length; i++) sw[i].s = (m >> i) & 1;
    solve();
    out.push(lp.map(function(l){ return l.v; }).join(""));
  }
  return sw.map(function(s){ return s.l; }).join(",") + "|" + lp.map(function(l){ return l.l; }).join(",") + ":" + out.join(" ");
};
T.mark = function(){ return placeMark(); };
T.seg = function(w){ return [endA(w), endB(w)]; };
T.root = function(w){
  var n = byId.get(w.a), g = 0, cur = w, up;
  while (n && n.t === "POINT" && g++ < 60){
    up = null;
    for (var i = 0; i < wires.length; i++) if (wires[i].b === n.id){ up = wires[i]; break; }
    if (!up) break;
    cur = up; n = byId.get(up.a);
  }
  return n ? n.id + "." + (cur.q | 0) : "?";
};
T.geo = function(){
  var bad = [], bx = [], i, j, k;
  for (i = 0; i < nodes.length; i++) if (TYPES[nodes[i].t].k !== "pt") bx.push({n: nodes[i], b: box(nodes[i])});
  for (i = 0; i < bx.length; i++) for (j = i + 1; j < bx.length; j++)
    if (hits(bx[i].b, bx[j].b)) bad.push("parts overlap " + bx[i].n.id + "/" + bx[j].n.id);
  wires.forEach(function(w){
    var s = T.seg(w), t, x, y, o, b;
    if (!s[0] || !s[1]) return;
    for (k = 0; k < bx.length; k++){
      o = bx[k]; b = o.b;
      if (o.n.id === w.a || o.n.id === w.b) continue;
      for (t = 0.01; t < 1; t += 0.01){
        x = s[0].x + (s[1].x - s[0].x) * t; y = s[0].y + (s[1].y - s[0].y) * t;
        if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h){ bad.push("wire " + w.id + " runs through " + o.n.t + " " + o.n.id); break; }
      }
    }
    if (Math.abs(s[0].y - s[1].y) > 1 && Math.abs(s[0].x - s[1].x) > 1) bad.push("wire " + w.id + " is slanted");
  });
  for (i = 0; i < wires.length; i++) for (j = i + 1; j < wires.length; j++){
    var a = T.seg(wires[i]), c = T.seg(wires[j]), lo, hi;
    if (!a[0] || !a[1] || !c[0] || !c[1]) continue;
    if (T.root(wires[i]) === T.root(wires[j])) continue;
    if (Math.abs(a[0].y - a[1].y) < 1 && Math.abs(c[0].y - c[1].y) < 1 && Math.abs(a[0].y - c[0].y) < 1){
      lo = Math.max(Math.min(a[0].x, a[1].x), Math.min(c[0].x, c[1].x)); hi = Math.min(Math.max(a[0].x, a[1].x), Math.max(c[0].x, c[1].x));
      if (hi - lo > 1) bad.push("nets overlap " + wires[i].id + "/" + wires[j].id + " on a row y=" + Math.round(a[0].y) + " [" + Math.round(a[0].x) + ".." + Math.round(a[1].x) + "] " + T.root(wires[i]) + " vs [" + Math.round(c[0].x) + ".." + Math.round(c[1].x) + "] " + T.root(wires[j]));
    }
    if (Math.abs(a[0].x - a[1].x) < 1 && Math.abs(c[0].x - c[1].x) < 1 && Math.abs(a[0].x - c[0].x) < 1){
      lo = Math.max(Math.min(a[0].y, a[1].y), Math.min(c[0].y, c[1].y)); hi = Math.min(Math.max(a[0].y, a[1].y), Math.max(c[0].y, c[1].y));
      if (hi - lo > 1) bad.push("nets overlap " + wires[i].id + "/" + wires[j].id + " in a lane x=" + Math.round(a[0].x) + " " + T.root(wires[i]) + " vs " + T.root(wires[j]));
    }
  }
  return bad;
};
`);

let failed = 0, passed = 0;
function check(name, ok, detail) {
  if (ok) { passed++; console.log("  ok   " + name); }
  else { failed++; console.log("  FAIL " + name + (detail ? "\n         " + detail : "")); }
}
function circuit(name, build) {
  if (process.env.ONLY && name.indexOf(process.env.ONLY) < 0) return;
  console.log(name);
  run("T.reset()");
  build();
  run("reindex()");
  const before = run("T.truth()");
  run("cleanUp(true)");
  const after = run("T.truth()");
  check("truth table unchanged", before === after, before + "\n         " + after);
  const geo = run("T.geo()");
  check("readable: no part overlaps, no wire through a part, no shorts, no slants", geo.length === 0, geo.slice(0, 6).join("; ") + (geo.length > 6 ? " …(" + geo.length + " in all)" : ""));
  if (geo.length && process.env.DUMP) {
    console.log(run(`nodes.filter(function(n){return n.t!=="POINT"}).map(function(n){var b=box(n);return "    "+n.id+" "+n.t+" "+(n.l||"")+" x "+Math.round(b.x)+".."+Math.round(b.x+b.w)+" y "+Math.round(b.y)+".."+Math.round(b.y+b.h)+" out@"+(hasOut(n)?Math.round(outPort(n,0).x)+","+Math.round(outPort(n,0).y):"-")}).join(" ; ")`));
    console.log(run(`wires.map(function(w){var s=T.seg(w);return "    "+w.id+" "+w.a+"."+w.q+"->"+w.b+":"+w.p+"  ("+Math.round(s[0].x)+","+Math.round(s[0].y)+")-("+Math.round(s[1].x)+","+Math.round(s[1].y)+")"}).join(" ; ")`));
  }
  const m1 = run("T.mark()");
  run("cleanUp(true)");
  check("second press changes nothing", m1 === run("T.mark()"));
  check("truth table unchanged after a second press", run("T.truth()") === before);
}

/* ---- the circuits ---- */
circuit("2-bit adder from gates (Cin fans out through a Point)", () => run(`(function(){
  var cin = T.add("SWITCH", 50, 20, "Cin"), a0 = T.add("SWITCH", 50, 60, "A0"), b0 = T.add("SWITCH", 50, 100, "B0");
  var a1 = T.add("SWITCH", 50, 140, "A1"), b1 = T.add("SWITCH", 50, 180, "B1");
  var pc = T.add("POINT", 120, 20); T.wire(cin, pc, 0);
  var x01 = T.add("XOR", 150, 70); T.wire(a0, x01, 0); T.wire(b0, x01, 1);
  var x02 = T.add("XOR", 250, 50); T.wire(x01, x02, 0); T.wire(pc, x02, 1);
  var an0 = T.add("AND", 150, 110); T.wire(a0, an0, 0); T.wire(b0, an0, 1);
  var ca0 = T.add("AND", 250, 90); T.wire(x01, ca0, 0); T.wire(pc, ca0, 1);
  var or0 = T.add("OR", 350, 100); T.wire(an0, or0, 0); T.wire(ca0, or0, 1);
  var pco = T.add("POINT", 420, 100); T.wire(or0, pco, 0);
  var x11 = T.add("XOR", 150, 160); T.wire(a1, x11, 0); T.wire(b1, x11, 1);
  var x12 = T.add("XOR", 480, 150); T.wire(x11, x12, 0); T.wire(pco, x12, 1);
  var an1 = T.add("AND", 250, 200); T.wire(a1, an1, 0); T.wire(b1, an1, 1);
  var ca1 = T.add("AND", 480, 190); T.wire(x11, ca1, 0); T.wire(pco, ca1, 1);
  var or1 = T.add("OR", 580, 190); T.wire(an1, or1, 0); T.wire(ca1, or1, 1);
  var l0 = T.add("LAMP", 650, 50, "S0"); T.wire(x02, l0, 0);
  var l1 = T.add("LAMP", 650, 150, "S1"); T.wire(x12, l1, 0);
  var l2 = T.add("LAMP", 650, 190, "S2"); T.wire(or1, l2, 0);
})()`));

circuit("2-bit adder from two full-adder chips, corners on the carry", () => run(`(function(){
  var a0 = T.add("SWITCH", 50, 50, "A0"), b0 = T.add("SWITCH", 50, 100, "B0"), cin = T.add("SWITCH", 50, 150, "Cin");
  var a1 = T.add("SWITCH", 50, 200, "A1"), b1 = T.add("SWITCH", 50, 250, "B1");
  var f0 = T.add("FADD", 200, 50), f1 = T.add("FADD", 350, 250);
  var p0 = T.add("POINT", 120, 150); T.wire(cin, p0, 0); T.wire(p0, f0, 2);
  T.wire(a0, f0, 0); T.wire(b0, f0, 1);
  var c1 = T.add("POINT", 280, 120), c2 = T.add("POINT", 300, 140);
  T.wire(f0, c1, 0, 1); T.wire(c1, c2, 0); T.wire(c2, f1, 2);
  T.wire(a1, f1, 0); T.wire(b1, f1, 1);
  var l0 = T.add("LAMP", 500, 50, "S0"), l1 = T.add("LAMP", 500, 100, "S1"), l2 = T.add("LAMP", 500, 150, "S2");
  T.wire(f0, l0, 0); T.wire(f1, l1, 0); T.wire(f1, l2, 0, 1);
})()`));

circuit("4-bit ripple adder: a carry that has to cross several columns", () => run(`(function(){
  var cin = T.add("SWITCH", 20, 20, "Cin"), prev = cin, pq = 0, i, a, b, f, s;
  for (i = 0; i < 4; i++){
    a = T.add("SWITCH", 20, 80 + i * 70, "A" + i); b = T.add("SWITCH", 20, 110 + i * 70, "B" + i);
    f = T.add("FADD", 200 + i * 130, 60 + i * 60);
    T.wire(a, f, 0); T.wire(b, f, 1); T.wire(prev, f, 2, pq);
    s = T.add("LAMP", 700, 40 + i * 50, "S" + i); T.wire(f, s, 0);
    prev = f; pq = 1;
  }
  var co = T.add("LAMP", 700, 300, "S4"); T.wire(prev, co, 0, 1);
})()`));

/* random circuits: truth must always survive; they also should come out readable */
let seed = Number(process.env.SEED) || 12345;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const RANDOMS = Number(process.env.RANDOMS) || 12, BIG = Number(process.env.BIG) || 0;
for (let k = 0; k < RANDOMS; k++) {
  const nin = 3 + Math.floor(rnd() * (3 + BIG)), ng = 4 + Math.floor(rnd() * (8 + BIG * 3));
  const spec = { nin, ng, r: Array.from({ length: 200 }, () => rnd()) };
  circuit("random circuit " + (k + 1) + " (" + nin + " switches, " + ng + " gates)", () => run(`(function(S){
    var r = 0, nx = function(){ return S.r[r++ % S.r.length]; }, srcs = [], i, g, t, n, p, w;
    for (i = 0; i < S.nin; i++) srcs.push(T.add("SWITCH", 30, 30 + i * 50, "I" + i));
    var types = ["AND", "OR", "XOR", "NAND", "NOR"];
    for (i = 0; i < S.ng; i++){
      t = types[Math.floor(nx() * types.length)];
      g = T.add(t, 100 + nx() * 500, 20 + nx() * 400);
      for (p = 0; p < 2; p++){
        n = srcs[Math.floor(nx() * srcs.length)];
        if (nx() < 0.4){ w = T.add("POINT", n.x + 60 + nx() * 40, n.y + nx() * 80); T.wire(n, w, 0); T.wire(w, g, p); }
        else T.wire(n, g, p);
      }
      srcs.push(g);
    }
    var used = {}; wires.forEach(function(w){ used[w.a] = 1; });
    var li = 0;
    srcs.forEach(function(s){ if (s.t !== "SWITCH" && !used[s.id]){ var l = T.add("LAMP", 700, 30 + li * 40, "L" + li); li++; T.wire(s, l, 0); } });
    if (!li){ var l = T.add("LAMP", 700, 30, "L0"); T.wire(srcs[srcs.length - 1], l, 0); }
  })(${JSON.stringify(spec)})`));
}

/* random ripple adders built from the adder chips: carries that cross, Points dropped
   anywhere on a wire, wires left dangling by hand, an input fanned out to two chips */
const ADDERS = Number(process.env.ADDERS) || 25;
for (let k = 0; k < ADDERS; k++) {
  const spec = { bits: 2 + Math.floor(rnd() * 3), r: Array.from({ length: 300 }, () => rnd()) };
  circuit("random ripple adder " + (k + 1) + " (" + spec.bits + " bits, chips, stray Points, dangling wires)", () => run(`(function(S){
    var r = 0, nx = function(){ return S.r[r++ % S.r.length]; }, i, a, b, f, s, prev, pq = 0, chips = [], p, c1;
    /* wire x -> y.pin, maybe through one or two Points dropped at random */
    var link = function(x, q, y, pin){
      var m = nx(), t, u;
      if (m < 0.35){
        t = T.add("POINT", (x.x + y.x) / 2 + (nx() - 0.5) * 120, (x.y + y.y) / 2 + (nx() - 0.5) * 160);
        T.wire(x, t, 0, q);
        if (m < 0.12){ u = T.add("POINT", t.x + (nx() - 0.3) * 80, t.y + (nx() - 0.5) * 80); T.wire(t, u, 0); T.wire(u, y, pin); }
        else T.wire(t, y, pin);
      } else T.wire(x, y, pin, q);
    };
    var cin = T.add("SWITCH", 20, 20 + nx() * 40, "Cin");
    prev = cin;
    for (i = 0; i < S.bits; i++){
      a = T.add("SWITCH", 20 + nx() * 40, 100 + i * 90 + nx() * 40, "A" + i);
      b = T.add("SWITCH", 20 + nx() * 40, 150 + i * 90 + nx() * 40, "B" + i);
      f = T.add("FADD", 180 + nx() * 300, 40 + i * 110 + nx() * 60);
      link(a, 0, f, 0); link(b, 0, f, 1); link(prev, pq, f, 2);
      s = T.add("LAMP", 600 + nx() * 120, 40 + i * 70, "S" + i); link(f, 0, s, 0);
      prev = f; pq = 1; chips.push(f);
    }
    s = T.add("LAMP", 700, 400, "S" + S.bits); link(prev, 1, s, 0);
    /* a Cin that also feeds a second place, as the carry does in a hand-built adder */
    if (nx() < 0.5){ p = T.add("POINT", cin.x + 90, cin.y + 30); T.wire(cin, p, 0); T.wire(p, T.add("LAMP", 650, 460, "Cout?"), 0); }
    /* wires started and left hanging, from a switch and into a chip pin */
    if (nx() < 0.5){ wires.push({id: newId("w"), a: cin.id, q: 0, b: null, p: 0, fa: null, fb: {x: cin.x + 140, y: cin.y + 90}}); }
    if (nx() < 0.4){ wires.push({id: newId("w"), a: null, q: 0, b: null, p: 0, fa: {x: 300, y: 500}, fb: {x: 380, y: 520}}); }
  })(${JSON.stringify(spec)})`));
}

/* ---- chips: a saved area is a part with named pins ---- */
console.log("saved-area chips");
run(`
T.makeChip = function(name, ids){        /* what Save as chip does, without the dialog */
  pickN = new Set(ids); pickW = new Set();
  var c = clipFrom(); pickN = new Set();
  return defineUserChip(name, c);
};
T.expect = function(fn){                 /* compare the sheet's truth table with a function of the switch bits */
  var sw = nodes.filter(function(n){ return n.t === "SWITCH"; }).sort(function(a, b){ return a.l < b.l ? -1 : 1; });
  var lp = nodes.filter(function(n){ return n.t === "LAMP"; }).sort(function(a, b){ return a.l < b.l ? -1 : 1; });
  var bad = [], m, i, got, want;
  for (m = 0; m < (1 << sw.length); m++){
    for (i = 0; i < sw.length; i++) sw[i].s = (m >> i) & 1;
    solve();
    got = lp.map(function(l){ return l.v; }).join("");
    want = fn(sw.map(function(s){ return s.s; })).join("");
    if (got !== want) bad.push("inputs " + sw.map(function(s){ return s.s; }).join("") + " gave " + got + ", wanted " + want);
  }
  return bad;
};
T.halfAdder = function(){                /* a half adder, drawn out of gates */
  T.reset();
  var a = T.add("SWITCH", 20, 20, "A"), b = T.add("SWITCH", 20, 80, "B");
  var x = T.add("XOR", 120, 20), n = T.add("AND", 120, 80);
  var s = T.add("LAMP", 240, 20, "S"), c = T.add("LAMP", 240, 80, "C");
  T.wire(a, x, 0); T.wire(b, x, 1); T.wire(a, n, 0); T.wire(b, n, 1); T.wire(x, s, 0); T.wire(n, c, 0);
  reindex();
  return nodes.map(function(q){ return q.id; });
};
`);
const ha = run("(function(){ var ids = T.halfAdder(); return T.makeChip('HA', ids); })()");
check("a chip type is made, named for the area", typeof ha === "string" && ha.indexOf("U:HA#") === 0);
check("switches are the input pins, named for the switches", run(`JSON.stringify(TYPES["${ha}"].pn)`) === '["A","B"]', run(`JSON.stringify(TYPES["${ha}"].pn)`));
check("lamps are the output pins, named for the lamps", run(`JSON.stringify(TYPES["${ha}"].po)`) === '["S","C"]');
check("it is drawn as a chip with the name on it", run(`TYPES["${ha}"].k === "chip" && TYPES["${ha}"].user === 1 && TYPES["${ha}"].ab === "HA"`));

const fullAdder = (bits) => { const t = bits[0] + bits[1] + bits[2]; return [t & 1, t >> 1]; };
ctx.__fa = fullAdder;
function sheetOfChips(haKey) {
  run(`T.reset();
    var X = T.add("SWITCH", 20, 20, "X"), Y = T.add("SWITCH", 20, 90, "Y"), Z = T.add("SWITCH", 20, 160, "Z");
    var h1 = T.add("${haKey}", 160, 40), h2 = T.add("${haKey}", 330, 80), o = T.add("OR", 500, 120);
    var s = T.add("LAMP", 620, 60, "Q1"), c = T.add("LAMP", 620, 140, "Q2");
    T.wire(X, h1, 0); T.wire(Y, h1, 1); T.wire(h1, h2, 0, 0); T.wire(Z, h2, 1);
    T.wire(h1, o, 0, 1); T.wire(h2, o, 1, 1); T.wire(h2, s, 0, 0); T.wire(o, c, 0);
    reindex();`);
}
sheetOfChips(ha);
let bad = run("T.expect(function(b){ var t = b[0] + b[1] + b[2]; return [t & 1, t >> 1]; })");
check("two chips and an OR add three bits, as a full adder does", bad.length === 0, bad.join("; "));
check("the open-input count is not tripped by chip pins", run("solve()") === 0);

/* a chip that holds a chip */
const fa = run("(function(){ return T.makeChip('FA', nodes.map(function(n){ return n.id; })); })()");
check("a chip can be made of chips (pins: X Y Z in, Q1 Q2 out)", run(`JSON.stringify([TYPES["${fa}"].pn, TYPES["${fa}"].po])`) === '[["X","Y","Z"],["Q1","Q2"]]');
run(`T.reset();
  var a = T.add("SWITCH", 20, 20, "A"), b = T.add("SWITCH", 20, 90, "B"), c = T.add("SWITCH", 20, 160, "C");
  var f = T.add("${fa}", 200, 60), s = T.add("LAMP", 400, 60, "Q1"), k = T.add("LAMP", 400, 120, "Q2");
  T.wire(a, f, 0); T.wire(b, f, 1); T.wire(c, f, 2); T.wire(f, s, 0, 0); T.wire(f, k, 0, 1); reindex();`);
bad = run("T.expect(function(b){ var t = b[0] + b[1] + b[2]; return [t & 1, t >> 1]; })");
check("the nested chip still adds", bad.length === 0, bad.join("; "));

/* the build carries its chips: forget the type, load it back */
const json = JSON.parse(JSON.stringify(run("snapshot()")));
check("the snapshot carries the chip definitions (and the chip inside)", json.chips && json.chips[fa] && json.chips[ha], Object.keys(json.chips || {}).join());
run(`delete TYPES["${fa}"]; delete TYPES["${ha}"];`);
ctx.__j = json;
run("(function(){ var g = graphOf(__j); nodes = g.nodes; wires = g.wires; reindex(); })()");
bad = run("T.expect(function(b){ var t = b[0] + b[1] + b[2]; return [t & 1, t >> 1]; })");
check("it opens again with the types forgotten, and still adds", bad.length === 0 && run("nodes.length") === 6, bad.join("; "));

/* a chip with memory keeps it between solves */
run(`T.reset();
  var d = T.add("SWITCH", 20, 20, "D"), k = T.add("SWITCH", 20, 80, "K"), f = T.add("DFF", 140, 40), q = T.add("LAMP", 260, 40, "Q");
  T.wire(d, f, 0); T.wire(k, f, 1); T.wire(f, q, 0); reindex();`);
const ff = run("T.makeChip('Bit', nodes.map(function(n){ return n.id; }))");
run(`T.reset();
  var d = T.add("SWITCH", 20, 20, "d"), k = T.add("SWITCH", 20, 80, "k"), c = T.add("${ff}", 160, 40), q = T.add("LAMP", 300, 40, "q");
  T.wire(d, c, 0); T.wire(k, c, 1); T.wire(c, q, 0); reindex();
  T.step = function(dv, kv){ d.s = dv; k.s = kv; solve(); return q.v; };`);
const seq = [[1, 0], [1, 1], [0, 1], [0, 0], [0, 1]].map(([dv, kv]) => run(`T.step(${dv}, ${kv})`)).join("");
check("a flip-flop inside a chip holds its value (0 1 1 1 0)", seq === "01110", seq);

/* the cleaner on a sheet with chips on it */
circuit("a sheet of chips, put through the Cleaner", () => sheetOfChips(ha) || run("1"));
check("duplicate switch names become A, A2", (() => {
  run(`T.reset(); var a1 = T.add("SWITCH", 0, 0, "A"), a2 = T.add("SWITCH", 0, 60, "A"), q = T.add("LAMP", 100, 0, "");
    var g = T.add("AND", 60, 0); T.wire(a1, g, 0); T.wire(a2, g, 1); T.wire(g, q, 0); reindex();`);
  const k = run("T.makeChip('Dup', nodes.map(function(n){ return n.id; }))");
  return run(`JSON.stringify([TYPES["${k}"].pn, TYPES["${k}"].po])`) === '[["A","A2"],["Q1"]]';
})(), run(`JSON.stringify(TYPES[Object.keys(TYPES).filter(function(k){return k.indexOf("U:Dup")===0})[0]].pn)`));

/* saved builds, if asked for:  JSONS=D:/circuits node tools/test-cleaner.mjs */
if (process.env.JSONS) {
  for (const f of fs.readdirSync(process.env.JSONS).filter((x) => x.endsWith(".json"))) {
    ctx.__d = JSON.parse(fs.readFileSync(path.join(process.env.JSONS, f), "utf8"));
    circuit("saved build " + f, () => run("(function(){ var g = graphOf(__d); nodes = g.nodes; wires = g.wires; seq = __d.seq || 1000; })()"));
  }
}

console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
