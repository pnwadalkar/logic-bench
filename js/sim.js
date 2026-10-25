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
    case "LAMP": return x;
    case "POINT": return x;
  }
  return 0;
}
function reindex(){ byId.clear(); for (var i = 0; i < nodes.length; i++) byId.set(nodes[i].id, nodes[i]); }
/* Iterative settle: bounded passes, so a feedback loop can never spin the CPU. */
/* Several wires on one input is a junction: any driver that is high pulls it high. */
function level(ids){
  var k, from;
  if (!ids) return 0;
  for (k = 0; k < ids.length; k++){ from = byId.get(ids[k]); if (from && from.v) return 1; }
  return 0;
}
function evaluate(){
  var src = new Map(), i, j, n, w, s, a, v, pass, changed;
  for (i = 0; i < wires.length; i++){
    w = wires[i];
    if (!w.a || !w.b) continue;
    s = w.b + ":" + w.p;
    if (src.has(s)) src.get(s).push(w.a); else src.set(s, [w.a]);
  }
  for (i = 0; i < nodes.length; i++){
    n = nodes[i]; n.iv = [];
    for (j = 0; j < nIn(n); j++) n.iv.push(0);
  }
  for (pass = 0; pass < 24; pass++){
    changed = false;
    for (i = 0; i < nodes.length; i++){
      n = nodes[i];
      if (n.t === "SWITCH" || n.t === "BUTTON"){ v = n.s ? 1 : 0; }
      else {
        a = [];
        for (j = 0; j < nIn(n); j++){
          a.push(level(src.get(n.id + ":" + j))); n.iv[j] = a[j];
        }
        v = logic(n.t, a);
      }
      if (v !== n.v){ n.v = v; changed = true; }
    }
    if (!changed) break;
  }
  var open = 0;
  for (i = 0; i < nodes.length; i++)
    for (j = 0; j < nIn(nodes[i]); j++) if (src.get(nodes[i].id + ":" + j) === undefined) open++;
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
