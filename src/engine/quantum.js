/* The quantum bench: qubits, gates and meters, and the state-vector simulator
   that runs them. A quantum build uses these parts only (see setKind in core.js). */
"use strict";

/* ---------- parts ----------
   A wire here carries one qubit. Rows of a quantum circuit sit QROW apart, and
   every part's pins fall on those rows, so lines drawn level stay level. */
var QROW = 48, QMAX = 10;            /* QMAX qubits is 1,024 amplitudes: instant on a tablet */
function qGate(name, ab, tip){ return {n:name, ab:ab, ins:1, w:30, h:28, k:"qg", qm:1, tip:tip}; }
function qMulti(name, roles, tip){
  var py = [], i;
  for (i = 0; i < roles.length; i++) py.push(14 + i * QROW);
  return {n:name, ins:roles.length, outs:roles.length, w:34, h:28 + (roles.length - 1) * QROW,
    k:"qmulti", qm:1, roles:roles, pyi:py, pyo:py, tip:tip};
}
TYPES.QUBIT = {n:"Qubit", ins:0, w:40, h:28, k:"qsrc", ctl:1, qm:1,
  tip:"A qubit. It starts as |0⟩ — click it to start it as |1⟩ instead"};
TYPES.METER = {n:"Meter", ins:1, outs:0, w:34, h:28, k:"qmeter", qm:1,
  tip:"Meter: measures the qubit that ends on it. The needle and the number are the chance of reading 1; the panel lists what all the meters read together"};
TYPES.QH = qGate("Hadamard", "H", "Hadamard: turns |0⟩ into an even mix of 0 and 1 — the gate that makes a superposition");
TYPES.QX = qGate("Pauli-X", "X", "Pauli-X, the quantum NOT: swaps |0⟩ and |1⟩");
TYPES.QY = qGate("Pauli-Y", "Y", "Pauli-Y: flips the qubit like X and turns its phase as well");
TYPES.QZ = qGate("Pauli-Z", "Z", "Pauli-Z: flips the sign of |1⟩ and leaves |0⟩ alone — invisible to a meter until another gate turns phase into chance");
TYPES.QS = qGate("S gate", "S", "S (phase) gate: a quarter turn of phase on |1⟩ — two of them make a Z");
TYPES.QT = qGate("T gate", "T", "T gate: an eighth turn of phase on |1⟩ — two of them make an S");
TYPES.QCX = qMulti("CNOT", "ct", "CNOT: flips the lower qubit (⊕) when the upper one (●) is 1. After a Hadamard on the control it entangles the two");
TYPES.QCZ = qMulti("CZ", "cc", "Controlled-Z: flips the sign of the state where both qubits are 1");
TYPES.QSWAP = qMulti("SWAP", "xx", "SWAP: the two qubits change places");
TYPES.QCCX = qMulti("Toffoli", "cct", "Toffoli (CCNOT): flips the bottom qubit when both of the upper two are 1 — the quantum AND");
var CATS_Q = [
  {n:"Qubits",      t:["QUBIT","METER"]},
  {n:"Gates",       t:["QH","QX","QY","QZ","QS","QT"]},
  {n:"Multi-qubit", t:["QCX","QCZ","QSWAP","QCCX"]}
];

/* ---------- the state vector ----------
   n qubits are 2^n complex amplitudes, real parts in re and imaginary in im.
   A one-qubit gate is a 2×2 complex matrix, written row by row as
   [m00.re, m00.im, m01.re, m01.im, m10.re, m10.im, m11.re, m11.im]. */
var QS2 = Math.SQRT1_2;
var QMAT = {
  H:[QS2,0, QS2,0, QS2,0, -QS2,0],
  X:[0,0, 1,0, 1,0, 0,0],
  Y:[0,0, 0,-1, 0,1, 0,0],
  Z:[1,0, 0,0, 0,0, -1,0],
  S:[1,0, 0,0, 0,0, 0,1],
  T:[1,0, 0,0, 0,0, QS2,QS2]
};
/* what each part does: a matrix m on its last pin, with the pins before it as controls */
var QOPS = {
  QH:{m:QMAT.H}, QX:{m:QMAT.X}, QY:{m:QMAT.Y}, QZ:{m:QMAT.Z}, QS:{m:QMAT.S}, QT:{m:QMAT.T},
  QCX:{m:QMAT.X}, QCZ:{m:QMAT.Z}, QCCX:{m:QMAT.X}, QSWAP:{swap:1}
};
/* m on qubit q, wherever every bit of the mask ctl is 1 */
function qApply(st, q, m, ctl){
  var re = st.re, im = st.im, N = re.length, bit = 1 << q, i, j, ar, ai, br, bi;
  for (i = 0; i < N; i++){
    if ((i & bit) || (i & ctl) !== ctl) continue;
    j = i | bit;
    ar = re[i]; ai = im[i]; br = re[j]; bi = im[j];
    re[i] = m[0] * ar - m[1] * ai + m[2] * br - m[3] * bi;
    im[i] = m[0] * ai + m[1] * ar + m[2] * bi + m[3] * br;
    re[j] = m[4] * ar - m[5] * ai + m[6] * br - m[7] * bi;
    im[j] = m[4] * ai + m[5] * ar + m[6] * bi + m[7] * br;
  }
}
function qSwap(st, a, b){
  var re = st.re, im = st.im, N = re.length, ba = 1 << a, bb = 1 << b, i, j, t;
  for (i = 0; i < N; i++){
    if (!(i & ba) || (i & bb)) continue;
    j = i ^ ba ^ bb;
    t = re[i]; re[i] = re[j]; re[j] = t;
    t = im[i]; im[i] = im[j]; im[j] = t;
  }
}
/* the chance of reading 1 off qubit q */
function qP1(st, q){
  var re = st.re, im = st.im, N = re.length, bit = 1 << q, i, p = 0;
  for (i = 0; i < N; i++) if (i & bit) p += re[i] * re[i] + im[i] * im[i];
  return Math.min(1, Math.max(0, p));
}
function qRun(st, t, qs){
  var op = QOPS[t], ctl = 0, i;
  if (!op) return;
  if (op.swap){ qSwap(st, qs[0], qs[1]); return; }
  for (i = 0; i < qs.length - 1; i++) ctl |= 1 << qs[i];
  qApply(st, qs[qs.length - 1], op.m, ctl);
}

/* ---------- running the sheet ----------
   Each Qubit part is one qubit, and a wire hands it on from an output to an
   input. A gate runs once every one of its inputs has a qubit arriving, so the
   gates run in the order the wires put them in. A gate with an input left open,
   or caught in a loop, does not run, and nothing leaves it.
   Every part gets qi and qp: the chance of 1 on each input and each output at
   that point in the circuit, or null where no qubit reaches. QRES is the summary
   the panel shows: what the meters read together, and how likely. */
var QRES = {n:0, meters:[], rows:[], more:0, note:""};
function qSolve(){
  var qubits = [], gates = [], meters = [], src = new Map(), line = new Map(), used = new Set();
  var i, j, n, w, st, open = 0, progress, left, s, qs, ok, key, N;
  var byRow = function(a, b){ return a.y - b.y || a.x - b.x || (a.id < b.id ? -1 : 1); };
  for (i = 0; i < nodes.length; i++){
    n = nodes[i]; n.qi = null; n.qp = null; n.v = 0; n.iv = [];
    if (n.t === "QUBIT") qubits.push(n);
    else if (n.t === "METER") meters.push(n);
    else if (QOPS[n.t]) gates.push(n);
  }
  for (i = 0; i < wires.length; i++){
    w = wires[i];
    if (w.a && w.b) src.set(w.b + ":" + (w.p | 0), w.a + ":" + (w.q | 0));
  }
  for (i = 0; i < nodes.length; i++)
    for (j = 0; j < nIn(nodes[i]); j++) if (!src.has(nodes[i].id + ":" + j)) open++;
  qubits.sort(byRow); meters.sort(byRow);
  QRES = {n:qubits.length, meters:[], rows:[], more:0, note:""};
  if (qubits.length > QMAX){
    QRES.note = "This sheet has " + qubits.length + " qubits — the simulator runs up to " + QMAX + ". Take some off to see it run.";
    return open;
  }
  N = 1 << qubits.length;
  st = {re:new Float64Array(N), im:new Float64Array(N)};
  s = 0;
  for (i = 0; i < qubits.length; i++){
    n = qubits[i];
    if (n.s) s |= 1 << i;
    n.qp = [n.s ? 1 : 0];
    line.set(n.id + ":0", i);
  }
  st.re[s] = 1;
  /* which qubits arrive at a part's inputs — null unless every input has one,
     each a different qubit that nothing else has already taken */
  var arriving = function(n){
    var out = [], seen = {}, k, from, q;
    for (k = 0; k < nIn(n); k++){
      from = src.get(n.id + ":" + k);
      if (from === undefined || !line.has(from) || used.has(from)) return null;
      q = line.get(from);
      if (seen[q]) return null;
      seen[q] = 1; out.push(q);
    }
    return out;
  };
  var take = function(n){ for (var k = 0; k < nIn(n); k++) used.add(src.get(n.id + ":" + k)); };
  left = gates;
  do {
    progress = false; gates = left; left = [];
    for (i = 0; i < gates.length; i++){
      n = gates[i]; qs = arriving(n);
      if (!qs){ left.push(n); continue; }
      take(n);
      n.qi = qs.map(function(q){ return qP1(st, q); });
      qRun(st, n.t, qs);
      n.qp = qs.map(function(q){ return qP1(st, q); });
      for (j = 0; j < qs.length; j++) line.set(n.id + ":" + j, qs[j]);
      n.iv = n.qi.map(function(p){ return p >= 0.5 ? 1 : 0; });
      progress = true;
    }
  } while (progress && left.length);
  /* the meters, top to bottom: what they read together */
  var read = [];
  for (i = 0; i < meters.length; i++){
    n = meters[i]; qs = arriving(n);
    if (!qs) continue;
    take(n);
    n.qi = [qP1(st, qs[0])];
    n.v = n.qi[0] >= 0.5 ? 1 : 0;
    read.push(qs[0]);
    QRES.meters.push(n.l || "m" + i);
  }
  if (!qubits.length) QRES.note = "Drag a Qubit onto the sheet to begin.";
  else if (!meters.length) QRES.note = "Put a Meter on the end of a qubit's line to read it out.";
  else if (!read.length) QRES.note = "No qubit reaches a meter yet — wire one through, from a port to a port.";
  if (read.length){
    var tally = new Map(), p, rows = [];
    for (i = 0; i < N; i++){
      p = st.re[i] * st.re[i] + st.im[i] * st.im[i];
      if (p < 1e-12) continue;
      key = "";
      for (j = 0; j < read.length; j++) key += (i >> read[j]) & 1;
      tally.set(key, (tally.get(key) || 0) + p);
    }
    tally.forEach(function(v, k){ if (v > 5e-5) rows.push({b:k, p:v}); });
    rows.sort(function(a, b){ return b.p - a.p || (a.b < b.b ? -1 : 1); });
    QRES.more = Math.max(0, rows.length - 16);
    QRES.rows = rows.slice(0, 16);
  }
  return open;
}

/* ---------- drawing ----------
   A line is drawn in the wire colour with the lit colour laid over it as strongly
   as the qubit is likely to read 1: grey is 0, lit is 1, and a superposition sits
   in between. A line no qubit reaches is drawn broken. */
function qStroke(c, p, path){
  if (p === null || p === undefined){
    c.strokeStyle = C.wire; c.setLineDash([4, 4]); path(); c.stroke(); c.setLineDash([]);
    return;
  }
  c.strokeStyle = C.wire; path(); c.stroke();
  if (p > 0.004){
    var a = c.globalAlpha;
    c.globalAlpha = a * p; c.strokeStyle = C.hot; path(); c.stroke();
    c.globalAlpha = a;
  }
}
function qLine(c, x1, y1, x2, y2, p){
  qStroke(c, p, function(){ c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); });
}
/* The chance on a part's pin. A part that is only a picture — a tile in the
   console, with no id — is drawn as if a 0 were running through it. */
function qIn(n, i){ return n.id === undefined ? 0 : (n.qi ? n.qi[i] : null); }
function qOut(n, i){ return n.id === undefined ? 0 : (n.qp ? n.qp[i] : null); }
function qWire(c, a, w, p1, p2){
  c.lineWidth = 2; c.lineCap = "round";
  qLine(c, p1.x, p1.y, p2.x, p2.y, a && a.qp ? a.qp[w.q | 0] : null);
}
function qText(c, s, x, y, size, color){
  c.font = "600 " + size + 'px "IBM Plex Mono", ui-monospace, monospace';
  c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = color;
  c.fillText(s, x, y);
}
/* the marks a many-qubit gate puts on its rows: ● a control, ⊕ the NOT, × a swap */
function qMark(c, role, x, y, r){
  c.strokeStyle = C.line; c.lineWidth = 1.6;
  if (role === "c"){
    c.beginPath(); c.arc(x, y, r * 0.5, 0, 7); c.fillStyle = C.line; c.fill();
  } else if (role === "t"){
    c.beginPath(); c.arc(x, y, r, 0, 7); c.fillStyle = C.body; c.fill(); c.stroke();
    c.beginPath(); c.moveTo(x - r, y); c.lineTo(x + r, y); c.moveTo(x, y - r); c.lineTo(x, y + r); c.stroke();
  } else {
    r *= 0.62;
    c.beginPath(); c.moveTo(x - r, y - r); c.lineTo(x + r, y + r); c.moveTo(x + r, y - r); c.lineTo(x - r, y + r); c.stroke();
  }
}
DRAW.qsrc = function(c, n, stub){
  var d = TYPES[n.t], x = n.x, y = n.y, m = y + d.h / 2, on = n.s ? 1 : 0;
  c.lineWidth = 1.6; c.lineCap = "round";
  qLine(c, x + d.w, m, x + d.w + stub, m, on);
  roundRect(c, x, y, d.w, d.h, 7);
  c.fillStyle = C.body; c.fill();
  c.strokeStyle = on ? C.hot : C.accent; c.stroke();
  qText(c, on ? "|1⟩" : "|0⟩", x + d.w / 2, m + 0.5, 12, on ? C.hot : C.fg);
};
DRAW.qg = function(c, n, stub){
  var d = TYPES[n.t], x = n.x, y = n.y, m = y + d.h / 2;
  c.lineWidth = 1.6; c.lineCap = "round";
  qLine(c, x - stub, m, x, m, qIn(n, 0));
  qLine(c, x + d.w, m, x + d.w + stub, m, qOut(n, 0));
  roundRect(c, x, y, d.w, d.h, 4);
  c.fillStyle = C.body; c.fill(); c.strokeStyle = C.accent; c.stroke();
  qText(c, d.ab, x + d.w / 2, m + 0.5, 13, C.fg);
};
DRAW.qmulti = function(c, n, stub){
  var d = TYPES[n.t], x = n.x, y = n.y, cx = x + d.w / 2, i, py, a;
  /* a faint plate behind the marks, so the gate reads as one part to take hold of */
  a = c.globalAlpha;
  roundRect(c, x, y, d.w, d.h, 6);
  c.globalAlpha = a * 0.6; c.fillStyle = C.body; c.fill(); c.globalAlpha = a;
  c.strokeStyle = C.grid; c.lineWidth = 1; c.stroke();
  c.lineWidth = 1.6; c.lineCap = "round";
  for (i = 0; i < d.ins; i++){
    py = y + d.pyi[i];
    qLine(c, x - stub, py, cx, py, qIn(n, i));
    qLine(c, cx, py, x + d.w + stub, py, qOut(n, i));
  }
  c.strokeStyle = C.line; c.lineWidth = 1.6;
  c.beginPath(); c.moveTo(cx, y + d.pyi[0]); c.lineTo(cx, y + d.pyi[d.ins - 1]); c.stroke();
  for (i = 0; i < d.ins; i++) qMark(c, d.roles.charAt(i), cx, y + d.pyi[i], 8);
};
DRAW.qmeter = function(c, n, stub){
  var d = TYPES[n.t], x = n.x, y = n.y, m = y + d.h / 2, p = qIn(n, 0), cx = x + d.w / 2, cy = y + d.h - 7, ang;
  c.lineWidth = 1.6; c.lineCap = "round";
  qLine(c, x - stub, m, x, m, p);
  roundRect(c, x, y, d.w, d.h, 4);
  c.fillStyle = C.body; c.fill(); c.strokeStyle = C.line; c.stroke();
  c.strokeStyle = C.muted; c.lineWidth = 1.3;
  c.beginPath(); c.arc(cx, cy, 11, Math.PI, Math.PI * 2); c.stroke();
  /* the needle: hard left is a certain 0, hard right a certain 1 */
  ang = Math.PI * (1 + (p === null || p === undefined ? 0 : p) * 0.92 + 0.04);
  c.strokeStyle = p ? C.hot : C.line; c.lineWidth = 1.6;
  c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(ang) * 12, cy + Math.sin(ang) * 12); c.stroke();
  if (n.id !== undefined && n.id !== "g" && p !== null && p !== undefined){
    c.font = MONO; c.textAlign = "left"; c.textBaseline = "middle";
    c.fillStyle = p > 0.004 ? C.hot : C.muted;
    c.fillText(qPct(p), x + d.w + 6, m);
  }
};
function qPct(p){
  var v = p * 100;
  return (Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1)) + "%";
}
/* a many-qubit gate is too tall to shrink onto a console tile, so its tile is the marks alone */
function qMultiIcon(g, d){
  var k = d.roles.length, gap = k > 2 ? 10 : 15, y0 = 17 - gap * (k - 1) / 2, i;
  g.lineWidth = 1.4; g.lineCap = "round"; g.strokeStyle = C.wire;
  for (i = 0; i < k; i++){ g.beginPath(); g.moveTo(9, y0 + i * gap); g.lineTo(41, y0 + i * gap); g.stroke(); }
  g.strokeStyle = C.line;
  g.beginPath(); g.moveTo(25, y0); g.lineTo(25, y0 + gap * (k - 1)); g.stroke();
  for (i = 0; i < k; i++) qMark(g, d.roles.charAt(i), 25, y0 + i * gap, k > 2 ? 4.4 : 5.4);
}

/* ---------- seed ---------- */
/* A Bell pair: a Hadamard puts one qubit in superposition, a CNOT ties the other
   to it, and the two meters only ever agree — 00 half the time, 11 the other half. */
function exampleQ(){
  leaveShared(); setKind("quantum");
  nodes = []; wires = []; seq = 1; pan = {x:0, y:0}; zoom = ZDEF; zoomShow(); clearPick(); pend = null; cascade = 0;
  var a = addNode("QUBIT", 72, 96), b = addNode("QUBIT", 72, 96 + QROW);
  var h = addNode("QH", 168, 96), cx = addNode("QCX", 252, 96);
  var m0 = addNode("METER", 348, 96), m1 = addNode("METER", 348, 96 + QROW);
  wires = [
    {id:"w1", a:a.id, q:0, b:h.id, p:0}, {id:"w2", a:h.id, q:0, b:cx.id, p:0},
    {id:"w3", a:b.id, q:0, b:cx.id, p:1},
    {id:"w4", a:cx.id, q:0, b:m0.id, p:0}, {id:"w5", a:cx.id, q:1, b:m1.id, p:0}
  ];
  seq = 20; docName = freeName("Bell pair"); docDirty = true;
  commit();
}
