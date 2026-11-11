/* The bench's shared state: constants, part types, colours and part geometry. */
"use strict";

var $ = function(s){ return document.querySelector(s); };
var cv = $("#cv"), ctx = cv.getContext("2d"), ren = $("#ren");
var STUB = 9, GRID = 24, SNAP = 12, PORT = 12, PTR = 5, MONO = '500 10px "IBM Plex Mono", monospace';
/* each account keeps its own builds: js/auth.js gives the keys their owner's name */
function LIBKEY(){ return Auth.key("lib"); }
function CURKEY(){ return Auth.key("cur"); }
/* A new part or wire's id. In a shared project every device tags its ids with its
   own mark (IDTAG, set by js/collab.js), so two people can never mint the same one. */
var IDTAG = "";
function newId(p){
  var id, taken = function(x){ for (var i = 0; i < wires.length; i++) if (wires[i].id === x) return true; return false; };
  do { id = p + (seq++) + IDTAG; } while (byId.has(id) || (p === "w" && taken(id)));
  return id;
}

var TYPES = {
  /* A junction: both of its ports sit on the same dot, so wires meet it from
     any angle. One wire drives it, any number of wires carry the level onward —
     the way a 90° turn or a branch is made. x,y is the centre, not a corner. */
  POINT: {n:"Point",  ins:1, w:0,  h:0,  k:"pt"},
  SWITCH:{n:"Switch", ins:0, w:46, h:30, k:"sw", ctl:1,
    tip:"A toggle switch: click it to flip its output between 0 and 1"},
  BUTTON:{n:"Button", ins:0, w:30, h:30, k:"btn", ctl:1,
    tip:"A push button: its output is 1 only while it is held down"},
  LAMP:  {n:"Lamp",   ins:1, w:28, h:28, k:"lamp", outs:0,
    tip:"A lamp (an LED): lights while its input is 1"},
  AND:   {n:"AND",    ins:2, w:52, h:40, k:"and"},
  OR:    {n:"OR",     ins:2, w:52, h:40, k:"or"},
  NOT:   {n:"NOT",    ins:1, w:46, h:34, k:"not", inv:true},
  NAND:  {n:"NAND",   ins:2, w:58, h:40, k:"and", inv:true},
  NOR:   {n:"NOR",    ins:2, w:58, h:40, k:"or",  inv:true},
  XOR:   {n:"XOR",    ins:2, w:54, h:40, k:"xor"},
  XNOR:  {n:"XNOR",   ins:2, w:60, h:40, k:"xor", inv:true},
  BUF:   {n:"Buffer", ins:1, w:40, h:34, k:"not",
    tip:"A buffer: the same level out as in, driven afresh at full strength"},
  TRI:   {n:"Tri-state", ins:2, w:46, h:40, k:"tri", pyi:[14, 34], pyo:[14],
    tip:"Tri-state buffer: passes its input while EN (the lower pin) is 1 and lets go of the wire (floats) while EN is 0 — how many parts take turns on one bus"},

  /* ---- electronics: the components a circuit board is made of ----
     A signal here has a strength as well as a level (see sim.js): a transistor
     that is off lets go of its wire, and a resistor only pulls weakly, so a
     pull-up resistor and the transistor fighting it behave as they do on a board. */
  VCC:   {n:"Power",     ins:0, w:28, h:28, k:"vcc",
    tip:"Power rail (VCC): a constant, strong 1"},
  GND:   {n:"Ground",    ins:0, w:28, h:28, k:"gnd",
    tip:"Ground (0 V): a constant, strong 0"},
  RES:   {n:"Resistor",  ins:1, w:40, h:20, k:"res",
    tip:"Resistor: passes its input on weakly, so anything driven hard wins over it. Power through one is a pull-up, Ground through one a pull-down"},
  DIODE: {n:"Diode",     ins:1, w:36, h:20, k:"diode",
    tip:"Diode: current flows one way only — a 1 goes through, a 0 does not (the output floats)"},
  CAP:   {n:"Capacitor", ins:1, w:30, h:30, k:"cap", tm:1,
    tip:"Capacitor: charges while its input is driven 1, drains while it is driven 0, and holds its charge (slowly leaking away) while the input floats — a DRAM bit is one of these behind a transistor"},
  IND:   {n:"Inductor",  ins:1, w:44, h:20, k:"ind", tm:1,
    tip:"Inductor: resists change — its output follows the input only after a short delay"},
  NMOS:  {n:"NMOS",      ins:2, w:44, h:40, k:"fet", pyi:[12, 30], pyo:[12],
    tip:"N-channel MOSFET: while the gate (lower pin) is 1 it connects the upper pin through to the output; while the gate is 0 the output floats. With PMOS it makes CMOS logic"},
  PMOS:  {n:"PMOS",      ins:2, w:44, h:40, k:"fet", neg:1, pyi:[12, 30], pyo:[12],
    tip:"P-channel MOSFET: conducts while its gate (lower pin) is 0, floats while the gate is 1"},
  NPN:   {n:"NPN",       ins:2, w:44, h:40, k:"bjt", pyi:[12, 30], pyo:[12],
    tip:"NPN transistor: while the base (lower pin) is 1 the collector (upper pin) is switched through to the emitter (output)"},
  PNP:   {n:"PNP",       ins:2, w:44, h:40, k:"bjt", neg:1, pyi:[12, 30], pyo:[12],
    tip:"PNP transistor: switches through while its base (lower pin) is 0"},

  /* ---- inputs and readouts ---- */
  CLOCK: {n:"Clock",     ins:0, w:40, h:30, k:"clk", ctl:1, tm:1,
    tip:"Clock (the crystal oscillator): ticks 0, 1, 0, 1 by itself · click it to change its speed"},
  HEXIN: {n:"Hex input", k:"chip", ab:"HEX", w:48, ctl:1, pi:[], po:["1","2","4","8"],
    tip:"Hex input (a keypad or DIP switch): click it to count 0–F; the four outputs are its bits"},
  HEXD:  {n:"Hex display", k:"chip", ab:"HEX", w:54, outs:0, pi:["1","2","4","8"],
    tip:"Hex display: shows its four input bits as one digit, 0–F"},
  SEG7:  {n:"7-segment", k:"chip", ab:"7-SEG", w:68, outs:0, pi:["a","b","c","d","e","f","g","dp=0"],
    tip:"7-segment display: one input per segment — a at the top, round clockwise to f, and g across the middle"},

  /* ---- arithmetic: the inside of an ALU ---- */
  HADD:  {n:"Half adder", k:"chip", ab:"HA", pi:["A","B"], po:["S","C"],
    tip:"Half adder: A + B, as a sum bit S and a carry C"},
  FADD:  {n:"Full adder", k:"chip", ab:"FA", pi:["A","B","Cin=0"], po:["S","Cout"],
    tip:"Full adder: A + B + Cin — chain them carry to carry for a wider adder"},
  ADD4:  {n:"4-bit adder", k:"chip", ab:"ADD4", pi:["A0","A1","A2","A3","B0","B1","B2","B3","Cin=0"],
    po:["S0","S1","S2","S3","Cout"], tip:"4-bit adder: A + B + Cin"},
  CMP4:  {n:"Comparator", k:"chip", ab:"CMP", pi:["A0","A1","A2","A3","B0","B1","B2","B3"],
    po:["A<B","A=B","A>B"], tip:"4-bit magnitude comparator"},
  ALU:   {n:"ALU", k:"chip", ab:"ALU", mid:18, pi:["A0","A1","A2","A3","B0","B1","B2","B3","S0=0","S1=0","S2=0"],
    po:["F0","F1","F2","F3","Cout","Zero"],
    tip:"4-bit arithmetic logic unit, the heart of a CPU. S2 S1 S0 picks the operation: 0 ADD · 1 SUB · 2 AND · 3 OR · 4 XOR · 5 NOT A · 6 INC A · 7 SHL A"},

  /* ---- routing: steering data and decoding addresses ---- */
  MUX2:  {n:"MUX 2:1", k:"chip", ab:"MUX", pi:["D0","D1","S"], po:["Y"],
    tip:"Multiplexer: Y is D0 while S is 0, and D1 while S is 1"},
  MUX4:  {n:"MUX 4:1", k:"chip", ab:"MUX4", pi:["D0","D1","D2","D3","S0","S1"], po:["Y"],
    tip:"4-way multiplexer: S1 S0 picks which D comes out at Y"},
  DEMUX4:{n:"DEMUX 1:4", k:"chip", ab:"DMX4", pi:["D","S0","S1"], po:["Y0","Y1","Y2","Y3"],
    tip:"Demultiplexer: D goes out of the one Y that S1 S0 picks"},
  DEC24: {n:"Decoder 2:4", k:"chip", ab:"DEC", pi:["A0","A1","EN=1"], po:["Y0","Y1","Y2","Y3"],
    tip:"2-to-4 decoder: lights the one output A1 A0 names — the way an address picks out a memory chip. EN left open counts as on"},
  DEC38: {n:"Decoder 3:8", k:"chip", ab:"DEC8", pi:["A0","A1","A2","EN=1"], po:["Y0","Y1","Y2","Y3","Y4","Y5","Y6","Y7"],
    tip:"3-to-8 decoder: lights the one output A2 A1 A0 names. EN left open counts as on"},
  ENC42: {n:"Encoder 4:2", k:"chip", ab:"ENC", pi:["D0","D1","D2","D3"], po:["A0","A1","V"],
    tip:"Priority encoder: the number of the highest D that is 1, and V = 1 if any of them is"},

  /* ---- memory: latches, flip-flops, registers, counters, RAM and ROM ---- */
  SRL:   {n:"SR latch", k:"chip", ab:"SR", pi:["S","R"], po:["Q","~Q"],
    tip:"Set-reset latch: S sets Q to 1, R resets it to 0, and it remembers in between"},
  DL:    {n:"D latch", k:"chip", ab:"DL", pi:["D","EN"], po:["Q","~Q"],
    tip:"D latch: Q follows D while EN is 1, and holds while EN is 0"},
  DFF:   {n:"D flip-flop", k:"chip", ab:"DFF", ck:1, pi:["D","CLK","CLR=0"], po:["Q","~Q"],
    tip:"D flip-flop: takes D in on the rising edge of CLK and holds it — one bit of a register"},
  JKFF:  {n:"JK flip-flop", k:"chip", ab:"JK", ck:1, pi:["J","CLK","K","CLR=0"], po:["Q","~Q"],
    tip:"JK flip-flop: on each rising CLK edge J sets it, K resets it, and both together flip it"},
  TFF:   {n:"T flip-flop", k:"chip", ab:"TFF", ck:1, pi:["T=1","CLK","CLR=0"], po:["Q","~Q"],
    tip:"T flip-flop: flips on each rising CLK edge while T is 1 (open counts as 1) — chain them for a ripple counter"},
  REG4:  {n:"Register", k:"chip", ab:"REG4", ck:5, mid:12, pi:["D0","D1","D2","D3","LD=1","CLK","CLR=0"],
    po:["Q0","Q1","Q2","Q3"],
    tip:"4-bit register: loads D on the rising CLK edge while LD is 1 (open counts as 1), and holds it"},
  SHR4:  {n:"Shift register", k:"chip", ab:"SHR4", ck:1, mid:12, pi:["IN","CLK","CLR=0"], po:["Q0","Q1","Q2","Q3"],
    tip:"4-bit shift register: on each rising CLK edge every bit moves one place along and IN comes in at Q0"},
  CNT4:  {n:"Counter", k:"chip", ab:"CNT4", ck:6, mid:12,
    pi:["EN=1","LD=0","D0=0","D1=0","D2=0","D3=0","CLK","CLR=0"], po:["Q0","Q1","Q2","Q3","CO"],
    tip:"4-bit counter (a CPU's program counter): counts up on each rising CLK edge while EN is 1, loads D instead while LD is 1; CO is 1 at 15"},
  RAM:   {n:"RAM 16×4", k:"chip", ab:"RAM", ck:9, mid:46,
    pi:["A0","A1","A2","A3","D0=0","D1=0","D2=0","D3=0","WE=0","CLK"], po:["Q0","Q1","Q2","Q3"],
    tip:"RAM: sixteen 4-bit words. Q always reads the word at address A; on a rising CLK edge while WE is 1, D is written there · double-click to see or change what it holds"},
  ROM:   {n:"ROM 16×4", k:"chip", ab:"ROM", mid:46, pi:["A0","A1","A2","A3"], po:["D0","D1","D2","D3"],
    tip:"ROM: sixteen 4-bit words, read by address · double-click to program it"}
};
/* The families the parts console offers, a tab each. Electronics holds no
   fixed parts: u marks it as the shelf of areas you name and save yourself
   (see saveArea in edit.js). The other part types are still known to the
   bench, so a build that already uses one loads as it always did. */
var CATS_C = [
  {n:"Signals",     t:["SWITCH","BUTTON","CLOCK","HEXIN","LAMP","HEXD","SEG7"]},
  {n:"Gates",       t:["AND","OR","NOT","NAND","NOR","XOR","XNOR","BUF","TRI"]},
  {n:"Arithmetic",  t:["HADD","FADD","ADD4","CMP4","ALU"]},
  {n:"Electronics", t:[], u:1}
];
/* A build is classical or quantum, picked when it is started, and the console
   offers the parts of that kind only (the quantum ones are in quantum.js). */
var CATS = CATS_C, docKind = "classical", kindSet = false, railCat = 0;
var TIP_C = "Drag the bare sheet to move it — a circuit can run far past the window · click a port, then click another port to join them with a wire · Region (R) or Shift-drag boxes in an area to copy, Paste (P) drops it where you click · Cleaner (C) squares it all up";
var TIP_Q = "Quantum build · every wire carries one qubit from a port to a port, and an output feeds one input only (a qubit cannot be copied) · click a qubit to start it as |0⟩ or |1⟩ · end a line on a Meter to read it out";
function catKey(){ return "logicbench.cat" + (docKind === "quantum" ? ".q" : ""); }
function tipShow(){ $("#tip").textContent = $("#tip").title = testMode ? TIP_TEST : TIP_EDIT; }
function setKind(k){
  k = k === "quantum" ? "quantum" : "classical";
  if (kindSet && k === docKind) return;
  kindSet = true; docKind = k;
  CATS = k === "quantum" ? CATS_Q : CATS_C;
  TIP_EDIT = k === "quantum" ? TIP_Q : TIP_C;
  document.documentElement.setAttribute("data-kind", k);
  railCat = 0;
  try { railCat = parseInt(localStorage.getItem(catKey()) || "0", 10) || 0; } catch (err) {}
  clip = null; lastPaste = null;
  tipShow();
  buildRail();
  HOST.kind(k);
}
/* A chip is a box of named pins, PITCH apart, under a title row. Its size, and
   which inputs may be left open — a name ending "=0" or "=1" says what an open
   pin reads as — are worked out once, from the pin names. */
var PITCH = 16, TITLE = 14, PINCH = 5.6;
function defineChip(d){
  var li = 0, lo = 0, rows;
  d.pd = []; d.pn = [];
  d.pi.forEach(function(s, i){
    var m = /=([01])$/.exec(s);
    d.pd[i] = m ? +m[1] : undefined;
    d.pn[i] = s.replace(/=[01]$/, "");
    li = Math.max(li, d.pn[i].length + (d.pn[i] === "CLK" ? 1 : 0));
  });
  d.ins = d.pi.length;
  if (d.outs === undefined) d.outs = d.po.length;
  (d.po || []).forEach(function(s){ lo = Math.max(lo, s.replace("~", "").length); });
  rows = Math.max(d.ins, d.outs, 1);
  d.h = TITLE + rows * PITCH + 4;
  if (!d.w) d.w = Math.max(44, Math.ceil(d.ab.length * PINCH + 16),
                           Math.ceil(((li + lo) * PINCH + 16 + (d.mid || 10)) / 4) * 4);
  /* the middle of the clear lid between the two columns of pin names */
  d.cx = (4 + li * PINCH + d.w - 4 - lo * PINCH) / 2;
}
Object.keys(TYPES).forEach(function(t){ if (TYPES[t].k === "chip") defineChip(TYPES[t]); });

/* ---------- chips you made yourself ----------
   A saved area is a part like any other. Its switches and buttons are its
   inputs, its lamps are its outputs, each pin is named after the part it came
   from, and the pins run top to bottom as the parts stood in the area. The
   circuit inside is kept with the type, and js/sim.js runs it. A type is named
   after the area and a fingerprint of what is in it, so two areas with one name
   but different insides are two different parts, and a build that uses one
   carries its insides along (see snapshot in js/builds.js). */
function chipHash(s){
  var h = 5381, i;
  for (i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
/* the pins of a clip: which of its parts are inputs and which are outputs, in the
   order they stand, with a name for each that no other pin has */
function chipPins(clip){
  var ins = [], outs = [], i, n;
  for (i = 0; i < clip.nodes.length; i++){
    n = clip.nodes[i];
    if (n.t === "SWITCH" || n.t === "BUTTON") ins.push(i);
    else if (n.t === "LAMP") outs.push(i);
  }
  var order = function(a, b){
    return clip.nodes[a].y - clip.nodes[b].y || clip.nodes[a].x - clip.nodes[b].x || a - b;
  };
  ins.sort(order); outs.sort(order);
  var name = function(list, fallback){
    var seen = {}, out = [];
    list.forEach(function(ix, k){
      var base = String(clip.nodes[ix].l || "").replace(/[s=~]+/g, "").slice(0, 8) || fallback(k), nm = base, c = 2;
      while (seen[nm]) nm = base + (c++);
      seen[nm] = 1; out.push(nm);
    });
    return out;
  };
  return {ins:ins, outs:outs,
    pi:name(ins, function(k){ return k < 26 ? String.fromCharCode(65 + k) : "I" + k; }),
    po:name(outs, function(k){ return "Q" + (k + 1); })};
}
function chipKey(name, clip){
  return "U:" + name + "#" + chipHash(JSON.stringify([clip.nodes.map(function(n){ return [n.t, n.x, n.y, n.l, n.s]; }),
    clip.wires.map(function(w){ return [w.a, w.q, w.b, w.p]; })]));
}
/* Make the type for a saved area and return its key; a key made before is reused. */
function defineUserChip(name, clip){
  var key = chipKey(name, clip), p, d, li = 0, lo = 0, nameW;
  if (TYPES[key]) return key;
  p = chipPins(clip);
  p.pi.forEach(function(s){ li = Math.max(li, s.length); });
  p.po.forEach(function(s){ lo = Math.max(lo, s.length); });
  nameW = Math.ceil(name.length * 7.2 + 14);
  d = TYPES[key] = {n:name, k:"chip", user:1, ab:name, clip:clip, inIx:p.ins, outIx:p.outs,
    pi:p.pi.map(function(s){ return s + "=0"; }), po:p.po,
    tip:name + " — a chip you made: " + p.pi.length + " input" + (p.pi.length === 1 ? "" : "s") + ", " +
        p.po.length + " output" + (p.po.length === 1 ? "" : "s")};
  /* wide enough for the name on the lid as well as the pin names either side */
  d.w = Math.max(72, nameW + 16, Math.ceil(((li + lo) * PINCH + 26) / 4) * 4);
  defineChip(d);
  return key;
}

var nodes = [], wires = [], seq = 1, pan = {x:0,y:0};
var byId = new Map(), drag = null, wiring = null, panning = null, cascade = 0;
var wireMode = false, pend = null, cursor = {x:0,y:0}, wend = null;
/* The selection is a set of parts and a set of wires rather than one item, so a
   whole region of the sheet can be boxed in, dragged, copied and pasted as one
   piece. marq is the rubber band while it is being drawn. */
var pickN = new Set(), pickW = new Set(), marq = null, regionMode = false, hover = null;
var clip = null, lastPaste = null, undoStack = [], space = false, pasteMode = false;
var testMode = false, TIP_EDIT = TIP_C;
var TIP_TEST = "Test mode — click the switches and buttons to drive the circuit · the sheet is locked · T or the Test button to edit again";
var docName = "", docDirty = false;
var dpr = 1, queued = false, dotPat = null, C = {};
/* js/layout.js picks the layout before the page paints: "desktop" puts the rail
   down the left, "tablet" docks it along the bottom as a console */
var LAYOUT = document.documentElement.getAttribute("data-layout") === "tablet" ? "tablet" : "desktop";
/* the sheet's scale: the tablet layout draws everything half as big again by default */
var ZDEF = LAYOUT === "tablet" ? 1.5 : 1, ZMIN = 0.5, ZMAX = 4, zoom = ZDEF;

/* ---------- colors ---------- */
function readColors(){
  var s = getComputedStyle(document.documentElement), i;
  var keys = ["line","grid","wire","fg","muted","panel","body","hot","accent","sel","canvas"];
  for (i = 0; i < keys.length; i++) C[keys[i]] = s.getPropertyValue("--" + keys[i]).trim();
  dotPat = null;
  buildRail();
  if ($("#home") && !$("#home").hidden) renderHome();
}
function dots(){
  if (dotPat) return dotPat;
  var c = document.createElement("canvas"), g = c.getContext("2d");
  c.width = c.height = GRID;
  g.fillStyle = C.grid; g.beginPath(); g.arc(1, 1, 1.1, 0, 7); g.fill();
  dotPat = ctx.createPattern(c, "repeat");
  return dotPat;
}

/* ---------- geometry ---------- */
function nIn(n){ return TYPES[n.t].ins; }
function nOut(n){ var d = TYPES[n.t]; return d.outs === undefined ? 1 : d.outs; }
function isPt(n){ return TYPES[n.t].k === "pt"; }
/* How far down its part the i-th of count pins sits. A chip's pins are PITCH
   apart under the title, the shorter side centred against the longer; a symbol
   can pin its own (pyi, pyo); a gate spreads them evenly down its height. */
function pinY(n, i, count, fixed){
  var d = TYPES[n.t], rows;
  if (d.k === "chip"){
    rows = Math.max(d.ins, nOut(n), 1);
    return n.y + TITLE + (rows - count) * PITCH / 2 + PITCH * (i + 0.5);
  }
  if (fixed && fixed[i] !== undefined) return n.y + fixed[i];
  return n.y + d.h * (i + 1) / (count + 1);
}
function inPort(n, i){
  if (isPt(n)) return {x:n.x, y:n.y};
  var d = TYPES[n.t]; return {x:n.x - STUB, y:pinY(n, i, d.ins, d.pyi)};
}
/* q is which output, on a part with more than one; left out, the first */
function outPort(n, q){
  if (isPt(n)) return {x:n.x, y:n.y};
  var d = TYPES[n.t]; return {x:n.x + d.w + STUB, y:pinY(n, q | 0, nOut(n), d.pyo)};
}
function hasOut(n){ return nOut(n) > 0; }
/* the level on output q, and whether that output has let go of its wire */
function lvl(n, q){ return n.ov ? n.ov[q | 0] | 0 : n.v | 0; }
function floats(n, q){ return !!n.od && n.od[q | 0] === 0; }
function box(n){ var d = TYPES[n.t];
  if (isPt(n)) return {x:n.x - PTR - 4, y:n.y - PTR - 4, w:(PTR + 4) * 2, h:(PTR + 4) * 2};
  return {x:n.x - (d.ins ? STUB : 0) - 2, y:n.y - 2, w:d.w + 4 + (d.ins ? STUB : 0) + (hasOut(n) ? STUB : 0), h:d.h + 4}; }
