/* Drawing the parts: gate bodies, switches, buttons and lamps. */
"use strict";

/* ---------- shapes ---------- */
function bodyPath(c, t, x, y, w, h){
  var d = TYPES[t], bw = d.inv ? w - 11 : w, r = h / 2;
  c.beginPath();
  if (d.k === "and"){
    c.moveTo(x, y); c.lineTo(x + bw - r, y);
    c.arc(x + bw - r, y + r, r, -Math.PI / 2, Math.PI / 2);
    c.lineTo(x, y + h); c.closePath();
  } else if (d.k === "or" || d.k === "xor"){
    c.moveTo(x, y);
    c.quadraticCurveTo(x + bw * 0.62, y, x + bw, y + r);
    c.quadraticCurveTo(x + bw * 0.62, y + h, x, y + h);
    c.quadraticCurveTo(x + bw * 0.3, y + r, x, y); c.closePath();
  } else {
    c.moveTo(x, y); c.lineTo(x + bw, y + r); c.lineTo(x, y + h); c.closePath();
  }
}
function roundRect(c, x, y, w, h, r){
  c.beginPath();
  c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.arcTo(x + w, y, x + w, y + r, r);
  c.lineTo(x + w, y + h - r); c.arcTo(x + w, y + h, x + w - r, y + h, r);
  c.lineTo(x + r, y + h); c.arcTo(x, y + h, x, y + h - r, r);
  c.lineTo(x, y + r); c.arcTo(x, y, x + r, y, r); c.closePath();
}
function drawGate(c, t, x, y, w, h, stub, iv, ov){
  var d = TYPES[t], bw = d.inv ? w - 11 : w, i, py;
  c.lineWidth = 1.6; c.lineJoin = "round"; c.lineCap = "round";
  for (i = 0; i < d.ins; i++){
    py = y + h * (i + 1) / (d.ins + 1);
    c.strokeStyle = (iv && iv[i]) ? C.hot : C.wire;
    c.beginPath(); c.moveTo(x - stub, py); c.lineTo(x, py); c.stroke();
  }
  c.strokeStyle = ov ? C.hot : C.wire;
  c.beginPath(); c.moveTo(x + w, y + h / 2); c.lineTo(x + w + stub, y + h / 2); c.stroke();
  c.strokeStyle = C.line; c.fillStyle = C.body;
  bodyPath(c, t, x, y, w, h); c.fill(); c.stroke();
  if (d.inv){
    c.beginPath(); c.arc(x + bw + 5, y + h / 2, 5, 0, 7);
    c.fillStyle = C.body; c.fill(); c.stroke();
  }
  if (d.k === "xor"){
    c.beginPath(); c.moveTo(x - 5, y);
    c.quadraticCurveTo(x + bw * 0.3 - 5, y + h / 2, x - 5, y + h); c.stroke();
  }
}
function drawPart(c, n, stub){
  var d = TYPES[n.t], w = d.w, h = d.h, r, cx, cy, on;
  if (d.k === "pt"){
    on = n.v ? 1 : 0;
    /* A solid solder blob — filled, so it never reads as the open ring of a
       loose wire end. The wires already run to its centre; all it needs is mass. */
    c.lineWidth = 1.4;
    c.beginPath(); c.arc(n.x, n.y, PTR, 0, 7);
    c.fillStyle = on ? C.hot : C.line; c.fill();
    c.strokeStyle = on ? C.hot : C.line; c.stroke();
  } else if (d.k === "sw"){
    r = h / 2; on = n.s ? 1 : 0;
    c.lineWidth = 1.6;
    c.strokeStyle = on ? C.hot : C.wire;
    c.beginPath(); c.moveTo(n.x + w, n.y + r); c.lineTo(n.x + w + stub, n.y + r); c.stroke();
    roundRect(c, n.x, n.y, w, h, r);
    c.fillStyle = on ? C.hot : C.body; c.fill();
    c.strokeStyle = C.line; c.stroke();
    c.beginPath(); c.arc(on ? n.x + w - r : n.x + r, n.y + r, r - 5.5, 0, 7);
    c.fillStyle = on ? C.body : C.line; c.fill();
  } else if (d.k === "btn"){
    r = h / 2; on = n.s ? 1 : 0; cx = n.x + r; cy = n.y + r;
    c.lineWidth = 1.6;
    c.strokeStyle = on ? C.hot : C.wire;
    c.beginPath(); c.moveTo(n.x + w, cy); c.lineTo(n.x + w + stub, cy); c.stroke();
    c.beginPath(); c.arc(cx, cy, r, 0, 7);
    c.fillStyle = C.body; c.fill(); c.strokeStyle = C.line; c.stroke();
    c.beginPath(); c.arc(cx, cy, r - 5, 0, 7);
    c.fillStyle = on ? C.hot : C.line; c.fill();
  } else if (d.k === "lamp"){
    r = w / 2; on = n.v ? 1 : 0; cx = n.x + r; cy = n.y + r;
    c.lineWidth = 1.6;
    c.strokeStyle = on ? C.hot : C.wire;
    c.beginPath(); c.moveTo(n.x - stub, cy); c.lineTo(n.x, cy); c.stroke();
    if (on){
      c.globalAlpha = 0.3; c.strokeStyle = C.hot; c.lineWidth = 3;
      c.beginPath(); c.arc(cx, cy, r + 3.5, 0, 7); c.stroke();
      c.globalAlpha = 1; c.lineWidth = 1.6;
    }
    c.beginPath(); c.arc(cx, cy, r, 0, 7);
    c.fillStyle = on ? C.hot : C.body; c.fill(); c.strokeStyle = C.line; c.stroke();
    c.beginPath();
    c.moveTo(cx - r * 0.42, cy - r * 0.42); c.lineTo(cx + r * 0.42, cy + r * 0.42);
    c.moveTo(cx + r * 0.42, cy - r * 0.42); c.lineTo(cx - r * 0.42, cy + r * 0.42);
    c.strokeStyle = on ? C.body : C.line; c.lineWidth = 1.2; c.stroke();
  } else if (DRAW[d.k]){
    DRAW[d.k](c, n, stub);               /* chips and components: symbols.js */
  } else {
    drawGate(c, n.t, n.x, n.y, w, h, stub, n.iv, n.v);
  }
  if (n.l){
    c.font = MONO; c.fillStyle = C.muted; c.textBaseline = "middle";
    if (d.k === "pt"){ c.textAlign = "left"; c.fillText(n.l, n.x + PTR + 6, n.y - PTR - 3); }
    else if (d.k === "lamp"){ c.textAlign = "left"; c.fillText(n.l, n.x + w + 7, n.y + h / 2); }
    /* a chip has pins down its left side, so its name goes over the top */
    else if (d.k === "chip"){ c.textAlign = "left"; c.fillText(n.l, n.x, n.y - 8); }
    else { c.textAlign = "right"; c.fillText(n.l, n.x - stub - 5, n.y + h / 2); }
  }
}
