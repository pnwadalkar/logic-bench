/* The drawings on the tiles of the parts console. Each takes the tile's canvas
   and draws on it; the Rail component makes the tiles. */
import { S } from "./state.js";
import { DRAW, TYPES } from "./core.js";
import { qMultiIcon } from "./quantum.js";
import { drawGate, drawPart, roundRect } from "./shapes.js";
import { chipIcon } from "./symbols.js";

/* A tile's canvas, cleared and scaled so an icon is drawn in a 50 × 34 box. */
export function iconCtx(c){
  var g = c.getContext("2d");
  c.width = 100; c.height = 68;
  g.setTransform(2, 0, 0, 2, 0, 0);
  g.clearRect(0, 0, 50, 34);
  return g;
}
/* an arrow pointer — the plain select tool */
export function cursorIcon(c){
  var g, x = 19, y = 7;
  g = iconCtx(c);
  g.lineWidth = 1.4; g.lineJoin = "round"; g.lineCap = "round";
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x + 12, y + 17);
  g.lineTo(x + 5.2, y + 16.4);
  g.lineTo(x + 2.4, y + 22.6);
  g.closePath();
  g.fillStyle = S.C.line; g.fill();
  g.strokeStyle = S.C.line; g.stroke();
}
export function wireIcon(c){
  var g;
  g = iconCtx(c);
  g.lineWidth = 1.8; g.lineCap = "round"; g.strokeStyle = S.C.wire;
  g.beginPath(); g.moveTo(10, 24); g.lineTo(40, 10); g.stroke();
  g.fillStyle = S.C.sel;
  g.beginPath(); g.arc(10, 24, 3, 0, 7); g.fill();
  g.beginPath(); g.arc(40, 10, 3, 0, 7); g.fill();
}
/* three wires meeting one dot — a branch and a right-angle turn in one glyph */
export function pointIcon(c){
  var g, cx = 25, cy = 17;
  g = iconCtx(c);
  g.lineWidth = 1.8; g.lineCap = "round"; g.strokeStyle = S.C.wire;
  g.beginPath();
  g.moveTo(8, cy); g.lineTo(cx, cy);
  g.moveTo(cx, cy); g.lineTo(cx, 5);
  g.moveTo(cx, cy); g.lineTo(42, 29);
  g.stroke();
  g.beginPath(); g.arc(cx, cy, 4.5, 0, 7);
  g.fillStyle = S.C.line; g.fill();
  g.strokeStyle = S.C.line; g.lineWidth = 1.2; g.stroke();
}
/* a slack diagonal run alongside the square one it becomes */
export function cleanIcon(c){
  var g;
  g = iconCtx(c);
  g.lineWidth = 1.6; g.lineCap = "round";
  g.strokeStyle = S.C.grid; g.setLineDash([2.5, 2.5]);
  g.beginPath(); g.moveTo(8, 26); g.lineTo(42, 8); g.stroke();
  g.setLineDash([]);
  g.strokeStyle = S.C.accent; g.lineWidth = 1.9;
  g.beginPath(); g.moveTo(8, 17); g.lineTo(27, 17); g.lineTo(27, 8); g.lineTo(42, 8); g.stroke();
  g.fillStyle = S.C.accent;
  g.beginPath(); g.arc(27, 17, 2.6, 0, 7); g.fill();
}
/* a band drawn round two parts — the region tool */
export function regionIcon(c){
  var g;
  g = iconCtx(c);
  g.lineWidth = 1.6; g.lineCap = "round"; g.strokeStyle = S.C.wire;
  g.beginPath(); g.moveTo(14, 13); g.lineTo(26, 13); g.moveTo(14, 22); g.lineTo(26, 22); g.stroke();
  g.fillStyle = S.C.line;
  g.fillRect(26, 9.5, 9, 7); g.fillRect(26, 18.5, 9, 7);
  g.strokeStyle = S.C.accent; g.lineWidth = 1.2; g.setLineDash([3, 2.5]);
  g.strokeRect(9.5, 5.5, 31, 23); g.setLineDash([]);
}
/* one box ghosted, one solid and landing — the copy about to be put down */
export function pasteIcon(c){
  var g;
  g = iconCtx(c);
  g.lineWidth = 1.2; g.lineJoin = "round";
  g.strokeStyle = S.C.wire; g.setLineDash([3, 2.5]);
  g.strokeRect(8.5, 5.5, 18, 14); g.setLineDash([]);
  g.fillStyle = S.C.body; g.strokeStyle = S.C.accent; g.lineWidth = 1.4;
  roundRect(g, 18.5, 14.5, 18, 14, 2.5); g.fill(); g.stroke();
  g.strokeStyle = S.C.line; g.lineCap = "round";
  g.beginPath(); g.moveTo(23, 21.5); g.lineTo(32, 21.5); g.moveTo(27.5, 17); g.lineTo(27.5, 26); g.stroke();
}
export function railIcon(c, t){
  var g, w = 34, h = 22, x = 8, y = 6, s = 7, d = TYPES[t], save, fake;
  g = iconCtx(c);
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
}
