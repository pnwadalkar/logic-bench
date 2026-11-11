/* Headless checks for the quantum simulator and for the port-to-port wire rule.
   Usage: node tools/test-quantum.mjs
   Loads the bench's own modules with a stub DOM (tools/bench-harness.mjs),
   builds quantum circuits and compares what the meters read with what
   the textbook says they should. */
import fs from "node:fs";
import path from "node:path";
import { loadBench } from "./bench-harness.mjs";

const run = await loadBench();

run(`
var Q = {};
Q.reset = function(kind){ setKind(kind || "quantum"); S.nodes = []; S.wires = []; S.seq = 1; byId.clear(); };
Q.add = function(t, row, col){ return addNode(t, 72 + (col | 0) * 96, 96 + (row | 0) * QROW); };
Q.wire = function(a, q, b, p){ return connect({kind:"out", id:a.id, p:q}, {kind:"in", id:b.id, p:p}); };
Q.run = function(){ var open = qSolve(); var o = {}; S.QRES.rows.forEach(function(r){ o[r.b] = r.p; }); return {open:open, rows:o, res:S.QRES}; };
/* a line of one-qubit gates from a fresh qubit to a meter */
Q.line = function(row, start, gates){
  var q = Q.add("QUBIT", row, 0), last = q, i, g, m;
  q.s = start;
  for (i = 0; i < gates.length; i++){ g = Q.add(gates[i], row, i + 1); Q.wire(last, 0, g, 0); last = g; }
  m = Q.add("METER", row, gates.length + 1); Q.wire(last, 0, m, 0);
  return {q:q, m:m, last:last};
};
`);

let pass = 0, fail = 0;
const near = (a, b) => Math.abs((a || 0) - (b || 0)) < 1e-9;
function check(name, got, want) {
  const keys = new Set([...Object.keys(got), ...Object.keys(want)]);
  const ok = [...keys].every((k) => near(got[k], want[k]));
  if (ok) pass++; else { fail++; console.log("FAIL " + name + "\n  got  " + JSON.stringify(got) + "\n  want " + JSON.stringify(want)); }
}
function truthy(name, v) { if (v) pass++; else { fail++; console.log("FAIL " + name); } }
const Q = (code) => run(code);

/* one qubit */
Q(`Q.reset(); Q.line(0, 0, [])`);                    check("|0> reads 0", Q(`Q.run().rows`), { 0: 1 });
Q(`Q.reset(); Q.line(0, 1, [])`);                    check("|1> reads 1", Q(`Q.run().rows`), { 1: 1 });
Q(`Q.reset(); Q.line(0, 0, ["QX"])`);                check("X|0> = |1>", Q(`Q.run().rows`), { 1: 1 });
Q(`Q.reset(); Q.line(0, 0, ["QH"])`);                check("H|0> is half and half", Q(`Q.run().rows`), { 0: 0.5, 1: 0.5 });
Q(`Q.reset(); Q.line(0, 0, ["QH", "QH"])`);          check("HH = I", Q(`Q.run().rows`), { 0: 1 });
Q(`Q.reset(); Q.line(0, 0, ["QH", "QZ", "QH"])`);    check("HZH = X", Q(`Q.run().rows`), { 1: 1 });
Q(`Q.reset(); Q.line(0, 0, ["QH", "QS", "QS", "QH"])`); check("SS = Z", Q(`Q.run().rows`), { 1: 1 });
Q(`Q.reset(); Q.line(0, 0, ["QH", "QT", "QT", "QT", "QT", "QH"])`); check("TTTT = Z", Q(`Q.run().rows`), { 1: 1 });
Q(`Q.reset(); Q.line(0, 0, ["QY"])`);                check("Y|0> reads 1", Q(`Q.run().rows`), { 1: 1 });
Q(`Q.reset(); Q.line(0, 0, ["QH", "QY", "QH"])`);    check("HYH = -Y", Q(`Q.run().rows`), { 1: 1 });
Q(`Q.reset(); Q.line(0, 0, ["QH", "QT", "QH"])`);    check("HTH: cos²(π/8)", Q(`Q.run().rows`), { 0: Math.cos(Math.PI / 8) ** 2, 1: Math.sin(Math.PI / 8) ** 2 });

/* two qubits */
const two = (a, b, pre, gate) => Q(`Q.reset();
  var a = Q.add("QUBIT", 0, 0), b = Q.add("QUBIT", 1, 0), g = Q.add("${gate}", 0, 2), m0 = Q.add("METER", 0, 3), m1 = Q.add("METER", 1, 3), h;
  a.s = ${a}; b.s = ${b};
  if (${pre ? 1 : 0}){ h = Q.add("QH", 0, 1); Q.wire(a, 0, h, 0); Q.wire(h, 0, g, 0); } else Q.wire(a, 0, g, 0);
  Q.wire(b, 0, g, 1); Q.wire(g, 0, m0, 0); Q.wire(g, 1, m1, 0); Q.run().rows`);
check("CNOT 00", two(0, 0, 0, "QCX"), { "00": 1 });
check("CNOT 10", two(1, 0, 0, "QCX"), { "11": 1 });
check("CNOT 11", two(1, 1, 0, "QCX"), { "10": 1 });
check("CNOT 01", two(0, 1, 0, "QCX"), { "01": 1 });
check("Bell pair", two(0, 0, 1, "QCX"), { "00": 0.5, "11": 0.5 });
check("Bell pair from 01", two(0, 1, 1, "QCX"), { "01": 0.5, "10": 0.5 });
check("SWAP 10", two(1, 0, 0, "QSWAP"), { "01": 1 });
check("CZ leaves chances alone", two(1, 1, 0, "QCZ"), { "11": 1 });
/* H on the target either side of a CZ is a CNOT */
check("H·CZ·H = CNOT", Q(`Q.reset();
  var a = Q.add("QUBIT", 0, 0), b = Q.add("QUBIT", 1, 0), h1 = Q.add("QH", 1, 1), g = Q.add("QCZ", 0, 2), h2 = Q.add("QH", 1, 3),
      m0 = Q.add("METER", 0, 4), m1 = Q.add("METER", 1, 4);
  a.s = 1;
  Q.wire(a, 0, g, 0); Q.wire(b, 0, h1, 0); Q.wire(h1, 0, g, 1); Q.wire(g, 0, m0, 0); Q.wire(g, 1, h2, 0); Q.wire(h2, 0, m1, 0);
  Q.run().rows`), { "11": 1 });

/* three qubits */
const tof = (a, b, c) => Q(`Q.reset();
  var q = [Q.add("QUBIT", 0, 0), Q.add("QUBIT", 1, 0), Q.add("QUBIT", 2, 0)], g = Q.add("QCCX", 0, 1), i;
  q[0].s = ${a}; q[1].s = ${b}; q[2].s = ${c};
  for (i = 0; i < 3; i++){ Q.wire(q[i], 0, g, i); Q.wire(g, i, Q.add("METER", i, 2), 0); }
  Q.run().rows`);
for (let v = 0; v < 8; v++) {
  const a = v & 1, b = (v >> 1) & 1, c = (v >> 2) & 1;
  check("Toffoli " + a + b + c, tof(a, b, c), { ["" + a + b + (c ^ (a & b))]: 1 });
}
check("GHZ", Q(`Q.reset();
  var q = [Q.add("QUBIT", 0, 0), Q.add("QUBIT", 1, 0), Q.add("QUBIT", 2, 0)], h = Q.add("QH", 0, 1),
      c1 = Q.add("QCX", 0, 2), c2 = Q.add("QCX", 1, 3);
  Q.wire(q[0], 0, h, 0); Q.wire(h, 0, c1, 0); Q.wire(q[1], 0, c1, 1); Q.wire(c1, 1, c2, 0); Q.wire(q[2], 0, c2, 1);
  Q.wire(c1, 0, Q.add("METER", 0, 4), 0); Q.wire(c2, 0, Q.add("METER", 1, 4), 0); Q.wire(c2, 1, Q.add("METER", 2, 4), 0);
  Q.run().rows`), { "000": 0.5, "111": 0.5 });

/* measuring one half of a Bell pair alone: an even coin */
check("half a Bell pair", Q(`Q.reset();
  var a = Q.add("QUBIT", 0, 0), b = Q.add("QUBIT", 1, 0), h = Q.add("QH", 0, 1), g = Q.add("QCX", 0, 2);
  Q.wire(a, 0, h, 0); Q.wire(h, 0, g, 0); Q.wire(b, 0, g, 1); Q.wire(g, 1, Q.add("METER", 1, 3), 0);
  Q.run().rows`), { 0: 0.5, 1: 0.5 });

/* the rules of the sheet */
truthy("a gate with an input open does not run", Q(`Q.reset();
  var a = Q.add("QUBIT", 0, 0), g = Q.add("QCX", 0, 1), m = Q.add("METER", 0, 2);
  Q.wire(a, 0, g, 0); Q.wire(g, 0, m, 0);
  var r = Q.run(); r.open === 1 && g.qp === null && m.qi === null && r.res.rows.length === 0`));
truthy("a quantum output feeds one input only", Q(`Q.reset();
  var a = Q.add("QUBIT", 0, 0), m0 = Q.add("METER", 0, 1), m1 = Q.add("METER", 1, 1);
  Q.wire(a, 0, m0, 0); Q.wire(a, 0, m1, 0);
  S.wires.length === 1 && S.wires[0].b === m1.id`));
truthy("a classical output still fans out", Q(`Q.reset("classical");
  var s = addNode("SWITCH", 0, 0), l0 = addNode("LAMP", 100, 0), l1 = addNode("LAMP", 100, 60);
  Q.wire(s, 0, l0, 0); Q.wire(s, 0, l1, 0);
  S.wires.length === 2`));
truthy("more qubits than the simulator runs: a note, no crash", Q(`Q.reset();
  for (var i = 0; i < QMAX + 1; i++) Q.line(i, 0, []);
  var r = Q.run(); r.res.note.indexOf("qubits") > 0 && r.res.rows.length === 0`));
truthy("ten qubits run", Q(`Q.reset();
  for (var i = 0; i < QMAX; i++) Q.line(i, 0, ["QH"]);
  var r = Q.run(); r.res.rows.length === 16 && r.res.more === 1024 - 16 && Math.abs(r.res.rows[0].p - 1 / 1024) < 1e-12`));
truthy("a quantum build remembers its kind", Q(`Q.reset(); Q.line(0, 0, ["QH"]);
  var d = JSON.parse(JSON.stringify(snapshot())); Q.reset("classical");
  load(d) && S.docKind === "quantum" && S.nodes.length === 3`));
truthy("a classical build loads as classical", Q(`Q.reset("classical"); addNode("SWITCH", 0, 0);
  var d = JSON.parse(JSON.stringify(snapshot())); Q.reset("quantum");
  d.kind === undefined && load(d) && S.docKind === "classical"`));
truthy("a copy does not cross kinds", Q(`Q.reset(); var l = Q.line(0, 0, ["QH"]); selectAll(); S.clip = clipFrom();
  var c = S.clip; Q.reset("classical"); S.clip = c; pasteClip({x:0, y:0}); S.nodes.length === 0`));
truthy("the Bell example reads 00 and 11", Q(`exampleQ();
  var r = Q.run().rows; S.docKind === "quantum" && Math.abs(r["00"] - 0.5) < 1e-9 && Math.abs(r["11"] - 0.5) < 1e-9`));

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
