/* The home page: every build as a card, plus Back up all and Restore. */
"use strict";

/* ---------- home page ---------- */
/* Every build this browser holds, drawn small, so a session starts by picking
   one rather than by remembering what was on the sheet last time. */
/* A card's picture: the saved data drawn with the same part drawings the sheet
   uses, scaled to fit. Labels are left off — at card size they only smudge. */
function thumb(c, d){
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
  g.lineCap = "round"; g.strokeStyle = C.wire; g.lineWidth = Math.max(1.1, 1.8 * s) / s;
  for (i = 0; i < ws.length; i++){
    p1 = ws[i].a; p2 = ws[i].b;
    g.beginPath(); g.moveTo(p1.x, p1.y); g.lineTo(p2.x, p2.y); g.stroke();
  }
  for (i = 0; i < ns.length; i++) drawPart(g, ns[i], STUB);
  g.restore();
}
/* One card. The sheet already in hand gets the live card: it opens straight back
   into what is on screen, and carries the tag that says whether it is saved. */
function card(name, d, live){
  var el = document.createElement("div"), go = document.createElement("button"),
      pic = document.createElement("canvas"), nm = document.createElement("b"),
      mt = document.createElement("small"), tag, x;
  el.className = "card" + (live ? " now" : "");
  go.type = "button"; go.className = "go";
  nm.textContent = name;
  mt.textContent = (d.nodes ? d.nodes.length : 0) + " parts · " +
    (d.wires ? d.wires.length : 0) + " wires" + (!live && d.at ? " · " + when(d.at) : "");
  if (live){
    tag = document.createElement("i");
    tag.textContent = " · " + (docDirty ? "unsaved" : "open");
    mt.appendChild(tag);
  }
  go.appendChild(pic); go.appendChild(nm); go.appendChild(mt);
  var open = function(){ if (live) enterBench(); else openBuild(name); };
  go.addEventListener("click", open);
  el.appendChild(go);
  x = document.createElement("div"); x.className = "acts";
  var act = function(label, fn, cls){
    var b = document.createElement("button");
    b.type = "button"; b.textContent = label; b.title = label + " “" + name + "”";
    if (cls) b.className = cls;
    b.addEventListener("click", function(ev){ ev.stopPropagation(); fn(); });
    x.appendChild(b);
  };
  act("Open", open, "key");
  act("Rename", function(){ askRename(name, live); });
  act("Copy", function(){ copyBuild(name, live); });
  act("Delete", function(){ askDelete(name, live); }, "danger");
  el.appendChild(x);
  return {el:el, pic:pic, doc:d};
}
function renderHome(){
  var host = $("#cards"), lib = libRead(), names = Object.keys(lib), made = [], i, c;
  host.textContent = "";
  if (nodes.length){
    c = card(docName || "Untitled sheet", snapshot(), true);
    made.push(c); host.appendChild(c.el);
  }
  names.sort(function(a, b){ return (lib[b].at || 0) - (lib[a].at || 0); });
  for (i = 0; i < names.length; i++){
    /* the open sheet is already the first card — it is not listed twice */
    if (nodes.length && names[i] === docName) continue;
    c = card(names[i], lib[names[i]], false);
    made.push(c); host.appendChild(c.el);
  }
  /* the pictures last, once the cards have their width */
  for (i = 0; i < made.length; i++) thumb(made[i].pic, made[i].doc);
  $("#hBack").hidden = !nodes.length;
}
function homeShow(){
  ren.hidden = true;
  if (testMode) setTest(false);
  keepBuild();
  renderHome();
  $("#home").hidden = false;
}
function enterBench(){
  $("#home").hidden = true;
  sizeCanvas(); evaluate(); draw();
}
function openBuild(name){
  var d = libRead()[name];
  if (!d){ flash("No build called “" + name + "”."); return; }
  if (testMode) setTest(false);
  keepBuild();
  if (!load(d)){ flash("That build has no parts in it."); return; }
  docName = name; docDirty = false;
  nameChip(); evaluate(); draw(); saveCur(); enterBench();
  flash("Opened “" + name + "”");
}
/* A bare sheet under a fresh name. The sheet being left is kept first, so New
   never costs anything. */
function newSheet(){
  if (testMode) setTest(false);
  keepBuild();
  pushUndo();
  nodes = []; wires = []; clearPick(); pend = null; wiring = null; marq = null;
  cascade = 0; pan = {x:0, y:0}; zoom = ZDEF; zoomShow();
  docName = suggestName(); docDirty = false;
  reindex(); nameChip(); evaluate(); draw(); saveCur();
}
$("#btnHome").addEventListener("click", homeShow);
$("#hBack").addEventListener("click", enterBench);
$("#hNew").addEventListener("click", function(){
  newSheet(); enterBench();
  flash("New sheet · drag a part in from the rail");
});
$("#hEg").addEventListener("click", function(){ example(); enterBench(); });
$("#hEg2").addEventListener("click", function(){ example2(); enterBench(); });
/* Back up: every build in one file, for safe keeping or another device. */
$("#hSave").addEventListener("click", function(){
  keepBuild();
  var lib = libRead(), n = Object.keys(lib).length, a, blob;
  if (!n){ flash("No saved builds to back up yet."); return; }
  blob = new Blob([JSON.stringify({app:"logic-bench", v:1, builds:lib})], {type:"application/json"});
  a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "logic-bench-backup-" + new Date().toISOString().slice(0, 10) + ".json";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function(){ URL.revokeObjectURL(a.href); }, 4000);
  flash("Backed up " + n + " build" + (n === 1 ? "" : "s"));
});
/* Restore: builds from a backup join the ones here. A name already in use gets
   a number on the end; a build that is already here, unchanged, is skipped. */
$("#hLoad").addEventListener("click", function(){ $("#hFile").click(); });
$("#hFile").addEventListener("change", function(){
  var f = this.files && this.files[0], rd;
  this.value = "";
  if (!f) return;
  rd = new FileReader();
  rd.onload = function(){
    var o = null, got, lib = libRead(), n = 0, same = function(a, b){
      return JSON.stringify([a.nodes, a.wires]) === JSON.stringify([b.nodes, b.wires]);
    };
    try { o = JSON.parse(rd.result); } catch (err) {}
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
    renderHome();
    flash(n ? "Restored " + n + " build" + (n === 1 ? "" : "s") : "Everything in that file is already here.");
  };
  rd.readAsText(f);
});
