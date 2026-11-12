/* Builds: plain-data snapshots, storage on this device, saving and renaming, and the examples. */
import { S, ask, chooseKind, flash, notify } from "./state.js";
import { Auth } from "./auth.js";
import { setTest } from "./cleaner.js";
import { Collab } from "./collab.js";
import { CURKEY, LIBKEY, TYPES, defineUserChip, nOut, setKind } from "./core.js";
import { addNode, commit, keepMem } from "./edit.js";
import { newSheet } from "./home.js";
import { clampZ } from "./input.js";
import { exampleQ } from "./quantum.js";
import { draw } from "./render.js";
import { clearPick, evaluate, reindex } from "./sim.js";

/* ---------- build model <-> plain data ---------- */
/* The definitions of the chips you made that a sheet uses — and the chips inside
   those — so a build carries its chips with it: it opens on another device, and
   goes on working after the saved chip is deleted from the shelf. */
export function chipsUsed(){
  var out = {}, todo = S.nodes.map(function(n){ return n.t; }), key, t;
  while (todo.length){
    key = todo.pop(); t = TYPES[key];
    if (!t || !t.user || out[key]) continue;
    out[key] = {name:t.n, clip:t.clip};
    t.clip.nodes.forEach(function(n){ todo.push(n.t); });
  }
  return out;
}
/* and the other way: make the types a build's chip definitions describe. A
   definition that is not what it says it is, or uses a part this bench does not
   know, is left out, and the chips of it drop out of the sheet as any unknown
   part does. */
export function loadChips(defs){
  var keys, made = [], k2;
  if (!defs || typeof defs !== "object") return;
  keys = Object.keys(defs);
  keys.forEach(function(key){
    var d = defs[key], c = d && d.clip;
    if (TYPES[key] || !d || typeof d.name !== "string" || !c || !Array.isArray(c.nodes) || !Array.isArray(c.wires)) return;
    if (c.nodes.length > 2000 || c.wires.length > 8000) return;
    k2 = defineUserChip(d.name.slice(0, 40), c);
    if (k2 !== key) TYPES[key] = TYPES[k2];
    made.push([key, k2]);
  });
  made.forEach(function(m){
    var t = TYPES[m[0]];
    if (t && !t.clip.nodes.every(function(n){ return n && TYPES[n.t]; })){ delete TYPES[m[0]]; delete TYPES[m[1]]; }
  });
}
export function snapshot(){
  var chips = chipsUsed(), o = {
    v:1, name:S.docName,
    nodes:S.nodes.map(function(n){
      var o = {id:n.id, t:n.t, x:n.x, y:n.y, s:n.s, l:n.l};
      /* a clock's speed, and what a memory part holds, go with the build */
      if (n.c !== undefined) o.c = n.c;
      if (keepMem(n.m) !== undefined) o.m = keepMem(n.m);
      return o;
    }),
    wires:S.wires.map(function(w){
      var o = {id:w.id, a:w.a || null, b:w.b || null, p:w.p, fa:w.fa || null, fb:w.fb || null};
      if (w.q) o.q = w.q;
      return o;
    }),
    seq:S.seq, pan:{x:S.pan.x, y:S.pan.y}, zoom:S.zoom
  };
  if (S.docKind === "quantum") o.kind = "quantum";
  if (Object.keys(chips).length) o.chips = chips;
  if (S.localAreas && Object.keys(S.localAreas).length) o.localAreas = S.localAreas;
  return o;
}
/* The parts and wires a build holds, as live objects — anything that does not
   belong on a sheet is dropped. load() puts them on the sheet; the arena's
   checker runs them where they are. */
export function graphOf(d){
  var ids = {}, ns, ws;
  if (d.chips) loadChips(d.chips);
  ns = d.nodes.filter(function(n){ return n && n.id && TYPES[n.t]; }).map(function(n){
    ids[n.id] = nOut({t:n.t});
    var o = {id:n.id, t:n.t, x:+n.x || 0, y:+n.y || 0, v:0, s:(n.s | 0) & 15, l:n.l || "", iv:[]};
    if (typeof n.c === "number" && isFinite(n.c)) o.c = n.c;
    if (keepMem(n.m) !== undefined) o.m = keepMem(n.m);
    return o;
  });
  var pt = function(o){ return o && typeof o.x === "number" ? {x:+o.x, y:+o.y} : null; };
  ws = (d.wires || []).filter(function(w){
    if (!w) return false;
    return !!((w.a ? ids[w.a] > (w.q | 0) : pt(w.fa)) && (w.b ? ids[w.b] !== undefined : pt(w.fb)));
  }).map(function(w, i){
    return {id:w.id || ("w" + (i + 1) + "r"), a:w.a || null, q:w.a ? w.q | 0 : 0, b:w.b || null, p:w.p | 0,
      fa:w.a ? null : pt(w.fa), fb:w.b ? null : pt(w.fb)};
  });
  return {nodes:ns, wires:ws};
}
export function load(d){
  if (!d || !d.nodes || !d.nodes.length) return false;
  var g = graphOf(d);
  setKind(d.kind);
  S.nodes = g.nodes; S.wires = g.wires;
  /* chips kept with this build only (see setAreaScope in edit.js) — never carried
     over from whatever build was open before this one loaded */
  S.localAreas = (d.localAreas && typeof d.localAreas === "object") ? d.localAreas : {};
  S.seq = d.seq || S.nodes.length + S.wires.length + 2;
  S.pan = d.pan && typeof d.pan.x === "number" ? {x:d.pan.x, y:d.pan.y} : {x:0, y:0};
  S.zoom = typeof d.zoom === "number" ? clampZ(d.zoom) : S.ZDEF;
  clearPick(); S.cascade = 0; S.pend = null; S.marq = null; notify();
  reindex();
  return true;
}

/* ---------- storage ---------- */
var curT = 0;
export function saveCur(){
  clearTimeout(curT);
  if (Collab.active()) return;          /* a shared sheet keeps itself, on the server */
  curT = setTimeout(function(){
    try { localStorage.setItem(CURKEY(), JSON.stringify({doc:snapshot(), dirty:S.docDirty})); Auth.changed(); } catch (err) {}
  }, 400);
}
export function libRead(){
  try {
    var o = JSON.parse(localStorage.getItem(LIBKEY()) || "{}");
    return (o && typeof o === "object") ? o : {};
  } catch (err) { return {}; }
}
export function libWrite(o){
  try { localStorage.setItem(LIBKEY(), JSON.stringify(o)); Auth.changed(); return true; }
  catch (err) { return false; }
}

/* a name for a build: given, and not already taken by a different one */
export function nameErr(v, mine){
  if (!v) return "Give the build a name.";
  if (v !== mine && libRead()[v]) return "There's already a build called “" + v + "” — pick another name.";
  return "";
}

/* ---------- builds ---------- */
/* One build, one name, kept on this device. Save asks what to call it, with the
   name it has now filled in, so saving again is just Save then Enter. */
export function suggestName(){
  var lib = libRead(), i = 1;
  while (lib["Build " + i]) i++;
  return "Build " + i;
}
export function freeName(base){
  var lib = libRead(), name = base, i = 2;
  while (lib[name]) name = base + " " + (i++);
  return name;
}
export function store(){
  var lib = libRead(), d = snapshot();
  d.at = Date.now(); d.name = S.docName;
  lib[S.docName] = d;
  return libWrite(lib);
}
export function saveBuild(){
  if (!S.nodes.length){ flash("Nothing on the sheet to save yet."); return false; }
  if (S.testMode) setTest(false);
  if (Collab.active()){
    ask({title:"Save a copy", ok:"Save copy", value:freeName(S.docName || "Shared build"),
      msg:"A shared project saves itself for everyone as you work. This keeps a copy of it as it is now among your own builds.",
      check:function(v){ return nameErr(v, null); },
      done:function(v){
        var lib = libRead(), d = snapshot();
        delete d.rc; d.name = v; d.at = Date.now(); lib[v] = d;
        if (libWrite(lib)) flash("Saved a copy as \u201c" + v + "\u201d"); else flash("This browser refused to store the build.");
      }});
    return true;
  }
  ask({title:"Save build", ok:"Save", value:S.docName || suggestName(),
    msg:"What should this build be called? " + (Auth.cloud() ? "It is saved to your account" : "It is kept on this device") + " — rename, copy or delete it from Home.",
    check:function(v){ return nameErr(v, S.docName); },
    done:saveAs});
  return true;
}
/* Saving under a new name renames the build rather than leaving the old name
   behind as a second copy - Copy on the home page is for that. */
export function saveAs(name){
  var lib = libRead();
  if (S.docName && S.docName !== name && lib[S.docName]){ delete lib[S.docName]; libWrite(lib); }
  S.docName = name;
  if (!store()){ flash("This browser refused to store the build."); return false; }
  S.docDirty = false; notify(); saveCur();
  flash("Saved “" + S.docName + "”");
  return true;
}
/* Stepping off the sheet keeps it too, so nothing is dropped on the way to the
   home page or into another build. */
export function keepBuild(){
  if (Collab.active() || !S.docDirty || !S.nodes.length) return;
  if (!S.docName) S.docName = suggestName();
  if (store()){ S.docDirty = false; notify(); }
}
export function renameBuild(next){
  next = (next || "").trim().slice(0, 40);
  if (!next || next === S.docName){ notify(); return; }
  if (Collab.active()){
    Collab.rename(next).then(function(){ flash("Renamed the shared project to \u201c" + next + "\u201d"); },
      function(e){ notify(); flash(e.message); });
    return;
  }
  var lib = libRead(), was = S.docName;
  if (lib[next]){ flash("“" + next + "” is taken."); notify(); return; }
  if (lib[was]){ lib[was].name = next; lib[next] = lib[was]; delete lib[was]; libWrite(lib); }
  S.docName = next; notify(); saveCur();
  flash("Renamed to “" + next + "”");
}
/* Deleting the build that is open clears the sheet too, so it cannot slip back
   in under its old name the next time the sheet is kept. */
export function dropBuild(name, live){
  var lib = libRead();
  delete lib[name]; libWrite(lib);
  if (live || S.docName === name){
    if (S.testMode) setTest(false);
    S.nodes = []; S.wires = []; S.localAreas = {}; clearPick(); S.pend = null; S.wiring = null; S.marq = null;
    S.cascade = 0; S.pan = {x:0, y:0}; S.zoom = S.ZDEF; notify();
    S.docName = suggestName(); S.docDirty = false;
    reindex(); notify(); evaluate(); draw(); saveCur();
  }
  notify();
}
export function askRename(name, live){
  ask({title:"Rename build", ok:"Rename", value:name,
    check:function(v){ return nameErr(v, name); },
    done:function(v){
      var lib;
      if (v === name) return;
      if (live || name === S.docName) renameBuild(v);
      else {
        lib = libRead();
        if (lib[name]){ lib[v] = lib[name]; lib[v].name = v; delete lib[name]; libWrite(lib); }
        flash("Renamed to “" + v + "”");
      }
      notify();
    }});
}
export function copyBuild(name, live){
  var lib = libRead(), d = live ? snapshot() : lib[name], nm;
  if (!d) return;
  nm = freeName(name + " copy");
  d = JSON.parse(JSON.stringify(d)); d.name = nm; d.at = Date.now();
  lib[nm] = d;
  if (!libWrite(lib)){ flash("This browser refused to store the copy."); return; }
  notify();
  flash("Copied to “" + nm + "”");
}
export function askDelete(name, live){
  ask({title:"Delete build", ok:"Delete", danger:true,
    msg:"Delete “" + name + "”? This can't be undone.",
    done:function(){ dropBuild(name, live); flash("Deleted “" + name + "”"); }});
}
export function when(ts){
  var d = new Date(ts), now = new Date();
  var same = d.toDateString() === now.toDateString();
  return same ? d.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"})
              : d.toLocaleDateString([], {month:"short", day:"numeric"});
}
/* ---------- starting afresh ---------- */
/* A new build: first the question — classical or quantum? — then a bare sheet of
   that kind. No are-you-sure: the sheet being left is kept under its own name first. */
export function askNew(then){
  chooseKind(function(kind){
    newSheet(kind);
    if (then) then(kind);
  });
}
/* the example that suits the kind of build that is open */
export function exampleHere(){ if (S.docKind === "quantum") exampleQ(); else example(); }

/* ---------- seed ---------- */
/* Half adder: two switches into XOR (sum) and AND (carry). */
/* Leaving a shared project for a sheet of your own: what is unsent goes first.
   Returns true if a shared project was open. */
export function leaveShared(){
  if (!Collab.active()){ keepBuild(); return false; }
  Collab.stop();
  flash("Left the shared project \u00b7 it is on Home");
  return true;
}
export function example(){
  leaveShared(); setKind("classical");
  S.nodes = []; S.wires = []; S.seq = 1; S.localAreas = {}; S.pan = {x:0, y:0}; S.zoom = S.ZDEF; notify(); clearPick(); S.pend = null; S.cascade = 0;
  var a = addNode("SWITCH", 72, 96), b = addNode("SWITCH", 72, 204);
  var x = addNode("XOR", 228, 96), n = addNode("AND", 228, 204);
  var s = addNode("LAMP", 384, 102), cy = addNode("LAMP", 384, 210);
  a.l = "A"; b.l = "B"; s.l = "Sum"; cy.l = "Carry";
  a.s = 1;
  S.wires = [
    {id:"w1", a:a.id, b:x.id, p:0}, {id:"w2", a:b.id, b:x.id, p:1},
    {id:"w3", a:a.id, b:n.id, p:0}, {id:"w4", a:b.id, b:n.id, p:1},
    {id:"w5", a:x.id, b:s.id, p:0}, {id:"w6", a:n.id, b:cy.id, p:0}
  ];
  S.seq = 20; S.docName = freeName("Half adder"); S.docDirty = true;
  commit();
}
/* Counter: a clock stepping a 4-bit counter, read out on a hex display, with the
   carry lit at F — the program counter of a CPU, ticking. */
export function example2(){
  leaveShared(); setKind("classical");
  S.nodes = []; S.wires = []; S.seq = 1; S.localAreas = {}; S.pan = {x:0, y:0}; S.zoom = S.ZDEF; notify(); clearPick(); S.pend = null; S.cascade = 0;
  var k = addNode("CLOCK", 60, 168), c = addNode("CNT4", 168, 84);
  var d = addNode("HEXD", 324, 120), co = addNode("LAMP", 336, 228), i;
  k.l = "CLK"; co.l = "Carry";
  S.wires = [{id:"w1", a:k.id, q:0, b:c.id, p:6}, {id:"w6", a:c.id, q:4, b:co.id, p:0}];
  for (i = 0; i < 4; i++) S.wires.push({id:"w" + (i + 2), a:c.id, q:i, b:d.id, p:i});
  S.seq = 20; S.docName = freeName("Counter"); S.docDirty = true;
  commit();
}
