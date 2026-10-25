/* Builds: plain-data snapshots, storage on this device, the dialog, the toolbar and the example. */
"use strict";

/* ---------- build model <-> plain data ---------- */
function snapshot(){
  return {
    v:1, name:docName,
    nodes:nodes.map(function(n){ return {id:n.id, t:n.t, x:n.x, y:n.y, s:n.s, l:n.l}; }),
    wires:wires.map(function(w){
      return {id:w.id, a:w.a || null, b:w.b || null, p:w.p, fa:w.fa || null, fb:w.fb || null};
    }),
    seq:seq, pan:{x:pan.x, y:pan.y}, zoom:zoom
  };
}
function load(d){
  if (!d || !d.nodes || !d.nodes.length) return false;
  var ids = {};
  nodes = d.nodes.filter(function(n){ return n && n.id && TYPES[n.t]; }).map(function(n){
    ids[n.id] = 1;
    return {id:n.id, t:n.t, x:+n.x || 0, y:+n.y || 0, v:0, s:n.s ? 1 : 0, l:n.l || "", iv:[]};
  });
  var pt = function(o){ return o && typeof o.x === "number" ? {x:+o.x, y:+o.y} : null; };
  wires = (d.wires || []).filter(function(w){
    if (!w) return false;
    return !!((w.a ? ids[w.a] : pt(w.fa)) && (w.b ? ids[w.b] : pt(w.fb)));
  }).map(function(w, i){
    return {id:w.id || ("w" + (i + 1) + "r"), a:w.a || null, b:w.b || null, p:w.p | 0,
      fa:w.a ? null : pt(w.fa), fb:w.b ? null : pt(w.fb)};
  });
  seq = d.seq || nodes.length + wires.length + 2;
  pan = d.pan && typeof d.pan.x === "number" ? {x:d.pan.x, y:d.pan.y} : {x:0, y:0};
  zoom = typeof d.zoom === "number" ? clampZ(d.zoom) : ZDEF;
  clearPick(); cascade = 0; pend = null; marq = null; zoomShow();
  reindex();
  return true;
}

/* ---------- storage ---------- */
var curT = 0;
function saveCur(){
  clearTimeout(curT);
  curT = setTimeout(function(){
    try { localStorage.setItem(CURKEY, JSON.stringify({doc:snapshot(), dirty:docDirty})); } catch (err) {}
  }, 400);
}
function libRead(){
  try {
    var o = JSON.parse(localStorage.getItem(LIBKEY) || "{}");
    return (o && typeof o === "object") ? o : {};
  } catch (err) { return {}; }
}
function libWrite(o){
  try { localStorage.setItem(LIBKEY, JSON.stringify(o)); return true; }
  catch (err) { return false; }
}

/* ---------- the dialog ---------- */
/* One small dialog for the questions builds need: a name to save or rename under,
   or a yes before something is deleted. check() returns an error to show, with
   the dialog left open, or nothing, and then done() runs. */
var dlgDo = null, dlgCheck = null;
function ask(o){
  var inp = $("#dlgIn");
  $("#dlgT").textContent = o.title;
  $("#dlgM").textContent = o.msg || "";
  $("#dlgErr").textContent = "";
  $("#dlgOk").textContent = o.ok || "OK";
  $("#dlgOk").className = o.danger ? "danger" : "key";
  inp.hidden = o.value === undefined;
  inp.value = o.value || "";
  dlgCheck = o.check || null; dlgDo = o.done || null;
  $("#dlg").hidden = false;
  if (!inp.hidden){ inp.focus(); inp.select(); } else $("#dlgOk").focus();
}
function dlgClose(){ $("#dlg").hidden = true; dlgDo = dlgCheck = null; }
$("#dlgBox").addEventListener("submit", function(e){
  e.preventDefault();
  var v = $("#dlgIn").hidden ? null : $("#dlgIn").value.trim().slice(0, 40), err, fn = dlgDo;
  if (dlgCheck){ err = dlgCheck(v); if (err){ $("#dlgErr").textContent = err; return; } }
  dlgClose();
  if (fn) fn(v);
});
$("#dlgNo").addEventListener("click", dlgClose);
$("#dlg").addEventListener("click", function(e){ if (e.target === this) dlgClose(); });
/* the dialog keeps its keys to itself, so typing a name never drives the sheet */
$("#dlg").addEventListener("keydown", function(e){
  if (e.key === "Escape") dlgClose();
  e.stopPropagation();
});
/* a name for a build: given, and not already taken by a different one */
function nameErr(v, mine){
  if (!v) return "Give the build a name.";
  if (v !== mine && libRead()[v]) return "There's already a build called “" + v + "” — pick another name.";
  return "";
}

/* ---------- builds ---------- */
/* One build, one name, kept on this device. Save asks what to call it, with the
   name it has now filled in, so saving again is just Save then Enter. */
function suggestName(){
  var lib = libRead(), i = 1;
  while (lib["Build " + i]) i++;
  return "Build " + i;
}
function freeName(base){
  var lib = libRead(), name = base, i = 2;
  while (lib[name]) name = base + " " + (i++);
  return name;
}
function store(){
  var lib = libRead(), d = snapshot();
  d.at = Date.now(); d.name = docName;
  lib[docName] = d;
  return libWrite(lib);
}
function saveBuild(){
  if (!nodes.length){ flash("Nothing on the sheet to save yet."); return false; }
  if (testMode) setTest(false);
  ask({title:"Save build", ok:"Save", value:docName || suggestName(),
    msg:"What should this build be called? It is kept on this device — rename, copy or delete it from Home.",
    check:function(v){ return nameErr(v, docName); },
    done:saveAs});
  return true;
}
/* Saving under a new name renames the build rather than leaving the old name
   behind as a second copy - Copy on the home page is for that. */
function saveAs(name){
  var lib = libRead();
  if (docName && docName !== name && lib[docName]){ delete lib[docName]; libWrite(lib); }
  docName = name;
  if (!store()){ flash("This browser refused to store the build."); return false; }
  docDirty = false; nameChip(); saveCur();
  flash("Saved “" + docName + "”");
  return true;
}
/* Stepping off the sheet keeps it too, so nothing is dropped on the way to the
   home page or into another build. */
function keepBuild(){
  if (!docDirty || !nodes.length) return;
  if (!docName) docName = suggestName();
  if (store()){ docDirty = false; nameChip(); }
}
function renameBuild(next){
  next = (next || "").trim().slice(0, 40);
  if (!next || next === docName){ nameChip(); return; }
  var lib = libRead(), was = docName;
  if (lib[next]){ flash("“" + next + "” is taken."); nameChip(); return; }
  if (lib[was]){ lib[was].name = next; lib[next] = lib[was]; delete lib[was]; libWrite(lib); }
  docName = next; nameChip(); saveCur();
  flash("Renamed to “" + next + "”");
}
/* Deleting the build that is open clears the sheet too, so it cannot slip back
   in under its old name the next time the sheet is kept. */
function dropBuild(name, live){
  var lib = libRead();
  delete lib[name]; libWrite(lib);
  if (live || docName === name){
    if (testMode) setTest(false);
    nodes = []; wires = []; clearPick(); pend = null; wiring = null; marq = null;
    cascade = 0; pan = {x:0, y:0}; zoom = ZDEF; zoomShow();
    docName = suggestName(); docDirty = false;
    reindex(); nameChip(); evaluate(); draw(); saveCur();
  }
  renderHome();
}
function askRename(name, live){
  ask({title:"Rename build", ok:"Rename", value:name,
    check:function(v){ return nameErr(v, name); },
    done:function(v){
      var lib;
      if (v === name) return;
      if (live || name === docName) renameBuild(v);
      else {
        lib = libRead();
        if (lib[name]){ lib[v] = lib[name]; lib[v].name = v; delete lib[name]; libWrite(lib); }
        flash("Renamed to “" + v + "”");
      }
      renderHome();
    }});
}
function copyBuild(name, live){
  var lib = libRead(), d = live ? snapshot() : lib[name], nm;
  if (!d) return;
  nm = freeName(name + " copy");
  d = JSON.parse(JSON.stringify(d)); d.name = nm; d.at = Date.now();
  lib[nm] = d;
  if (!libWrite(lib)){ flash("This browser refused to store the copy."); return; }
  renderHome();
  flash("Copied to “" + nm + "”");
}
function askDelete(name, live){
  ask({title:"Delete build", ok:"Delete", danger:true,
    msg:"Delete “" + name + "”? This can't be undone.",
    done:function(){ dropBuild(name, live); flash("Deleted “" + name + "”"); }});
}
function when(ts){
  var d = new Date(ts), now = new Date();
  var same = d.toDateString() === now.toDateString();
  return same ? d.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"})
              : d.toLocaleDateString([], {month:"short", day:"numeric"});
}
/* A short confirmation over the sheet. */
var flashT = 0;
function flash(msg){
  var el = $("#toast"), host = $("#home").hidden ? $("#stage") : document.body;
  if (el.parentNode !== host) host.appendChild(el);
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(flashT);
  flashT = setTimeout(function(){ el.classList.remove("show"); }, 2600);
}

/* ---------- toolbar ---------- */
$("#btnSave").addEventListener("click", saveBuild);
$("#btnDel").addEventListener("click", removeSel);
$("#btnClean").addEventListener("click", function(){ cleanUp(); });
$("#btnTest").addEventListener("click", function(){ setTest(!testMode); });
$("#btnEg").addEventListener("click", function(){ example(); });
/* The name in the bar is the build's name: type over it to rename the build. */
$("#docname").addEventListener("keydown", function(e){
  if (e.key === "Enter"){ this.blur(); return; }
  if (e.key === "Escape"){ nameChip(); this.blur(); }
});
$("#docname").addEventListener("change", function(){ renameBuild(this.value); });

/* No are-you-sure: the sheet being left is kept under its own name first. */
$("#btnNew").addEventListener("click", function(){
  newSheet();
  flash("New sheet — “" + docName + "”");
});


/* ---------- seed ---------- */
/* Half adder: two switches into XOR (sum) and AND (carry). */
function example(){
  keepBuild();
  nodes = []; wires = []; seq = 1; pan = {x:0, y:0}; zoom = ZDEF; zoomShow(); clearPick(); pend = null; cascade = 0;
  var a = addNode("SWITCH", 72, 96), b = addNode("SWITCH", 72, 204);
  var x = addNode("XOR", 228, 96), n = addNode("AND", 228, 204);
  var s = addNode("LAMP", 384, 102), cy = addNode("LAMP", 384, 210);
  a.l = "A"; b.l = "B"; s.l = "Sum"; cy.l = "Carry";
  a.s = 1;
  wires = [
    {id:"w1", a:a.id, b:x.id, p:0}, {id:"w2", a:b.id, b:x.id, p:1},
    {id:"w3", a:a.id, b:n.id, p:0}, {id:"w4", a:b.id, b:n.id, p:1},
    {id:"w5", a:x.id, b:s.id, p:0}, {id:"w6", a:n.id, b:cy.id, p:0}
  ];
  seq = 20; docName = freeName("Half adder"); docDirty = true;
  commit();
}
