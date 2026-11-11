/* The Arena: challenges, the people who have entered them, and the ranking.
   A build is sent in against a challenge, the checker (checker.js) runs it, and it
   takes its place among the other entries by score. Entries are kept in this
   browser and shared by every account on it; "Share my entries" carries them to
   another device, where each is run through the checker again before it counts. */
import { S, flash, notify } from "./state.js";
import { Auth } from "./auth.js";
import { keepBuild, libRead, snapshot } from "./builds.js";
import { judge } from "./checker.js";
import { TYPES } from "./core.js";

/* ---------- reference builds ---------- */
/* A small way to write a circuit down: c.sw("A") is a switch, c.g("AND", x, y) a part
   wired from x and y, c.lamp("Sum", x) a lamp. x.o(1) is a part's second output. */
export function circuit(fn){
  var ns = [], ws = [], k = 0;
  var put = function(t, l){ var n = {id:"n" + (++k), t:t, x:0, y:0, s:0, l:l || ""}; ns.push(n); return n; };
  var ref = function(n){ var r = {id:n.id, q:0}; r.o = function(q){ return {id:n.id, q:q}; }; return r; };
  var wire = function(src, n, p){ ws.push({id:"w" + (++k), a:src.id, q:src.q, b:n.id, p:p}); };
  fn({
    sw:function(l){ return ref(put("SWITCH", l)); },
    g:function(t){
      var n = put(t), i;
      for (i = 1; i < arguments.length; i++) wire(arguments[i], n, i - 1);
      return ref(n);
    },
    lamp:function(l, src){ wire(src, put("LAMP", l), 0); }
  });
  return {v:1, nodes:ns, wires:ws};
}

/* ---------- the challenges ---------- */
/* ins and outs name the switches and lamps; f(inputs) gives the outputs the circuit must make.
   bots are the builds already in the Arena, each by someone who is not really there. */
export var CHALLENGES = [
  {id:"half", name:"Half adder", level:"Easy", use:"gates", ins:["A","B"], outs:["Sum","Carry"],
    blurb:"Add two bits. Sum is A + B, and Carry is 1 when the answer needs a second bit.",
    f:function(v){ return [v[0] ^ v[1], v[0] & v[1]]; },
    bots:[
      ["Ada", function(c){ var a = c.sw("A"), b = c.sw("B");
        c.lamp("Sum", c.g("XOR", a, b)); c.lamp("Carry", c.g("AND", a, b)); }],
      ["Boole", function(c){ var a = c.sw("A"), b = c.sw("B"), n = c.g("NAND", a, b);
        c.lamp("Sum", c.g("NAND", c.g("NAND", a, n), c.g("NAND", b, n))); c.lamp("Carry", c.g("NAND", n, n)); }],
      ["Hopper", function(c){ var a = c.sw("A"), b = c.sw("B");
        c.lamp("Sum", c.g("AND", c.g("OR", a, b), c.g("NAND", a, b))); c.lamp("Carry", c.g("AND", a, b)); }]
    ]},
  {id:"mux", name:"2:1 multiplexer", level:"Easy", use:"gates", ins:["D0","D1","S"], outs:["Y"],
    blurb:"A selector. Y is D0 while S is 0, and D1 while S is 1.",
    f:function(v){ return [v[2] ? v[1] : v[0]]; },
    bots:[
      ["Ada", function(c){ var d0 = c.sw("D0"), d1 = c.sw("D1"), s = c.sw("S");
        c.lamp("Y", c.g("NAND", c.g("NAND", d0, c.g("NOT", s)), c.g("NAND", d1, s))); }],
      ["Boole", function(c){ var d0 = c.sw("D0"), d1 = c.sw("D1"), s = c.sw("S");
        c.lamp("Y", c.g("OR", c.g("AND", d0, c.g("NOT", s)), c.g("AND", d1, s))); }],
      ["Hopper", function(c){ var d0 = c.sw("D0"), d1 = c.sw("D1"), s = c.sw("S");
        c.lamp("Y", c.g("XOR", d0, c.g("AND", s, c.g("XOR", d0, d1)))); }]
    ]},
  {id:"maj", name:"Majority vote", level:"Easy", use:"gates", ins:["A","B","C"], outs:["Y"],
    blurb:"Y is 1 when at least two of the three inputs are 1.",
    f:function(v){ return [v[0] + v[1] + v[2] >= 2 ? 1 : 0]; },
    bots:[
      ["Ada", function(c){ var a = c.sw("A"), b = c.sw("B"), d = c.sw("C");
        c.lamp("Y", c.g("NAND", c.g("AND", c.g("NAND", a, b), c.g("NAND", b, d)), c.g("NAND", a, d))); }],
      ["Boole", function(c){ var a = c.sw("A"), b = c.sw("B"), d = c.sw("C");
        c.lamp("Y", c.g("OR", c.g("AND", a, b), c.g("AND", d, c.g("OR", a, b)))); }],
      ["Hopper", function(c){ var a = c.sw("A"), b = c.sw("B"), d = c.sw("C");
        c.lamp("Y", c.g("OR", c.g("OR", c.g("AND", a, b), c.g("AND", b, d)), c.g("AND", a, d))); }]
    ]},
  {id:"gray", name:"Binary to Gray code", level:"Medium", use:"gates", ins:["B2","B1","B0"], outs:["G2","G1","G0"],
    blurb:"Turn a 3-bit binary number into Gray code, where each step up changes only one bit.",
    f:function(v){ return [v[0], v[0] ^ v[1], v[1] ^ v[2]]; },
    bots:[
      ["Ada", function(c){ var b2 = c.sw("B2"), b1 = c.sw("B1"), b0 = c.sw("B0");
        c.lamp("G2", b2); c.lamp("G1", c.g("XOR", b2, b1)); c.lamp("G0", c.g("XOR", b1, b0)); }],
      ["Boole", function(c){ var b2 = c.sw("B2"), b1 = c.sw("B1"), b0 = c.sw("B0");
        c.lamp("G2", c.g("BUF", b2)); c.lamp("G1", c.g("XOR", b2, b1)); c.lamp("G0", c.g("XOR", b1, b0)); }],
      ["Hopper", function(c){
        var b2 = c.sw("B2"), b1 = c.sw("B1"), b0 = c.sw("B0");
        var x = function(p, q){ return c.g("AND", c.g("OR", p, q), c.g("NAND", p, q)); };
        c.lamp("G2", b2); c.lamp("G1", x(b2, b1)); c.lamp("G0", x(b1, b0)); }]
    ]},
  {id:"dec", name:"2-to-4 decoder", level:"Medium", use:"gates", ins:["A1","A0"], outs:["Y0","Y1","Y2","Y3"],
    blurb:"Light the one output that the two-bit number A1 A0 names. Y0 for 00, Y1 for 01, Y2 for 10, Y3 for 11.",
    f:function(v){ var i = v[0] * 2 + v[1]; return [+(i === 0), +(i === 1), +(i === 2), +(i === 3)]; },
    bots:[
      ["Ada", function(c){ var a1 = c.sw("A1"), a0 = c.sw("A0"), n1 = c.g("NOT", a1), n0 = c.g("NOT", a0);
        c.lamp("Y0", c.g("AND", n1, n0)); c.lamp("Y1", c.g("AND", n1, a0));
        c.lamp("Y2", c.g("AND", a1, n0)); c.lamp("Y3", c.g("AND", a1, a0)); }],
      ["Boole", function(c){ var a1 = c.sw("A1"), a0 = c.sw("A0"), n1 = c.g("NOT", a1), n0 = c.g("NOT", a0);
        c.lamp("Y0", c.g("NOR", a1, a0)); c.lamp("Y1", c.g("NOR", a1, n0));
        c.lamp("Y2", c.g("NOR", n1, a0)); c.lamp("Y3", c.g("AND", a1, a0)); }],
      ["Hopper", function(c){ var a1 = c.sw("A1"), a0 = c.sw("A0"), n1 = c.g("NOT", a1), n0 = c.g("NOT", a0);
        c.lamp("Y0", c.g("NOR", a1, a0)); c.lamp("Y1", c.g("NOR", a1, n0));
        c.lamp("Y2", c.g("NOR", n1, a0)); c.lamp("Y3", c.g("NOT", c.g("NAND", a1, a0))); }]
    ]},
  {id:"full", name:"Full adder", level:"Medium", use:"chips", ban:["FADD","ADD4","ALU"], ins:["A","B","Cin"], outs:["Sum","Cout"],
    blurb:"Add three bits: A, B and a carry coming in. Sum is the low bit of the answer, Cout the high one.",
    f:function(v){ var s = v[0] + v[1] + v[2]; return [s & 1, s >> 1]; },
    bots:[
      ["Ada", function(c){ var a = c.sw("A"), b = c.sw("B"), ci = c.sw("Cin"), x = c.g("XOR", a, b);
        c.lamp("Sum", c.g("XOR", x, ci)); c.lamp("Cout", c.g("MUX2", a, ci, x)); }],
      ["Boole", function(c){ var a = c.sw("A"), b = c.sw("B"), ci = c.sw("Cin"), x = c.g("XOR", a, b);
        c.lamp("Sum", c.g("XOR", x, ci));
        c.lamp("Cout", c.g("OR", c.g("AND", a, b), c.g("AND", x, ci))); }],
      ["Hopper", function(c){ var a = c.sw("A"), b = c.sw("B"), ci = c.sw("Cin"),
          h1 = c.g("HADD", a, b), h2 = c.g("HADD", h1.o(0), ci);
        c.lamp("Sum", h2.o(0)); c.lamp("Cout", c.g("OR", h1.o(1), h2.o(1))); }]
    ]},
  {id:"cmp", name:"2-bit comparator", level:"Hard", use:"chips", ban:["CMP4","ADD4","ALU"],
    ins:["A1","A0","B1","B0"], outs:["Gt","Eq","Lt"],
    blurb:"Compare the two-bit numbers A1 A0 and B1 B0. Gt is 1 when A is bigger, Eq when they match, Lt when A is smaller.",
    f:function(v){ var a = v[0] * 2 + v[1], b = v[2] * 2 + v[3]; return [+(a > b), +(a === b), +(a < b)]; },
    bots:[
      ["Ada", function(c){ var a1 = c.sw("A1"), a0 = c.sw("A0"), b1 = c.sw("B1"), b0 = c.sw("B0"),
          e1 = c.g("XNOR", a1, b1), eq = c.g("AND", e1, c.g("XNOR", a0, b0)),
          gt = c.g("OR", c.g("AND", a1, c.g("NOT", b1)), c.g("AND", e1, c.g("AND", a0, c.g("NOT", b0))));
        c.lamp("Gt", gt); c.lamp("Eq", eq); c.lamp("Lt", c.g("NOR", gt, eq)); }],
      ["Boole", function(c){ var a1 = c.sw("A1"), a0 = c.sw("A0"), b1 = c.sw("B1"), b0 = c.sw("B0"),
          e1 = c.g("XNOR", a1, b1),
          gt = c.g("OR", c.g("AND", a1, c.g("NOT", b1)), c.g("AND", e1, c.g("AND", a0, c.g("NOT", b0)))),
          lt = c.g("OR", c.g("AND", c.g("NOT", a1), b1), c.g("AND", e1, c.g("AND", c.g("NOT", a0), b0)));
        c.lamp("Gt", gt); c.lamp("Eq", c.g("NOR", gt, lt)); c.lamp("Lt", lt); }],
      ["Hopper", function(c){ var a1 = c.sw("A1"), a0 = c.sw("A0"), b1 = c.sw("B1"), b0 = c.sw("B0"),
          eq = c.g("NOR", c.g("XOR", a1, b1), c.g("XOR", a0, b0)),
          gt = c.g("OR", c.g("AND", a1, c.g("NOT", b1)),
            c.g("AND", c.g("XNOR", a1, b1), c.g("AND", a0, c.g("NOT", b0))));
        c.lamp("Gt", gt); c.lamp("Eq", eq); c.lamp("Lt", c.g("NOR", gt, eq)); }]
    ]},
  {id:"add2", name:"2-bit adder", level:"Hard", use:"chips", ban:["ADD4","ALU"],
    ins:["A1","A0","B1","B0"], outs:["S2","S1","S0"],
    blurb:"Add the two-bit numbers A1 A0 and B1 B0. The answer is three bits, S2 S1 S0.",
    f:function(v){ var s = (v[0] * 2 + v[1]) + (v[2] * 2 + v[3]); return [(s >> 2) & 1, (s >> 1) & 1, s & 1]; },
    bots:[
      ["Ada", function(c){ var a1 = c.sw("A1"), a0 = c.sw("A0"), b1 = c.sw("B1"), b0 = c.sw("B0"),
          h = c.g("HADD", a0, b0), f = c.g("FADD", a1, b1, h.o(1));
        c.lamp("S2", f.o(1)); c.lamp("S1", f.o(0)); c.lamp("S0", h.o(0)); }],
      ["Boole", function(c){ var a1 = c.sw("A1"), a0 = c.sw("A0"), b1 = c.sw("B1"), b0 = c.sw("B0"),
          k = c.g("AND", a0, b0), x = c.g("XOR", a1, b1);
        c.lamp("S2", c.g("OR", c.g("AND", a1, b1), c.g("AND", x, k)));
        c.lamp("S1", c.g("XOR", x, k)); c.lamp("S0", c.g("XOR", a0, b0)); }],
      ["Hopper", function(c){ var a1 = c.sw("A1"), a0 = c.sw("A0"), b1 = c.sw("B1"), b0 = c.sw("B0"),
          f0 = c.g("FADD", a0, b0), f1 = c.g("FADD", a1, b1, f0.o(1));
        c.lamp("S2", f1.o(1)); c.lamp("S1", f1.o(0)); c.lamp("S0", f0.o(0)); }]
    ]}
];
export function chalById(id){
  for (var i = 0; i < CHALLENGES.length; i++) if (CHALLENGES[i].id === id) return CHALLENGES[i];
  return null;
}
export function ruleText(ch){
  return ch.use === "chips"
    ? "Gates, electronic parts and the arithmetic and routing chips, except " +
      ch.ban.map(function(t){ return TYPES[t].n; }).join(", ") + "."
    : "Gates and electronic parts only — no chips.";
}

/* ---------- the standings ---------- */
export var ARENA_KEY = "logicbench.arena"; export var BOT_AT = Date.UTC(2026, 0, 1);
export function arenaRead(){
  try {
    var o = JSON.parse(localStorage.getItem(ARENA_KEY) || "{}");
    if (o && typeof o === "object" && o.entries && typeof o.entries === "object") return o;
  } catch (err) {}
  return {v:1, entries:{}};
}
export function arenaWrite(o){
  try { localStorage.setItem(ARENA_KEY, JSON.stringify(o)); return true; } catch (err) { return false; }
}
export var botCache = {}; export var judgeCache = {};
export function botsOf(ch){
  if (!botCache[ch.id]) botCache[ch.id] = ch.bots.map(function(b, i){
    var data = circuit(b[1]);
    return {id:"bot:" + b[0].toLowerCase(), name:b[0], bot:true, build:data, at:BOT_AT + i, rep:judge(data, ch)};
  });
  return botCache[ch.id];
}
/* what the benchmark build scores: 1000 points is a build that matches it */
export function parOf(ch){
  return botsOf(ch).reduce(function(m, b){ return b.rep.ok ? Math.min(m, b.rep.cost) : m; }, Infinity);
}
export function pointsOf(ch, rep){ return Math.round(1000 * parOf(ch) / rep.cost); }
/* An entry is run through the checker when it is read, not trusted from what was stored. */
export function judged(ch, id, e){
  var k = ch.id + "|" + id + "|" + e.at;
  if (!judgeCache[k]) judgeCache[k] = judge(e.build, ch);
  return judgeCache[k];
}
/* everyone who has entered a challenge, best first; a tie goes to whoever got there first */
export function standings(ch){
  var held = arenaRead().entries[ch.id] || {}, rows = botsOf(ch).slice();
  Object.keys(held).forEach(function(id){
    var e = held[id], rep = e && e.build ? judged(ch, id, e) : null;
    if (rep && rep.ok) rows.push({id:id, name:e.name, color:e.color, bot:false, build:e.build, at:e.at, rep:rep});
  });
  rows.sort(function(a, b){ return a.rep.cost - b.rep.cost || a.at - b.at; });
  rows.forEach(function(r, i){ r.rank = i + 1; r.pts = pointsOf(ch, r.rep); });
  return rows;
}
/* every player across every challenge, by the points of their best builds */
export function leaders(){
  var by = {}, out = [];
  CHALLENGES.forEach(function(ch){
    standings(ch).forEach(function(r){
      var p = by[r.id] || (by[r.id] = {id:r.id, name:r.name, color:r.color, bot:r.bot, pts:0, solved:0, golds:0});
      p.pts += r.pts; p.solved++; if (r.rank === 1) p.golds++;
    });
  });
  Object.keys(by).forEach(function(id){ out.push(by[id]); });
  out.sort(function(a, b){ return b.pts - a.pts || b.solved - a.solved; });
  out.forEach(function(p, i){ p.rank = i + 1; });
  return out;
}

/* Run a build against a challenge as the signed-in player. With save, a build that
   works is entered — unless the player already has a better one there. */
export function arenaTry(ch, data, save){
  var me = Auth.current(), rep = judge(data, ch), rows, others, res = {rep:rep}, o;
  if (!rep.ok) return res;
  rows = standings(ch);
  others = rows.filter(function(r){ return r.id !== me.id; });
  res.prev = rows.filter(function(r){ return r.id === me.id; })[0] || null;
  res.pts = pointsOf(ch, rep);
  res.beat = others.filter(function(r){ return r.rep.cost > rep.cost; });
  res.lost = others.filter(function(r){ return r.rep.cost <= rep.cost; });
  res.rank = res.lost.length + 1;
  res.of = others.length + 1;
  if (!save) return res;
  if (res.prev && res.prev.rep.cost <= rep.cost){ res.kept = true; return res; }
  o = arenaRead();
  (o.entries[ch.id] = o.entries[ch.id] || {})[me.id] = {name:me.name, color:me.color, at:Date.now(), build:data};
  res.saved = arenaWrite(o);
  return res;
}

/* ---------- sharing entries between devices ---------- */
export function exportEntries(){
  var me = Auth.current(), o = arenaRead(), list = [], a, blob;
  CHALLENGES.forEach(function(ch){
    var e = (o.entries[ch.id] || {})[me.id];
    if (e && e.build) list.push({c:ch.id, name:e.name, color:e.color, at:e.at, build:e.build});
  });
  if (!list.length){ flash("You have no Arena entries to share yet."); return; }
  blob = new Blob([JSON.stringify({app:"logic-bench-arena", v:1, entries:list})], {type:"application/json"});
  a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "logic-bench-arena-" + me.id.replace(/[^\w-]+/g, "_") + ".json";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function(){ URL.revokeObjectURL(a.href); }, 4000);
  flash("Saved " + list.length + " entr" + (list.length === 1 ? "y" : "ies") + " to share");
}
/* Every imported build is run through the checker; the score in the file is never read. */
export function importEntries(text){
  var f = null, o = arenaRead(), added = 0, failed = 0, had = 0;
  try { f = JSON.parse(text); } catch (err) {}
  if (!f || f.app !== "logic-bench-arena" || !Array.isArray(f.entries)){ flash("That isn't an Arena entries file."); return; }
  f.entries.forEach(function(e){
    var ch = e && chalById(e.c), name = e && String(e.name || "").trim(), id, rep, cur;
    if (!ch || !e.build || !/^[\w .-]{3,20}$/.test(name)){ failed++; return; }
    id = name.toLowerCase();
    rep = judge(e.build, ch);
    if (!rep.ok){ failed++; return; }
    cur = (o.entries[ch.id] || {})[id];
    if (cur && cur.build && judged(ch, id, cur).ok && judged(ch, id, cur).cost <= rep.cost){ had++; return; }
    (o.entries[ch.id] = o.entries[ch.id] || {})[id] = {name:name, color:(+e.color || 0) % 360, at:+e.at || Date.now(), build:e.build};
    added++;
  });
  arenaWrite(o);
  notify();
  flash(added + " entr" + (added === 1 ? "y" : "ies") + " added" + (failed ? " · " + failed + " didn't pass the checker" : "") +
    (had ? " · " + had + " already here" : ""));
}

/* ---------- opening and closing ---------- */
export function arenaShow(){
  keepBuild();
  S.arenaOpen = true;
  notify();
}
export function arenaClose(){ S.arenaOpen = false; notify(); }
/* the builds that can be sent in: the sheet, if it is a classical one with parts
   on it, then every saved classical build by name */
export function arenaBuilds(){
  var lib = libRead(), out = [];
  if (S.nodes.length && S.docKind !== "quantum") out.push({v:"\u0001sheet", t:"On the sheet now — " + (S.docName || "Untitled")});
  Object.keys(lib).sort().forEach(function(n){
    if (!(S.nodes.length && n === S.docName) && lib[n].kind !== "quantum") out.push({v:"n:" + n, t:n});
  });
  return out;
}
/* Run the build picked in that list. Gives {ch, build, save, r}, or null if nothing is picked. */
export function arenaRun(ch, v, save){
  var data = v === "\u0001sheet" ? snapshot() : (v.indexOf("n:") === 0 ? libRead()[v.slice(2)] : null);
  if (!data){ flash("Pick a build first."); return null; }
  return {ch:ch.id, build:v === "\u0001sheet" ? (S.docName || "Untitled") : v.slice(2), save:save, r:arenaTry(ch, data, save)};
}
