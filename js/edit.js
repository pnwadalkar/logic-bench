/* Changing the circuit: adding, wiring, deleting, undo, copy and paste. */
"use strict";

/* ---------- model edits ---------- */
function autoLabel(t){
  var i, c = 0;
  if (t === "LAMP"){
    for (i = 0; i < nodes.length; i++) if (nodes[i].t === "LAMP") c++;
    return "Q" + (c + 1);
  }
  if (t === "SWITCH" || t === "BUTTON"){
    for (i = 0; i < nodes.length; i++) if (nodes[i].t === "SWITCH" || nodes[i].t === "BUTTON") c++;
    return c < 26 ? String.fromCharCode(65 + c) : "S" + (c + 1);
  }
  return "";
}
function addNode(t, x, y){
  var n = {id:"n" + (seq++), t:t, x:x, y:y, v:0, s:0, l:autoLabel(t), iv:[]};
  nodes.push(n); reindex();
  return n;
}
/* A gate input holds one driver, so a fresh wire displaces whatever was there.
   A point is a junction: wires meet it from any side, so they all stay and the
   levels ride together. keep is a wire that must survive the sweep regardless. */
function isJunction(id){ var n = byId.get(id); return !!n && isPt(n); }
function takeInput(i, keep){
  if (isJunction(i.id)) return;
  wires = wires.filter(function(w){ return w === keep || !(w.b === i.id && w.p === i.p); });
}
function connect(a, b){
  if (!a || !b || a.kind === b.kind) return false;
  var o = a.kind === "out" ? a : b, i = a.kind === "in" ? a : b;
  if (o.id === i.id) return false;
  /* already wired exactly this way: no second line on top of the first */
  if (wires.some(function(w){ return w.a === o.id && w.b === i.id && w.p === i.p; })) return false;
  takeInput(i, null);
  wires.push({id:"w" + (seq++), a:o.id, b:i.id, p:i.p});
  return true;
}
/* Drop the far end of a wire on bare sheet. The wire is real and editable;
   it simply carries nothing until the loose end lands on a port. */
function loose(ph, p){
  var w = {id:"w" + (seq++), a:null, b:null, p:0, fa:null, fb:null};
  var q = {x:Math.round(p.x / SNAP) * SNAP, y:Math.round(p.y / SNAP) * SNAP};
  if (ph.kind === "out"){ w.a = ph.id; w.fb = q; }
  else {
    w.b = ph.id; w.p = ph.p; w.fa = q;
    takeInput(ph, null);
  }
  wires.push(w);
  return w;
}
/* A loose end under the pointer, so it can be dragged on to finish the wire. */
function endAt(p){
  var i, w;
  for (i = wires.length - 1; i >= 0; i--){
    w = wires[i];
    if (!w.a && w.fa && near(p, w.fa, PORT)) return {w:w, e:"a"};
    if (!w.b && w.fb && near(p, w.fb, PORT)) return {w:w, e:"b"};
  }
  return null;
}
/* Land a dragged end on a port, or leave it loose on the grid. */
function dropEnd(we, p){
  var w = we.w, ph = portTarget(p, we.e === "a" ? "out" : "in");
  if (ph && ph.kind === (we.e === "a" ? "out" : "in")){
    if (we.e === "a" && ph.id !== w.b){ w.a = ph.id; w.fa = null; return true; }
    if (we.e === "b" && ph.id !== w.a){
      takeInput(ph, w);
      w.b = ph.id; w.p = ph.p; w.fb = null; return true;
    }
  }
  var q = {x:Math.round(p.x / SNAP) * SNAP, y:Math.round(p.y / SNAP) * SNAP};
  if (we.e === "a") w.fa = q; else w.fb = q;
  return false;
}
/* The whole selection goes at once — one part, one wire, or a boxed-in region. */
function removeSel(){
  if (testMode || !picked()) return;
  pushUndo();
  var gone = picked();
  nodes = nodes.filter(function(n){ return !pickN.has(n.id); });
  wires = wires.filter(function(w){
    if (pickW.has(w.id)) return false;
    return !((w.a && pickN.has(w.a)) || (w.b && pickN.has(w.b)));
  });
  reindex();
  clearPick(); commit();
  if (gone > 1) flash("Deleted " + gone + " items · Ctrl+Z puts them back");
}
function commit(){ docDirty = true; evaluate(); draw(); saveCur(); }

/* ---------- undo ---------- */
/* One stack for everything that moves a lot at once — the cleaner, a paste, a
   region delete — so none of those is a one-way door. */
function pushUndo(){
  undoStack.push(snapshot());
  if (undoStack.length > 30) undoStack.shift();
}
function restore(d){
  if (!d) return false;
  if (!d.nodes || !d.nodes.length){
    nodes = []; wires = []; clearPick(); pend = null; wiring = null; wend = null;
    pan = d.pan && typeof d.pan.x === "number" ? {x:d.pan.x, y:d.pan.y} : pan;
    reindex(); return true;
  }
  return load(d);
}
function undo(){
  if (testMode) return;
  if (!undoStack.length){ flash("Nothing to undo."); return; }
  if (!restore(undoStack.pop())) return;
  commit();
  flash("Undone.");
}

/* ---------- copy & paste ---------- */
/* A copy is kept as plain data measured from its own top-left corner, so it can
   be dropped anywhere, any number of times, with the original left untouched. */
var AUTO = /^(?:[A-Z]|Q\d+|S\d+)$/;      /* a label the bench handed out itself */
function clipFrom(){
  var ns = pickNodes(), idx = new Map(), i, b, w, lo, hi;
  for (i = 0; i < ns.length; i++) idx.set(ns[i].id, i);
  /* a wire comes along when every end of it that sits on a part sits on a part
     we are taking; a loose end only travels if the band caught the wire itself */
  var ws = wires.filter(function(w){
    return (w.a ? idx.has(w.a) : pickW.has(w.id)) && (w.b ? idx.has(w.b) : pickW.has(w.id));
  });
  if (!ns.length) return null;
  lo = {x:Infinity, y:Infinity}; hi = {x:-Infinity, y:-Infinity};
  var seen = function(x, y, x2, y2){
    lo.x = Math.min(lo.x, x); lo.y = Math.min(lo.y, y);
    hi.x = Math.max(hi.x, x2); hi.y = Math.max(hi.y, y2);
  };
  for (i = 0; i < ns.length; i++){ b = box(ns[i]); seen(b.x, b.y, b.x + b.w, b.y + b.h); }
  for (i = 0; i < ws.length; i++){
    w = ws[i];
    if (w.fa) seen(w.fa.x, w.fa.y, w.fa.x, w.fa.y);
    if (w.fb) seen(w.fb.x, w.fb.y, w.fb.x, w.fb.y);
  }
  var rel = function(p){ return p ? {x:p.x - lo.x, y:p.y - lo.y} : null; };
  return {
    w:hi.x - lo.x, h:hi.y - lo.y, ox:lo.x, oy:lo.y,
    nodes:ns.map(function(n){ return {t:n.t, x:n.x - lo.x, y:n.y - lo.y, s:n.s ? 1 : 0, l:n.l || ""}; }),
    wires:ws.map(function(w){
      return {a:w.a ? idx.get(w.a) : null, b:w.b ? idx.get(w.b) : null, p:w.p | 0,
              fa:rel(w.fa), fb:rel(w.fb)};
    })
  };
}
function copyPick(cut){
  if (testMode) return;
  if (!pickN.size){ flash("Nothing picked — drag a box round the part of the circuit you want."); return; }
  var c = clipFrom();
  if (!c){ flash("Nothing to copy there."); return; }
  clip = c; lastPaste = null; markTool();
  var msg = c.nodes.length + " part" + (c.nodes.length === 1 ? "" : "s") + " and " +
            c.wires.length + " wire" + (c.wires.length === 1 ? "" : "s");
  if (cut){ removeSel(); flash("Cut " + msg + " · Ctrl+V drops it back"); }
  else flash("Copied " + msg + " · Ctrl+V pastes it, again and again");
}
/* Where the next copy lands: under the pointer if it is over the sheet, else a
   step down and across. Pasting twice without moving steps on, so a run of
   Ctrl+V lays the copies out in a row instead of stacking them on each other. */
function pasteSpot(where){
  var step = GRID * 2, at = where;
  if (!at){
    if (hover) at = {x:hover.x - clip.w / 2, y:hover.y - clip.h / 2};
    else if (lastPaste) at = {x:lastPaste.x + step, y:lastPaste.y + step};
    else at = {x:(cv.clientWidth / 2 - pan.x) / zoom - clip.w / 2, y:(cv.clientHeight / 2 - pan.y) / zoom - clip.h / 2};
  }
  at = {x:Math.round(at.x / SNAP) * SNAP, y:Math.round(at.y / SNAP) * SNAP};
  if (!where && lastPaste && Math.abs(at.x - lastPaste.x) < 1 && Math.abs(at.y - lastPaste.y) < 1){
    at.x += step; at.y += step;
  }
  lastPaste = at;
  return at;
}
/* where is the top-left corner the copy lands on; left out, it goes under the
   pointer, or a step on from the last one */
function pasteClip(where){
  if (testMode) return;
  if (!clip){ flash("Nothing copied yet — box in an area and press Copy."); return; }
  pushUndo();
  var at = pasteSpot(where), made = [], i, cn, n, cw, w;
  for (i = 0; i < clip.nodes.length; i++){
    cn = clip.nodes[i];
    n = addNode(cn.t, at.x + cn.x, at.y + cn.y);
    /* a name the bench made up is handed out fresh, so the copies read A B C D
       rather than four parts all called A; a name you typed is yours and stays,
       and only the parts the bench ever names are renamed at all */
    if (cn.l && !(AUTO.test(cn.l) && autoLabel(cn.t))) n.l = cn.l;
    n.s = cn.s;
    made.push(n);
  }
  clearPick();
  for (i = 0; i < made.length; i++) pickN.add(made[i].id);
  for (i = 0; i < clip.wires.length; i++){
    cw = clip.wires[i];
    w = {id:"w" + (seq++), p:cw.p,
      a:cw.a === null ? null : made[cw.a].id,
      b:cw.b === null ? null : made[cw.b].id,
      fa:cw.fa ? {x:at.x + cw.fa.x, y:at.y + cw.fa.y} : null,
      fb:cw.fb ? {x:at.x + cw.fb.x, y:at.y + cw.fb.y} : null};
    wires.push(w); pickW.add(w.id);
  }
  setWireMode(false);
  commit();
  flash("Pasted " + made.length + " part" + (made.length === 1 ? "" : "s") +
    " · drag it into place · Ctrl+V again for another");
}
function selectAll(){
  if (testMode) return;
  clearPick();
  for (var i = 0; i < nodes.length; i++) pickN.add(nodes[i].id);
  for (i = 0; i < wires.length; i++) pickW.add(wires[i].id);
  evaluate(); draw();
}

/* ---------- the picker ---------- */
/* The boxed-in area in sheet coordinates: what the bar is hung over, and where
   a duplicate is measured from. */
function selBox(){
  var lo = {x:Infinity, y:Infinity}, hi = {x:-Infinity, y:-Infinity}, any = false, i, b, w, a, z;
  var seen = function(x, y, x2, y2){
    any = true;
    lo.x = Math.min(lo.x, x); lo.y = Math.min(lo.y, y);
    hi.x = Math.max(hi.x, x2); hi.y = Math.max(hi.y, y2);
  };
  for (i = 0; i < nodes.length; i++){
    if (!pickN.has(nodes[i].id)) continue;
    b = box(nodes[i]); seen(b.x, b.y, b.x + b.w, b.y + b.h);
  }
  for (i = 0; i < wires.length; i++){
    w = wires[i];
    if (!pickW.has(w.id)) continue;
    a = endA(w); z = endB(w);
    if (a) seen(a.x, a.y, a.x, a.y);
    if (z) seen(z.x, z.y, z.x, z.y);
  }
  return any ? {x:lo.x, y:lo.y, w:hi.x - lo.x, h:hi.y - lo.y} : null;
}
/* The bar follows the picked area and goes away the moment nothing is picked.
   It is drawn above the area, or below it when the area is against the top. */
function pickBar(){
  var el = $("#pick"), r = (testMode || marq || pasteMode) ? null : selBox();
  if (!r || !picked()){ el.hidden = true; return; }
  el.hidden = false;
  var np = pickN.size, nw = pickW.size;
  $("#pickWhat").textContent = np + " part" + (np === 1 ? "" : "s") +
    (nw ? " · " + nw + " wire" + (nw === 1 ? "" : "s") : "");
  var W = cv.clientWidth, H = cv.clientHeight, bw = el.offsetWidth, bh = el.offsetHeight;
  var x = pan.x + (r.x + r.w / 2) * zoom, y = pan.y + r.y * zoom - 12;
  if (y - bh < 4) y = pan.y + (r.y + r.h) * zoom + 14 + bh;
  y = Math.max(bh + 4, Math.min(H - 4, y));
  x = Math.max(bw / 2 + 4, Math.min(W - bw / 2 - 4, x));
  el.style.left = Math.round(x) + "px";
  el.style.top = Math.round(y) + "px";
}
/* Duplicate: the area copied and dropped one grid square down and across, so the
   copy lands beside the original rather than on top of it. */
function dupPick(){
  if (testMode || !pickN.size) return;
  var c = clipFrom();
  if (!c){ flash("Nothing to copy there."); return; }
  clip = c; lastPaste = null; markTool();
  pasteClip({x:c.ox + GRID, y:c.oy + GRID});
}
/* Paste by hand: the copy follows the pointer and lands where it is clicked, so
   an area can be put down with a finger, where Ctrl+V cannot be typed at all. */
function setPasteMode(on){
  on = !!on && !testMode;
  if (on && !clip){ flash("Nothing copied yet — box in an area and press Copy."); on = false; }
  pasteMode = on;
  if (pasteMode){
    wireMode = false; regionMode = false; pend = null; wiring = null; marq = null;
    clearPick(); pickDel(); evaluate();
    flash("Click where the copy goes · Shift-click keeps it in hand for another · Esc to stop");
  }
  markTool();
  cv.style.cursor = cursorFor();
  draw();
}

/* the bar over the picked area */
$("#pick").addEventListener("click", function(e){
  var a = e.target && e.target.getAttribute ? e.target.getAttribute("data-a") : null;
  if (!a) return;
  if (a === "copy") copyPick(false);
  else if (a === "cut") copyPick(true);
  else if (a === "dup") dupPick();
  else if (a === "del") removeSel();
  else { clearPick(); pickDel(); draw(); }
});
