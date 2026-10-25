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
  item($("#setT"), "POINT", "Point", pointIcon(), spawn("POINT"));
  /* a mode, so a finger can box in a region too — a finger otherwise pans */
  item($("#setT"), "REGION", "Region", regionIcon(), function(e){
    e.preventDefault(); if (!testMode) setRegionMode(!regionMode);
  }, "Drag a box round part of the circuit to pick it up (R), then Ctrl+C and Ctrl+V — Shift and drag does this without leaving the cursor");
  /* Copy and cut are on the bar that rides over the picked area; Paste is a
     tool, because a copy has to be put somewhere and the pointer says where. */
  item($("#setT"), "PASTE", "Paste", pasteIcon(), function(e){
    e.preventDefault(); if (!testMode) setPasteMode(!pasteMode);
  }, "Put the copied area down where you click (P) — Ctrl+V drops it under the pointer instead");
  item($("#setT"), "CLEAN", "Cleaner", cleanIcon(), function(e){
    e.preventDefault(); cleanUp();
  }, "Cleaner looks: lay the circuit out in columns, keep the inputs in the order you drew them, gather the lamps in one column down the right-hand edge, straighten every wire, square the corners and squeeze out the dead space (C)");
  var mk = function(host, list){
    host.textContent = "";
    list.forEach(function(t){ item(host, t, TYPES[t].n, railIcon(t), spawn(t)); });
  };
  mk($("#setIO"), IO); mk($("#setG"), GATES);
  markTool();
}
