/* The parts rail — a column down the left on a laptop, a console along the bottom on a tablet. */
"use strict";

/* ---------- parts rail ---------- */
/* an arrow pointer — the plain select tool */
function cursorIcon(){
  var c = document.createElement("canvas"), g, x = 19, y = 7;
  c.width = 100; c.height = 68; c.style.width = "50px"; c.style.height = "34px";
  g = c.getContext("2d"); g.setTransform(2, 0, 0, 2, 0, 0);
  g.lineWidth = 1.4; g.lineJoin = "round"; g.lineCap = "round";
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x + 12, y + 17);
  g.lineTo(x + 5.2, y + 16.4);
  g.lineTo(x + 2.4, y + 22.6);
  g.closePath();
  g.fillStyle = C.line; g.fill();
  g.strokeStyle = C.line; g.stroke();
  return c;
}
function wireIcon(){
  var c = document.createElement("canvas"), g;
  c.width = 100; c.height = 68; c.style.width = "50px"; c.style.height = "34px";
  g = c.getContext("2d"); g.setTransform(2, 0, 0, 2, 0, 0);
  g.lineWidth = 1.8; g.lineCap = "round"; g.strokeStyle = C.wire;
  g.beginPath(); g.moveTo(10, 24); g.lineTo(40, 10); g.stroke();
  g.fillStyle = C.sel;
  g.beginPath(); g.arc(10, 24, 3, 0, 7); g.fill();
  g.beginPath(); g.arc(40, 10, 3, 0, 7); g.fill();
  return c;
}
/* three wires meeting one dot — a branch and a right-angle turn in one glyph */
function pointIcon(){
  var c = document.createElement("canvas"), g, cx = 25, cy = 17;
  c.width = 100; c.height = 68; c.style.width = "50px"; c.style.height = "34px";
  g = c.getContext("2d"); g.setTransform(2, 0, 0, 2, 0, 0);
  g.lineWidth = 1.8; g.lineCap = "round"; g.strokeStyle = C.wire;
  g.beginPath();
  g.moveTo(8, cy); g.lineTo(cx, cy);
  g.moveTo(cx, cy); g.lineTo(cx, 5);
  g.moveTo(cx, cy); g.lineTo(42, 29);
  g.stroke();
  g.beginPath(); g.arc(cx, cy, 4.5, 0, 7);
  g.fillStyle = C.line; g.fill();
  g.strokeStyle = C.line; g.lineWidth = 1.2; g.stroke();
  return c;
}
/* a slack diagonal run alongside the square one it becomes */
function cleanIcon(){
  var c = document.createElement("canvas"), g;
  c.width = 100; c.height = 68; c.style.width = "50px"; c.style.height = "34px";
  g = c.getContext("2d"); g.setTransform(2, 0, 0, 2, 0, 0);
  g.lineWidth = 1.6; g.lineCap = "round";
  g.strokeStyle = C.grid; g.setLineDash([2.5, 2.5]);
  g.beginPath(); g.moveTo(8, 26); g.lineTo(42, 8); g.stroke();
  g.setLineDash([]);
  g.strokeStyle = C.accent; g.lineWidth = 1.9;
  g.beginPath(); g.moveTo(8, 17); g.lineTo(27, 17); g.lineTo(27, 8); g.lineTo(42, 8); g.stroke();
  g.fillStyle = C.accent;
  g.beginPath(); g.arc(27, 17, 2.6, 0, 7); g.fill();
  return c;
}
/* a band drawn round two parts — the region tool */
function regionIcon(){
  var c = document.createElement("canvas"), g;
  c.width = 100; c.height = 68; c.style.width = "50px"; c.style.height = "34px";
  g = c.getContext("2d"); g.setTransform(2, 0, 0, 2, 0, 0);
  g.lineWidth = 1.6; g.lineCap = "round"; g.strokeStyle = C.wire;
  g.beginPath(); g.moveTo(14, 13); g.lineTo(26, 13); g.moveTo(14, 22); g.lineTo(26, 22); g.stroke();
  g.fillStyle = C.line;
  g.fillRect(26, 9.5, 9, 7); g.fillRect(26, 18.5, 9, 7);
  g.strokeStyle = C.accent; g.lineWidth = 1.2; g.setLineDash([3, 2.5]);
  g.strokeRect(9.5, 5.5, 31, 23); g.setLineDash([]);
  return c;
}
/* one box ghosted, one solid and landing — the copy about to be put down */
function pasteIcon(){
  var c = document.createElement("canvas"), g;
  c.width = 100; c.height = 68; c.style.width = "50px"; c.style.height = "34px";
  g = c.getContext("2d"); g.setTransform(2, 0, 0, 2, 0, 0);
  g.lineWidth = 1.2; g.lineJoin = "round";
  g.strokeStyle = C.wire; g.setLineDash([3, 2.5]);
  g.strokeRect(8.5, 5.5, 18, 14); g.setLineDash([]);
  g.fillStyle = C.body; g.strokeStyle = C.accent; g.lineWidth = 1.4;
  roundRect(g, 18.5, 14.5, 18, 14, 2.5); g.fill(); g.stroke();
  g.strokeStyle = C.line; g.lineCap = "round";
  g.beginPath(); g.moveTo(23, 21.5); g.lineTo(32, 21.5); g.moveTo(27.5, 17); g.lineTo(27.5, 26); g.stroke();
  return c;
}
function railIcon(t){
  var c = document.createElement("canvas"), g, w = 34, h = 22, x = 8, y = 6, s = 7, d = TYPES[t], save, fake;
  c.width = 100; c.height = 68; c.style.width = "50px"; c.style.height = "34px";
  g = c.getContext("2d"); g.setTransform(2, 0, 0, 2, 0, 0);
  if (d.k === "sw" || d.k === "btn" || d.k === "lamp"){
    save = {w:d.w, h:d.h};
    d.w = d.k === "sw" ? 30 : 20; d.h = d.k === "sw" ? 18 : 20;
    fake = {t:t, x:x + (d.k === "lamp" ? 6 : 2), y:(34 - d.h) / 2, v:0, s:0, l:"", iv:[]};
    drawPart(g, fake, s);
    d.w = save.w; d.h = save.h;
  } else if (d.k === "chip"){
    chipIcon(g, t);
  } else if (d.k === "qmulti"){
    qMultiIcon(g, d);
  } else if (DRAW[d.k]){
    /* a component drawn as it is on the sheet, shrunk to fit the tile */
    var lead = (d.ins ? s : 0) + s, k = Math.min(1, 42 / (d.w + lead), 28 / d.h);
    fake = {t:t, x:0, y:0, v:0, s:t === "CLOCK" ? 1 : 0, l:"", iv:[], m:t === "CAP" ? 0.6 : 0};
    g.translate((50 - (d.w + lead) * k) / 2 + (d.ins ? s * k : 0), (34 - d.h * k) / 2);
    g.scale(k, k);
    drawPart(g, fake, s);
  } else {
    drawGate(g, t, x, y, w, h, s, null, 0);
  }
  return c;
}
function buildRail(){
  var item = function(host, t, label, icon, onDown, tip){
    var el = document.createElement("div"), sp = document.createElement("span");
    el.className = "part"; el.title = tip || label; el.dataset.t = t;
    el.appendChild(icon);
    sp.textContent = label; el.appendChild(sp);
    el.addEventListener("pointerdown", onDown);
    host.appendChild(el);
  };
  $("#setT").textContent = "";
  item($("#setT"), "SELECT", "Cursor", cursorIcon(), function(e){
    e.preventDefault(); setSelectMode();
  }, "Click a part to pick it up, drag the bare sheet to move the sheet — a circuit can run well past the edge of the window");
  item($("#setT"), "WIRE", "Wire", wireIcon(), function(e){
    e.preventDefault(); if (!testMode) setWireMode(!wireMode);
  });
  var spawn = function(t){
    return function(e){
      e.preventDefault();
      if (testMode) return;
      setWireMode(false);
      if (pasteMode) setPasteMode(false);
      var p = toWorld(e), d = TYPES[t];
      var n = addNode(t, p.x - d.w / 2, p.y - d.h / 2);
      pickOne("n", n.id);
      drag = {id:n.id, off:[{o:n, dx:d.w / 2, dy:d.h / 2}], moved:true, spawn:true};
      evaluate(); draw();
    };
  };
  if (docKind !== "quantum") item($("#setT"), "POINT", "Point", pointIcon(), spawn("POINT"));
  /* a mode, so a finger can box in a region too — a finger otherwise pans */
  item($("#setT"), "REGION", "Region", regionIcon(), function(e){
    e.preventDefault(); if (!testMode) setRegionMode(!regionMode);
  }, "Drag a box round part of the circuit to pick it up (R), then Ctrl+C and Ctrl+V — Shift and drag does this without leaving the cursor");
  /* Copy and cut are on the bar that rides over the picked area; Paste is a
     tool, because a copy has to be put somewhere and the pointer says where. */
  item($("#setT"), "PASTE", "Paste", pasteIcon(), function(e){
    e.preventDefault(); if (!testMode) setPasteMode(!pasteMode);
  }, "Put the copied area down where you click (P) — Ctrl+V drops it under the pointer instead");
  if (docKind !== "quantum") item($("#setT"), "CLEAN", "Cleaner", cleanIcon(), function(e){
    e.preventDefault(); cleanUp();
  }, "Cleaner looks: lay the circuit out in columns, keep the inputs in the order you drew them, gather the lamps in one column down the right-hand edge, straighten every wire, square the corners and squeeze out the dead space (C)");
  /* The parts come in families, one tab each, so the rail stays short enough to
     take in at a glance however many kinds of part there are. */
  var cats = $("#cats"), set = $("#setP");
  var show = function(k){
    railCat = k;
    try { localStorage.setItem(catKey(), String(k)); } catch (err) {}
    Array.prototype.forEach.call(cats.children, function(b, i){
      b.classList.toggle("on", i === k); b.setAttribute("aria-selected", i === k ? "true" : "false");
    });
    set.textContent = "";
    if (CATS[k].u){ shelf(set, item); return; }
    CATS[k].t.forEach(function(t){ item(set, t, TYPES[t].n, railIcon(t), spawn(t), TYPES[t].tip); });
  };
  cats.textContent = "";
  CATS.forEach(function(g, i){
    var b = document.createElement("button");
    b.type = "button"; b.className = "cat"; b.textContent = g.n;
    b.setAttribute("role", "tab");
    b.addEventListener("click", function(){ show(i); });
    cats.appendChild(b);
  });
  show(railCat >= 0 && railCat < CATS.length ? railCat : 0);
  markTool();
}
/* The Electronics tab: the chips you saved, oldest first — each a small black chip
   with its name on it. It starts empty. */
function shelf(set, item){
  var names = areaNames(), p;
  if (!names.length){
    p = document.createElement("p"); p.className = "empty";
    p.textContent = "Empty. Box in a circuit with Region, then press Save on the bar over it — it becomes a black chip here, its switches the inputs and its lamps the outputs.";
    set.appendChild(p);
    return;
  }
  names.forEach(function(name){
    var key = areaKey(name);
    if (!key) return;
    item(set, "AREA", name, railIcon(key), function(e){
      e.preventDefault(); spawnArea(name, e);
    }, TYPES[key].tip + " — drag it onto the sheet");
    var el = set.lastChild, x = document.createElement("button");
    x.type = "button"; x.className = "x"; x.textContent = "✕";
    x.title = "Delete “" + name + "”"; x.setAttribute("aria-label", "Delete the saved chip " + name);
    x.addEventListener("pointerdown", function(e){ e.stopPropagation(); });
    x.addEventListener("click", function(e){ e.stopPropagation(); askDeleteArea(name); });
    el.appendChild(x);
  });
}
/* which tab the console is on (railCat, declared in core.js), remembered per kind of build */
try { railCat = parseInt(localStorage.getItem(catKey()) || "0", 10) || 0; } catch (err) {}
