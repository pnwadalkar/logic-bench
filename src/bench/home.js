/* Between the home page and the sheet: opening a build, starting a new one, backing
   up and restoring, and the shared projects. The Home component draws the page. */
import { S, ask, chooseKind, flash, notify } from "./state.js";
import { Auth } from "./auth.js";
import { keepBuild, leaveShared, libRead, libWrite, load, saveCur, suggestName } from "./builds.js";
import { setTest } from "./cleaner.js";
import { Collab } from "./collab.js";
import { CURKEY, STUB, TYPES, box, inPort, outPort, setKind } from "./core.js";
import { pushUndo } from "./edit.js";
import { closeRename } from "./input.js";
import { draw, sizeCanvas } from "./render.js";
import { drawPart } from "./shapes.js";
import { clearPick, evaluate, reindex } from "./sim.js";

/* ---------- a build's picture ---------- */
/* A card's picture: the saved data drawn with the same part drawings the sheet
   uses, scaled to fit. Labels are left off — at card size they only smudge. */
export function thumb(c, d){
  var W = Math.max(60, c.clientWidth || 198), H = 118, r = Math.min(2, window.devicePixelRatio || 1);
  var g = c.getContext("2d"), i, b, p1, p2, s, pad = 11;
  var map = new Map(), lo = {x:Infinity, y:Infinity}, hi = {x:-Infinity, y:-Infinity}, any = false;
  c.width = Math.round(W * r); c.height = Math.round(H * r);
  g.setTransform(r, 0, 0, r, 0, 0);
  g.clearRect(0, 0, W, H);
  var seen = function(x, y, x2, y2){
    any = true;
    lo.x = Math.min(lo.x, x); lo.y = Math.min(lo.y, y);
    hi.x = Math.max(hi.x, x2); hi.y = Math.max(hi.y, y2);
  };
  var ns = (d.nodes || []).filter(function(n){ return n && n.id && TYPES[n.t]; })
    .map(function(n){ return {id:n.id, t:n.t, x:n.x, y:n.y, s:n.s | 0, c:n.c, m:n.m, v:0, l:"", iv:[]}; });
  if (!ns.length) return;
  for (i = 0; i < ns.length; i++){
    map.set(ns[i].id, ns[i]);
    b = box(ns[i]); seen(b.x, b.y, b.x + b.w, b.y + b.h);
  }
  var ws = (d.wires || []).map(function(w){
    var a = w.a ? map.get(w.a) : null, z = w.b ? map.get(w.b) : null;
    var q1 = a ? outPort(a, w.q) : (w.fa || null), q2 = z ? inPort(z, w.p | 0) : (w.fb || null);
    if (q1) seen(q1.x, q1.y, q1.x, q1.y);
    if (q2) seen(q2.x, q2.y, q2.x, q2.y);
    return (q1 && q2) ? {a:q1, b:q2} : null;
  }).filter(function(w){ return !!w; });
  if (!any) return;
  s = Math.min((W - pad * 2) / Math.max(1, hi.x - lo.x), (H - pad * 2) / Math.max(1, hi.y - lo.y), 0.8);
  g.save();
  g.translate((W - (hi.x - lo.x) * s) / 2 - lo.x * s, (H - (hi.y - lo.y) * s) / 2 - lo.y * s);
  g.scale(s, s);
  g.lineCap = "round"; g.strokeStyle = S.C.wire; g.lineWidth = Math.max(1.1, 1.8 * s) / s;
  for (i = 0; i < ws.length; i++){
    p1 = ws[i].a; p2 = ws[i].b;
    g.beginPath(); g.moveTo(p1.x, p1.y); g.lineTo(p2.x, p2.y); g.stroke();
  }
  for (i = 0; i < ns.length; i++) drawPart(g, ns[i], STUB);
  g.restore();
}

/* ---------- the home page and the sheet ---------- */
/* A session starts on the home page, with the sheet already standing behind it.
   Stepping off the sheet keeps it first, so nothing is dropped on the way. */
export function homeShow(){
  closeRename();
  if (S.testMode) setTest(false);
  keepBuild();
  S.homeOpen = true;
  notify();
  loadShared();
}
export function enterBench(){
  S.homeOpen = false;
  notify();
  sizeCanvas(); evaluate(); draw();
}
export function openBuild(name){
  var d = libRead()[name];
  if (!d){ flash("No build called “" + name + "”."); return; }
  if (S.testMode) setTest(false);
  leaveShared();
  if (!load(d)){ flash("That build has no parts in it."); return; }
  S.docName = name; S.docDirty = false;
  evaluate(); draw(); saveCur(); enterBench();
  flash("Opened “" + name + "”");
}
/* A bare sheet of the kind asked for, under a fresh name. The sheet being left is
   kept first, so New never costs anything. */
export function newSheet(kind){
  if (S.testMode) setTest(false);
  if (!leaveShared()) pushUndo();
  setKind(kind);
  S.nodes = []; S.wires = []; clearPick(); S.pend = null; S.wiring = null; S.marq = null;
  S.cascade = 0; S.pan = {x:0, y:0}; S.zoom = S.ZDEF;
  S.docName = suggestName(); S.docDirty = false;
  reindex(); evaluate(); draw(); saveCur();
}

/* ---------- back up and restore ---------- */
/* hand the browser a file to save */
export function download(name, text){
  var a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], {type:"application/json"}));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function(){ URL.revokeObjectURL(a.href); }, 4000);
}
/* Back up: every build in one file, for safe keeping or another device. */
export function backupAll(){
  keepBuild();
  var lib = libRead(), n = Object.keys(lib).length;
  if (!n){ flash("No saved builds to back up yet."); return; }
  download("logic-bench-backup-" + new Date().toISOString().slice(0, 10) + ".json",
    JSON.stringify({app:"logic-bench", v:1, builds:lib}));
  flash("Backed up " + n + " build" + (n === 1 ? "" : "s"));
}
/* Restore: builds from a backup join the ones here. A name already in use gets
   a number on the end; a build that is already here, unchanged, is skipped. */
export function restoreText(text){
  var o = null, got, lib = libRead(), n = 0, same = function(a, b){
    return JSON.stringify([a.nodes, a.wires]) === JSON.stringify([b.nodes, b.wires]);
  };
  try { o = JSON.parse(text); } catch (err) {}
  got = o && o.builds && typeof o.builds === "object" ? o.builds : (o && Array.isArray(o.nodes) ? {b:o} : null);
  if (!got){ flash("That file isn't a Logic Bench backup."); return; }
  Object.keys(got).forEach(function(k){
    var d = got[k], base, nm, i = 2;
    if (!d || !Array.isArray(d.nodes)) return;
    base = String(d.name || k).trim().slice(0, 40) || "Restored build"; nm = base;
    if (lib[nm] && same(lib[nm], d)) return;
    while (lib[nm]) nm = base + " " + (i++);
    d.name = nm; d.at = d.at || Date.now(); lib[nm] = d; n++;
  });
  if (!libWrite(lib)){ flash("This browser refused to store the builds."); return; }
  notify();
  flash(n ? "Restored " + n + " build" + (n === 1 ? "" : "s") : "Everything in that file is already here.");
}
/* read a file someone picked, and hand its text on */
export function readFile(file, then){
  var rd = new FileReader();
  rd.onload = function(){ then(String(rd.result)); };
  rd.readAsText(file);
}

/* ---------- shared projects ---------- */
/* Projects you build with other people. Each is one shared sheet. Invite with
   the code on its card, or join with someone's. */
export function loadShared(){
  if (!Auth.cloud()) return;
  Collab.list().then(function(l){ S.shared = {list:l, loaded:true, error:""}; notify(); },
    function(e){ S.shared = {list:S.shared.list, loaded:true, error:e.message}; notify(); });
}
/* Back to your own sheet after a shared one: the one you had before, or a bare one. */
export function backToMine(){
  var cur = null;
  try { cur = JSON.parse(localStorage.getItem(CURKEY()) || "null"); } catch (err) {}
  if (cur && cur.doc && load(cur.doc)){ S.docName = cur.doc.name || suggestName(); S.docDirty = !!cur.dirty; }
  else {
    setKind("classical");
    S.nodes = []; S.wires = []; clearPick(); S.pend = null; S.wiring = null; S.marq = null;
    S.pan = {x:0, y:0}; S.zoom = S.ZDEF; reindex();
    S.docName = suggestName(); S.docDirty = false;
  }
  evaluate(); draw();
}
export function inviteAsk(p){
  if (!p) return;
  var link = location.origin + location.pathname + "?join=" + p.code;
  ask({title:"Invite people", ok:"Copy link", value:link,
    msg:"Send this link — or the code " + p.code + ", to type into Join on their Home page. They sign in with their own Logic Bench account, and then they can see and change everything on this sheet.",
    done:function(){
      var ok = function(){ flash("Invite link copied · code " + p.code); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(ok, function(){ flash("Code " + p.code + " · copy the link from the box"); });
      else flash("Code " + p.code);
    }});
}
export function openShared(id){
  var p = Collab.project();
  if (p && p.id === id){ enterBench(); return; }
  if (S.testMode) setTest(false);
  keepBuild();
  flash("Opening…");
  Collab.open(id).then(function(pr){ enterBench(); flash("Opened “" + pr.name + "” · shared"); },
    function(e){ flash(e.message); loadShared(); });
}
/* A new shared project starts with the same question a build does. */
export function newShared(){
  chooseKind(function(kind){
    ask({title:"New shared " + kind + " project", ok:"Create", value:kind === "quantum" ? "Shared qubits" : "Shared CPU",
      msg:"An empty sheet that you and the people you invite all build on at once — one of you on the adder, another on the subtractor.",
      check:function(v){ return v ? "" : "Give it a name."; },
      done:function(v){
        if (S.testMode) setTest(false);
        keepBuild();
        Collab.create(v, false, kind).then(function(){ enterBench(); loadShared(); flash("“" + v + "” is ready · press Invite at the top to bring people in"); },
          function(e){ flash(e.message); });
      }});
  });
}
export function shareSheet(){
  if (!S.nodes.length || Collab.active()) return;
  ask({title:"Share this sheet", ok:"Share", value:S.docName || "Shared build",
    msg:"Makes a shared project that starts from the sheet you have open. Your own build stays as it is among your builds.",
    check:function(v){ return v ? "" : "Give it a name."; },
    done:function(v){
      if (S.testMode) setTest(false);
      keepBuild();
      Collab.create(v, true).then(function(){ enterBench(); loadShared(); flash("Shared as “" + v + "” · press Invite at the top to bring people in"); },
        function(e){ flash(e.message); });
    }});
}
/* Join with an invite code. The promise settles true if it worked. */
export function joinShared(code){
  if (S.testMode) setTest(false);
  keepBuild();
  return Collab.join(code).then(function(p){ enterBench(); loadShared(); flash("Joined “" + p.name + "”"); return true; },
    function(err){ flash(err.message); return false; });
}
/* the owner deletes a project for everyone; anyone else can only leave it */
export function askDeleteShared(p){
  var live = !!Collab.project() && Collab.project().id === p.id;
  ask({title:"Delete shared project", ok:"Delete", danger:true,
    msg:"Delete “" + p.name + "” for everyone in it? Nobody will be able to open it again. Save a copy first if you want to keep it.",
    done:function(){
      Collab.remove(p.id).then(function(){ if (live) backToMine(); flash("Deleted “" + p.name + "”"); loadShared(); },
        function(e){ flash(e.message); });
    }});
}
export function askQuitShared(p){
  var live = !!Collab.project() && Collab.project().id === p.id;
  ask({title:"Leave shared project", ok:"Leave", danger:true,
    msg:"Leave “" + p.name + "”? It stays for the others, and you can join again with its code.",
    done:function(){
      Collab.leave(p.id).then(function(){ if (live) backToMine(); flash("Left “" + p.name + "”"); loadShared(); },
        function(e){ flash(e.message); });
    }});
}
/* Who is on this sheet with you, yourself first: the strip in the top bar. */
export function crewList(){
  var me = Auth.current(), list = me ? [{name:me.name + " (you)", color:me.color}] : [], seen = {};
  Collab.peers().forEach(function(h){
    if (seen[h.u] || (me && h.u === me.id)) return;
    seen[h.u] = 1; list.push({name:h.name, color:h.color});
  });
  return list;
}
/* Something about the shared project changed. If it is gone — deleted, or you
   were taken out of it — it is back to your own sheet, on the home page. */
export function onCrewChange(){
  if (Collab.active() && Collab.status() === "gone"){ Collab.stop(); backToMine(); homeShow(); return; }
  notify();
}
