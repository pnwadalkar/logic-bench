/* Changing the circuit: adding, wiring, deleting, undo, copy and paste. */
import { S, ask, flash, notify } from "./state.js";
import { Auth } from "./auth.js";
import { load, saveCur, snapshot } from "./builds.js";
import { setCursor, setWireMode } from "./cleaner.js";
import { Collab } from "./collab.js";
import { GRID, PORT, SNAP, TYPES, box, byId, catKey, chipPins, defineUserChip, isPt, newId, pickN, pickW, setKind } from "./core.js";
import { draw, endA, endB, near, portTarget, toWorld } from "./render.js";
import { clearPick, evaluate, pickNodes, pickOne, picked, reindex } from "./sim.js";

/* ---------- model edits ---------- */
export function autoLabel(t){
  var i, c = 0;
  if (t === "LAMP"){
    for (i = 0; i < S.nodes.length; i++) if (S.nodes[i].t === "LAMP") c++;
    return "Q" + (c + 1);
  }
  if (t === "SWITCH" || t === "BUTTON"){
    for (i = 0; i < S.nodes.length; i++) if (S.nodes[i].t === "SWITCH" || S.nodes[i].t === "BUTTON") c++;
    return c < 26 ? String.fromCharCode(65 + c) : "S" + (c + 1);
  }
  if (t === "QUBIT" || t === "METER"){
    for (i = 0; i < S.nodes.length; i++) if (S.nodes[i].t === t) c++;
    return (t === "QUBIT" ? "q" : "m") + c;
  }
  return "";
}
export function addNode(t, x, y){
  var n = {id:newId("n"), t:t, x:x, y:y, v:0, s:0, l:autoLabel(t), iv:[]};
  S.nodes.push(n); reindex();
  return n;
}
/* A part's memory as plain data: a bit, a word or a charge is a number, a RAM or
   ROM is sixteen words. Anything else is dropped. */
export function keepMem(m){
  if (typeof m === "number" && isFinite(m)) return m;
  if (Array.isArray(m) && m.length === 16) return m.map(function(v){ return (v | 0) & 15; });
  return undefined;
}
/* A gate input holds one driver, so a fresh wire displaces whatever was there.
   A point is a junction: wires meet it from any side, so they all stay and the
   levels ride together. keep is a wire that must survive the sweep regardless. */
export function isJunction(id){ var n = byId.get(id); return !!n && isPt(n); }
export function takeInput(i, keep){
  if (isJunction(i.id)) return;
  S.wires = S.wires.filter(function(w){ return w === keep || !(w.b === i.id && w.p === i.p); });
}
export function connect(a, b){
  if (!a || !b || a.kind === b.kind) return false;
  var o = a.kind === "out" ? a : b, i = a.kind === "in" ? a : b;
  if (o.id === i.id) return false;
  /* already wired exactly this way: no second line on top of the first */
  if (S.wires.some(function(w){ return w.a === o.id && (w.q | 0) === (o.p | 0) && w.b === i.id && w.p === i.p; })) return false;
  takeInput(i, null);
  /* a qubit cannot be copied: a quantum output feeds one input, so a fresh wire
     from it takes the place of the one that was there */
  if (S.docKind === "quantum") S.wires = S.wires.filter(function(w){ return !(w.a === o.id && (w.q | 0) === (o.p | 0)); });
  S.wires.push({id:newId("w"), a:o.id, q:o.p | 0, b:i.id, p:i.p});
  return true;
}
/* A wire with one end on bare sheet. The bench no longer makes these — a wire
   runs from a port to a port, see noWire in input.js — but builds saved before
   that rule still hold some, and their loose ends can still be dragged home. */
export function loose(ph, p){
  var w = {id:newId("w"), a:null, q:0, b:null, p:0, fa:null, fb:null};
  var q = {x:Math.round(p.x / SNAP) * SNAP, y:Math.round(p.y / SNAP) * SNAP};
  if (ph.kind === "out"){ w.a = ph.id; w.q = ph.p | 0; w.fb = q; }
  else {
    w.b = ph.id; w.p = ph.p; w.fa = q;
    takeInput(ph, null);
  }
  S.wires.push(w);
  return w;
}
/* A loose end under the pointer, so it can be dragged on to finish the wire. */
export function endAt(p){
  var i, w;
  for (i = S.wires.length - 1; i >= 0; i--){
    w = S.wires[i];
    if (!w.a && w.fa && near(p, w.fa, PORT)) return {w:w, e:"a"};
    if (!w.b && w.fb && near(p, w.fb, PORT)) return {w:w, e:"b"};
  }
  return null;
}
/* Land a dragged end on a port, or leave it loose on the grid. */
export function dropEnd(we, p){
  var w = we.w, ph = portTarget(p, we.e === "a" ? "out" : "in");
  if (ph && ph.kind === (we.e === "a" ? "out" : "in")){
    if (we.e === "a" && ph.id !== w.b){ w.a = ph.id; w.q = ph.p | 0; w.fa = null; return true; }
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
export function removeSel(){
  if (S.testMode || !picked()) return;
  pushUndo();
  var gone = picked();
  S.nodes = S.nodes.filter(function(n){ return !pickN.has(n.id); });
  S.wires = S.wires.filter(function(w){
    if (pickW.has(w.id)) return false;
    return !((w.a && pickN.has(w.a)) || (w.b && pickN.has(w.b)));
  });
  reindex();
  clearPick(); commit();
  if (gone > 1) flash("Deleted " + gone + " items · Ctrl+Z puts them back");
}
export function commit(){ S.docDirty = true; evaluate(); draw(); saveCur(); }

/* ---------- undo ---------- */
/* One stack for everything that moves a lot at once — the cleaner, a paste, a
   region delete — so none of those is a one-way door. */
export function pushUndo(){
  var d = snapshot();
  d.rc = Collab.clock();          /* in a shared project: how far others had got at this point */
  S.undoStack.push(d);
  if (S.undoStack.length > 30) S.undoStack.shift();
}
export function restore(d){
  if (!d) return false;
  if (!d.nodes || !d.nodes.length){
    setKind(d.kind);
    S.nodes = []; S.wires = []; clearPick(); S.pend = null; S.wiring = null; S.wend = null;
    S.pan = d.pan && typeof d.pan.x === "number" ? {x:d.pan.x, y:d.pan.y} : S.pan;
    reindex(); return true;
  }
  return load(d);
}
export function undo(){
  if (S.testMode) return;
  if (!S.undoStack.length){ flash("Nothing to undo."); return; }
  var d = S.undoStack.pop();
  if (!restore(Collab.active() ? Collab.mergeUndo(d) : d)) return;
  commit();
  flash("Undone.");
}

/* ---------- copy & paste ---------- */
/* A copy is kept as plain data measured from its own top-left corner, so it can
   be dropped anywhere, any number of times, with the original left untouched. */
export var AUTO = /^(?:[A-Z]|Q\d+|S\d+|q\d+|m\d+)$/;      /* a label the bench handed out itself */
export function clipFrom(){
  var ns = pickNodes(), idx = new Map(), i, b, w, lo, hi;
  for (i = 0; i < ns.length; i++) idx.set(ns[i].id, i);
  /* a wire comes along when every end of it that sits on a part sits on a part
     we are taking; a loose end only travels if the band caught the wire itself */
  var ws = S.wires.filter(function(w){
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
    kind:S.docKind,
    w:hi.x - lo.x, h:hi.y - lo.y, ox:lo.x, oy:lo.y,
    nodes:ns.map(function(n){
      return {t:n.t, x:n.x - lo.x, y:n.y - lo.y, s:n.s | 0, l:n.l || "", c:n.c, m:keepMem(n.m)};
    }),
    wires:ws.map(function(w){
      return {a:w.a ? idx.get(w.a) : null, q:w.q | 0, b:w.b ? idx.get(w.b) : null, p:w.p | 0,
              fa:rel(w.fa), fb:rel(w.fb)};
    })
  };
}
export function copyPick(cut){
  if (S.testMode) return;
  if (!pickN.size){ flash("Nothing picked — drag a box round the part of the circuit you want."); return; }
  var c = clipFrom();
  if (!c){ flash("Nothing to copy there."); return; }
  S.clip = c; S.lastPaste = null; notify();
  var msg = c.nodes.length + " part" + (c.nodes.length === 1 ? "" : "s") + " and " +
            c.wires.length + " wire" + (c.wires.length === 1 ? "" : "s");
  if (cut){ removeSel(); flash("Cut " + msg + " · Ctrl+V drops it back"); }
  else flash("Copied " + msg + " · Ctrl+V pastes it, again and again");
}
/* Where the next copy lands: under the pointer if it is over the sheet, else a
   step down and across. Pasting twice without moving steps on, so a run of
   Ctrl+V lays the copies out in a row instead of stacking them on each other. */
export function pasteSpot(where){
  var step = GRID * 2, at = where;
  if (!at){
    if (S.hover) at = {x:S.hover.x - S.clip.w / 2, y:S.hover.y - S.clip.h / 2};
    else if (S.lastPaste) at = {x:S.lastPaste.x + step, y:S.lastPaste.y + step};
    else at = {x:(S.cv.clientWidth / 2 - S.pan.x) / S.zoom - S.clip.w / 2, y:(S.cv.clientHeight / 2 - S.pan.y) / S.zoom - S.clip.h / 2};
  }
  at = {x:Math.round(at.x / SNAP) * SNAP, y:Math.round(at.y / SNAP) * SNAP};
  if (!where && S.lastPaste && Math.abs(at.x - S.lastPaste.x) < 1 && Math.abs(at.y - S.lastPaste.y) < 1){
    at.x += step; at.y += step;
  }
  S.lastPaste = at;
  return at;
}
/* where is the top-left corner the copy lands on; left out, it goes under the
   pointer, or a step on from the last one */
export function pasteClip(where){
  if (S.testMode) return;
  if (!S.clip){ flash("Nothing copied yet — box in an area and press Copy."); return; }
  if ((S.clip.kind || "classical") !== S.docKind){ flash("That copy came from a " + (S.clip.kind || "classical") + " build — it can't go on a " + S.docKind + " sheet."); return; }
  pushUndo();
  var at = pasteSpot(where), made = [], i, cn, n, cw, w;
  for (i = 0; i < S.clip.nodes.length; i++){
    cn = S.clip.nodes[i];
    n = addNode(cn.t, at.x + cn.x, at.y + cn.y);
    /* a name the bench made up is handed out fresh, so the copies read A B C D
       rather than four parts all called A; a name you typed is yours and stays,
       and only the parts the bench ever names are renamed at all */
    if (cn.l && !(AUTO.test(cn.l) && autoLabel(cn.t))) n.l = cn.l;
    n.s = cn.s;
    /* a copy of a ROM holds the same program, a copied clock keeps its speed */
    if (cn.c !== undefined) n.c = cn.c;
    if (cn.m !== undefined) n.m = keepMem(cn.m);
    made.push(n);
  }
  clearPick();
  for (i = 0; i < made.length; i++) pickN.add(made[i].id);
  for (i = 0; i < S.clip.wires.length; i++){
    cw = S.clip.wires[i];
    w = {id:newId("w"), p:cw.p, q:cw.q | 0,
      a:cw.a === null ? null : made[cw.a].id,
      b:cw.b === null ? null : made[cw.b].id,
      fa:cw.fa ? {x:at.x + cw.fa.x, y:at.y + cw.fa.y} : null,
      fb:cw.fb ? {x:at.x + cw.fb.x, y:at.y + cw.fb.y} : null};
    S.wires.push(w); pickW.add(w.id);
  }
  setWireMode(false);
  commit();
  flash("Pasted " + made.length + " part" + (made.length === 1 ? "" : "s") +
    " · drag it into place · Ctrl+V again for another");
}
export function selectAll(){
  if (S.testMode) return;
  clearPick();
  for (var i = 0; i < S.nodes.length; i++) pickN.add(S.nodes[i].id);
  for (i = 0; i < S.wires.length; i++) pickW.add(S.wires[i].id);
  evaluate(); draw();
}

/* ---------- the picker ---------- */
/* The boxed-in area in sheet coordinates: what the bar is hung over, and where
   a duplicate is measured from. */
export function selBox(){
  var lo = {x:Infinity, y:Infinity}, hi = {x:-Infinity, y:-Infinity}, any = false, i, b, w, a, z;
  var seen = function(x, y, x2, y2){
    any = true;
    lo.x = Math.min(lo.x, x); lo.y = Math.min(lo.y, y);
    hi.x = Math.max(hi.x, x2); hi.y = Math.max(hi.y, y2);
  };
  for (i = 0; i < S.nodes.length; i++){
    if (!pickN.has(S.nodes[i].id)) continue;
    b = box(S.nodes[i]); seen(b.x, b.y, b.x + b.w, b.y + b.h);
  }
  for (i = 0; i < S.wires.length; i++){
    w = S.wires[i];
    if (!pickW.has(w.id)) continue;
    a = endA(w); z = endB(w);
    if (a) seen(a.x, a.y, a.x, a.y);
    if (z) seen(z.x, z.y, z.x, z.y);
  }
  return any ? {x:lo.x, y:lo.y, w:hi.x - lo.x, h:hi.y - lo.y} : null;
}
/* Where the bar over the picked area goes, as a point on the sheet's canvas: above
   the area, or below it when the area is against the top. bw and bh are the bar's
   own size. Nothing picked, or a tool in hand that the bar would be in the way
   of, and there is no bar. */
export function pickBarSpot(bw, bh){
  var r = (S.testMode || S.marq || S.pasteMode || !S.cv) ? null : selBox();
  if (!r || !picked()) return null;
  var W = S.cv.clientWidth, H = S.cv.clientHeight;
  var x = S.pan.x + (r.x + r.w / 2) * S.zoom, y = S.pan.y + r.y * S.zoom - 12;
  if (y - bh < 4) y = S.pan.y + (r.y + r.h) * S.zoom + 14 + bh;
  y = Math.max(bh + 4, Math.min(H - 4, y));
  x = Math.max(bw / 2 + 4, Math.min(W - bw / 2 - 4, x));
  return {x:Math.round(x), y:Math.round(y)};
}
/* Duplicate: the area copied and dropped one grid square down and across, so the
   copy lands beside the original rather than on top of it. */
export function dupPick(){
  if (S.testMode || !pickN.size) return;
  var c = clipFrom();
  if (!c){ flash("Nothing to copy there."); return; }
  S.clip = c; S.lastPaste = null; notify();
  pasteClip({x:c.ox + GRID, y:c.oy + GRID});
}
/* Paste by hand: the copy follows the pointer and lands where it is clicked, so
   an area can be put down with a finger, where Ctrl+V cannot be typed at all. */
export function setPasteMode(on){
  on = !!on && !S.testMode;
  if (on && !S.clip){ flash("Nothing copied yet — box in an area and press Copy."); on = false; }
  S.pasteMode = on;
  if (S.pasteMode){
    S.wireMode = false; S.regionMode = false; S.pend = null; S.wiring = null; S.marq = null;
    clearPick(); notify(); evaluate();
    flash("Click where the copy goes · Shift-click keeps it in hand for another · Esc to stop");
  }
  notify();
  setCursor();
  draw();
}

/* ---------- saved areas ---------- */
/* A circuit you boxed in can be named and kept on the Electronics tab as a chip
   (see defineUserChip in core.js), then dragged out again as often as you like.

   A chip lives in one of two shelves: the account's own, kept in this browser
   (and synced to the account, see auth.js) so it shows up on every build you
   open — or this build's own, kept with the build itself (snapshot/load in
   builds.js) so it shows up only here. Either way it is yours to move between
   the two afterwards, from the shelf tile. */
export function areaRead(){
  try {
    var o = JSON.parse(localStorage.getItem(Auth.key("areas")) || "{}");
    return (o && typeof o === "object") ? o : {};
  } catch (err) { return {}; }
}
export function areaWrite(o){
  try { localStorage.setItem(Auth.key("areas"), JSON.stringify(o)); Auth.changed(); return true; }
  catch (err) { return false; }
}
export function localAreaRead(){ return (S.localAreas && typeof S.localAreas === "object") ? S.localAreas : {}; }
export function localAreaWrite(o){ S.localAreas = o; saveCur(); return true; }
/* where a name is kept: the account's shelf, unless it is only this build's own */
export function areaScope(name){ return localAreaRead()[name] ? "project" : "global"; }
export function areaEntry(name){ return areaRead()[name] || localAreaRead()[name]; }
/* the saved names, oldest first, so a new one lands at the end of the shelf.
   A build's own chips and the account's own are shown together — a name used
   by both shows the build's own, since that is the one in front of you. */
export function areaNames(){
  var g = areaRead(), l = localAreaRead(), o = {}, k;
  for (k in g) o[k] = g[k];
  for (k in l) o[k] = l[k];
  return Object.keys(o).sort(function(a, b){ return (o[a].at || 0) - (o[b].at || 0); });
}
/* Move a chip between the account's shelf and this build's own. Moving a global
   chip to "this project only" takes it off every other build's shelf; moving a
   project chip to "every project" puts it on the account's. */
export function setAreaScope(name, scope){
  var g = areaRead(), l = localAreaRead(), entry = g[name] || l[name];
  if (!entry) return;
  if (scope === "project"){
    if (g[name]){ delete g[name]; areaWrite(g); }
    l[name] = entry; localAreaWrite(l);
    flash("“" + name + "” is kept with this build only — it won't show up in your other projects.");
  } else {
    if (l[name]){ delete l[name]; localAreaWrite(l); }
    g[name] = entry; areaWrite(g);
    flash("“" + name + "” is on your account's shelf — every project you open can use it.");
  }
  notify();
}
export function showShelf(){
  for (var i = 0; i < S.CATS.length; i++) if (S.CATS[i].u) setCat(i);
}
/* which tab of the parts console is showing, remembered per kind of build */
export function setCat(k){
  S.railCat = k;
  try { localStorage.setItem(catKey(), String(k)); } catch (err) {}
  notify();
}
/* A saved area is a chip: the part type made from it, made the first time it is
   asked for (areas saved before chips existed get theirs here too). */
export function areaKey(name, a){
  a = a || areaEntry(name);
  if (!a || !a.clip || !Array.isArray(a.clip.nodes) || !Array.isArray(a.clip.wires)) return null;
  return defineUserChip(name, a.clip);
}
export function saveArea(){
  if (S.testMode) return;
  if (S.docKind === "quantum"){ flash("Chips are made from classical builds — a quantum area can be copied and pasted instead."); return; }
  if (!pickN.size){ flash("Nothing picked — drag a box round the part of the circuit you want."); return; }
  var c = clipFrom();
  if (!c){ flash("Nothing to save there."); return; }
  var pins = chipPins(c);
  if (!pins.ins.length && !pins.outs.length){
    flash("This area has no switches or lamps to make pins from — put a switch inside it for every input, a lamp for every output.");
    return;
  }
  var nIns = pins.ins.length, nOuts = pins.outs.length;
  ask({title:"Save as a chip", ok:"Save", value:"",
    msg:"Give this chip a name. It goes on the Electronics tab as a black chip with the name on top. " +
        (nIns === 1 ? "Its 1 switch becomes its input" : "Its " + nIns + " switches become its inputs") + " (named " +
        (pins.pi.join(", ") || "—") + ") and " +
        (nOuts === 1 ? "its 1 lamp its output" : "its " + nOuts + " lamps its outputs") + " (named " +
        (pins.po.join(", ") || "—") + "). It goes on your account's shelf, so every project can use it — " +
        "the ⟲ on its tile keeps it to this build only instead.",
    check:function(v){
      if (!v) return "Give the chip a name.";
      if (areaRead()[v] || localAreaRead()[v]) return "There's already a chip called “" + v + "” — pick another name.";
      return "";
    },
    done:function(v){
      var o = areaRead();
      o[v] = {at:Date.now(), clip:c};
      if (!areaWrite(o)){ flash("Couldn't save — this browser's storage is full or blocked."); return; }
      areaKey(v, o[v]);
      showShelf();
      flash("Saved the chip “" + v + "” on the Electronics tab");
    }});
}
export function askDeleteArea(name){
  ask({title:"Delete chip", ok:"Delete", danger:true,
    msg:"Delete the saved chip “" + name + "”? Copies already on the sheet stay.",
    done:function(){
      var g = areaRead(), l = localAreaRead();
      if (g[name]){ delete g[name]; areaWrite(g); }
      if (l[name]){ delete l[name]; localAreaWrite(l); }
      notify();
      flash("Deleted “" + name + "”");
    }});
}
/* Pick a saved chip off the shelf: one lands under the pointer and rides with it,
   the same as a part dragged out of the console. */
export function spawnArea(name, e){
  var key = areaKey(name);
  if (key) spawnPart(key, e);
}

/* the bar over the picked area */
/* the buttons on the bar over the picked area */
export function pickAction(a){
  if (a === "save") saveArea();
  else if (a === "copy") copyPick(false);
  else if (a === "cut") copyPick(true);
  else if (a === "dup") dupPick();
  else if (a === "del") removeSel();
  else { clearPick(); notify(); draw(); }
}
/* Take a part off the console: one lands under the pointer and rides with it
   until it is let go over the sheet. */
export function spawnPart(t, e){
  if (S.testMode || !TYPES[t]) return;
  setWireMode(false);
  if (S.pasteMode) setPasteMode(false);
  var p = toWorld(e), d = TYPES[t];
  var n = addNode(t, p.x - d.w / 2, p.y - d.h / 2);
  pickOne("n", n.id);
  S.drag = {id:n.id, off:[{o:n, dx:d.w / 2, dy:d.h / 2}], moved:true, spawn:true};
  evaluate(); draw();
}
