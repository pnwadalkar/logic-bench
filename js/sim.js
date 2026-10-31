/* The logic itself, settled level by level, and the picked set of parts and wires. */
"use strict";

/* ---------- logic ---------- */
function logic(t, a){
  var x = a[0] | 0, y = a[1] | 0;
  switch (t){
    case "AND":  return x & y;
    case "OR":   return x | y;
    case "NOT":  return x ? 0 : 1;
    case "NAND": return (x & y) ? 0 : 1;
    case "NOR":  return (x | y) ? 0 : 1;
    case "XOR":  return x ^ y;
    case "XNOR": return (x ^ y) ? 0 : 1;
    case "BUF":  return x;
  }
  return 0;
}
function reindex(){ byId.clear(); for (var i = 0; i < nodes.length; i++) byId.set(nodes[i].id, nodes[i]); }

/* ---------- drive ---------- */
/* What an output puts on its wire is a drive, not just a level:
     0  nothing — it has let go of the wire (an off transistor, a disabled tri-state)
     1  a weak 0    2  a weak 1          (through a resistor)
     3  a strong 0  4  a strong 1        (a gate, a switch, the power rails)
   Several drivers on one input settle on the strongest, and on a 1 between equals,
   which is simply the largest number. So a gate pulling low beats a pull-up
   resistor, and wires joined at a point still read high if any of them is high,
   the way they always have. A floating input reads as 0. */
function hi(d){ return d === 2 || d === 4 ? 1 : 0; }
function drv(v){ return v ? 4 : 3; }
function resolve(list){
  var k, best = 0, n, d;
  if (!list) return 0;
  for (k = 0; k < list.length; k++){
    n = byId.get(list[k][0]);
    d = n && n.od ? n.od[list[k][1]] | 0 : 0;
    if (d > best) best = d;
  }
  return best;
}
/* a word read off consecutive pins, lowest bit first, and back out again */
function bits(a, from, k){ var v = 0, i; for (i = 0; i < k; i++) if (a[from + i]) v |= 1 << i; return v; }
function outBits(v, k){ var o = [], i; for (i = 0; i < k; i++) o.push(drv((v >> i) & 1)); return o; }
function words(n){
  if (!Array.isArray(n.m) || n.m.length !== 16) n.m = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
  return n.m;
}
/* n.m is a part's memory: a bit, a word, a charge, or sixteen words. */
function bit(n){ return n.m ? 1 : 0; }
function qq(n){ return [drv(bit(n)), drv(!bit(n))]; }
var ALUOPS = ["ADD","SUB","AND","OR","XOR","NOT","INC","SHL"];
function aluRun(x, y, op){
  switch (op){
    case 0: return x + y;
    case 1: return x + ((~y) & 15) + 1;      /* Cout 1 means no borrow */
    case 2: return x & y;
    case 3: return x | y;
    case 4: return x ^ y;
    case 5: return (~x) & 15;
    case 6: return x + 1;
    case 7: return x << 1;
  }
  return 0;
}
/* Every part past the seven gates: its outputs, as drives, from its input levels
   a (open pins already read as their default) and the raw drives d. A part with
   memory reads it here and changes it only when it is level-triggered; an edge
   is taken in EDGE below, once the whole sheet has settled. */
var RULE = {
  VCC:   function(){ return [4]; },
  GND:   function(){ return [3]; },
  RES:   function(n, a, d){ return [d[0] === 0 ? 0 : hi(d[0]) ? 2 : 1]; },
  DIODE: function(n, a, d){ return [hi(d[0]) ? d[0] : 0]; },
  CAP:   function(n){ return [drv(n.m >= 0.5)]; },
  IND:   function(n){ return [drv(n.m >= 0.5)]; },
  NMOS:  function(n, a, d){ return [a[1] ? d[0] : 0]; },
  PMOS:  function(n, a, d){ return [a[1] ? 0 : d[0]]; },
  NPN:   function(n, a, d){ return [a[1] ? d[0] : 0]; },
  PNP:   function(n, a, d){ return [a[1] ? 0 : d[0]]; },
  TRI:   function(n, a){ return [a[1] ? drv(a[0]) : 0]; },
  CLOCK: function(n){ return [drv(n.s)]; },
  HEXIN: function(n){ return outBits(n.s & 15, 4); },
  HADD:  function(n, a){ return [drv(a[0] ^ a[1]), drv(a[0] & a[1])]; },
  FADD:  function(n, a){ var s = a[0] + a[1] + a[2]; return [drv(s & 1), drv(s >> 1)]; },
  ADD4:  function(n, a){ return outBits(bits(a, 0, 4) + bits(a, 4, 4) + a[8], 5); },
  CMP4:  function(n, a){ var x = bits(a, 0, 4), y = bits(a, 4, 4); return [drv(x < y), drv(x === y), drv(x > y)]; },
  ALU:   function(n, a){
    var r = aluRun(bits(a, 0, 4), bits(a, 4, 4), bits(a, 8, 3));
    return outBits(r & 15, 4).concat([drv((r >> 4) & 1), drv(!(r & 15))]);
  },
  MUX2:  function(n, a){ return [drv(a[2] ? a[1] : a[0])]; },
  MUX4:  function(n, a){ return [drv(a[bits(a, 4, 2)])]; },
  DEMUX4:function(n, a){ return outBits(a[0] ? 1 << bits(a, 1, 2) : 0, 4); },
  DEC24: function(n, a){ return outBits(a[2] ? 1 << bits(a, 0, 2) : 0, 4); },
  DEC38: function(n, a){ return outBits(a[3] ? 1 << bits(a, 0, 3) : 0, 8); },
  ENC42: function(n, a){
    for (var i = 3; i >= 0; i--) if (a[i]) return [drv(i & 1), drv(i >> 1), 4];
    return [3, 3, 3];
  },
  SRL:   function(n, a){
    if (a[0] && a[1]) return [3, 3];          /* both at once: not a state, both outputs low */
    if (a[0]) n.m = 1; else if (a[1]) n.m = 0;
    return qq(n);
  },
  DL:    function(n, a){ if (a[1]) n.m = a[0]; return qq(n); },
  DFF:   function(n, a){ if (a[2]) n.m = 0; return qq(n); },
  JKFF:  function(n, a){ if (a[3]) n.m = 0; return qq(n); },
  TFF:   function(n, a){ if (a[2]) n.m = 0; return qq(n); },
  REG4:  function(n, a){ if (a[6]) n.m = 0; return outBits(n.m | 0, 4); },
  SHR4:  function(n, a){ if (a[2]) n.m = 0; return outBits(n.m | 0, 4); },
  CNT4:  function(n, a){
    if (a[7]) n.m = 0;
    return outBits(n.m | 0, 4).concat([drv((n.m | 0) === 15 && a[0])]);
  },
  RAM:   function(n, a){ return outBits(words(n)[bits(a, 0, 4)], 4); },
  ROM:   function(n, a){ return outBits(words(n)[bits(a, 0, 4)], 4); }
};
/* What an edge-triggered part holds after a rising edge on its clock pin, from
   the levels its inputs had settled at just before it. */
var EDGE = {
  DFF:  function(n, a){ return a[2] ? 0 : a[0]; },
  JKFF: function(n, a){
    if (a[3]) return 0;
    if (a[0] && a[2]) return bit(n) ? 0 : 1;
    return a[0] ? 1 : a[2] ? 0 : bit(n);
  },
  TFF:  function(n, a){ return a[2] ? 0 : a[0] ? 1 - bit(n) : bit(n); },
  REG4: function(n, a){ return a[6] ? 0 : a[4] ? bits(a, 0, 4) : n.m | 0; },
  SHR4: function(n, a){ return a[2] ? 0 : (((n.m | 0) << 1) | a[0]) & 15; },
  CNT4: function(n, a){
    if (a[7]) return 0;
    if (a[1]) return bits(a, 2, 4);
    return a[0] ? ((n.m | 0) + 1) & 15 : n.m | 0;
  },
  RAM:  function(n, a){
    var m = words(n).slice();
    if (a[8]) m[bits(a, 0, 4)] = bits(a, 4, 4);
    return m;
  }
};
/* One part's outputs from its inputs' drives. */
function outputs(n, d){
  var t = TYPES[n.t], a = [], j;
  if (n.t === "SWITCH" || n.t === "BUTTON") return [drv(n.s)];
  if (n.t === "POINT") return [d[0]];       /* a junction hands on whatever reaches it */
  for (j = 0; j < d.length; j++)
    a.push(d[j] === 0 && t.pd && t.pd[j] !== undefined ? t.pd[j] : hi(d[j]));
  n.ia = a;
  if (RULE[n.t]) return RULE[n.t](n, a, d);
  if (!nOut(n)) return [];
  return [drv(logic(n.t, a))];
}
/* Iterative settle: bounded passes, so a feedback loop can never spin the CPU. */
function settle(src){
  var i, j, n, d, o, pass, changed, k;
  for (pass = 0; pass < 64; pass++){
    changed = false;
    for (i = 0; i < nodes.length; i++){
      n = nodes[i]; d = [];
      for (j = 0; j < nIn(n); j++){ d.push(resolve(src.get(n.id + ":" + j))); n.iv[j] = hi(d[j]); }
      n.idr = d;
      o = outputs(n, d);
      for (k = 0; k < o.length; k++) if (n.od[k] !== o[k]){ n.od[k] = o[k]; changed = true; }
    }
    if (!changed) break;
  }
}
/* Settle the sheet and return how many inputs are left open. The screen is not
   touched, so the arena's checker can run a circuit that is not on the sheet. */
function solve(){
  var src = new Map(), i, j, n, w, s, round, fire, next, t, c;
  for (i = 0; i < wires.length; i++){
    w = wires[i];
    if (!w.a || !w.b) continue;
    s = w.b + ":" + w.p;
    if (src.has(s)) src.get(s).push([w.a, w.q | 0]); else src.set(s, [[w.a, w.q | 0]]);
  }
  for (i = 0; i < nodes.length; i++){
    n = nodes[i]; n.iv = [];
    for (j = 0; j < nIn(n); j++) n.iv.push(0);
    if (!n.od || n.od.length !== nOut(n)) n.od = [];
  }
  /* Settle, then let every flip-flop whose clock has just risen take its inputs
     in, all at once, and settle again — so a shift register moves one place per
     edge however its parts happen to be ordered on the sheet. A counter whose
     outputs clock the next one ripples on through the rounds. */
  for (round = 0; round < 32; round++){
    settle(src);
    fire = [];
    for (i = 0; i < nodes.length; i++){
      n = nodes[i]; t = TYPES[n.t];
      if (t.ck === undefined) continue;
      c = n.iv[t.ck];
      if (c && n.pc === 0) fire.push(n);
      n.pc = c;                               /* first look at a clock is no edge */
    }
    if (!fire.length) break;
    next = fire.map(function(f){ return EDGE[f.t](f, f.ia); });
    for (i = 0; i < fire.length; i++) fire[i].m = next[i];
  }
  for (i = 0; i < nodes.length; i++){
    n = nodes[i];
    n.ov = n.od.map(hi);
    n.v = nOut(n) ? n.ov[0] : (n.iv[0] | 0);
  }
  var open = 0;
  for (i = 0; i < nodes.length; i++){
    t = TYPES[nodes[i].t];
    for (j = 0; j < nIn(nodes[i]); j++)
      if (src.get(nodes[i].id + ":" + j) === undefined && !(t.pd && t.pd[j] !== undefined)) open++;
  }
  return open;
}
function evaluate(){
  var open = solve();
  $("#count").textContent = nodes.length + " parts · " + wires.length + " wires" +
    (open ? " · " + open + " open input" + (open > 1 ? "s" : "") : "") +
    (picked() ? " · " + picked() + " selected" : "");
  $("#count").classList.toggle("warn", open > 0);
  pickDel();
  nameChip();
}
function nameChip(){
  var el = $("#docname");
  /* never yank the text out from under someone mid-rename */
  if (document.activeElement !== el) el.value = docName;
  $("#dot").classList.toggle("on", docDirty);
}

/* ---------- selection ---------- */
function clearPick(){ pickN.clear(); pickW.clear(); }
function pickOne(k, id){ clearPick(); if (k === "n") pickN.add(id); else pickW.add(id); }
function picked(){ return pickN.size + pickW.size; }
function pickDel(){ $("#btnDel").disabled = testMode || !picked(); }
function pickNodes(){ return nodes.filter(function(n){ return pickN.has(n.id); }); }
/* Every wire whose two ends both sit on picked parts belongs to the picked block,
   whether the band happened to cross it or not. */
function pickSpread(){
  for (var i = 0; i < wires.length; i++){
    var w = wires[i];
    if (w.a && w.b && pickN.has(w.a) && pickN.has(w.b)) pickW.add(w.id);
  }
}
