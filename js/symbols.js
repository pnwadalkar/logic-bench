/* Drawing the components and the chips: transistors, the passives, power and
   ground, the clock, the displays, and every boxed chip with its named pins. */
"use strict";

var PINFONT = '500 9px "IBM Plex Mono", monospace', TITLEFONT = '600 9px "IBM Plex Mono", monospace';
var PINTEXT = null;          /* pin-name colour while a chip with a dark body is being drawn */
var USERCHIP = "#0d1016", USERFONT = '700 11px "IBM Plex Mono", monospace';
/* the segments each hex digit lights, a to g as bits 0 to 6 */
var HEXSEG = [0x3F,0x06,0x5B,0x4F,0x66,0x6D,0x7D,0x07,0x7F,0x6F,0x77,0x7C,0x39,0x5E,0x79,0x71];

function seg(c, x1, y1, x2, y2){ c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); }
function poly(c, p){
  c.beginPath(); c.moveTo(p[0], p[1]);
  for (var i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]);
  c.stroke();
}
function lit(on){ return on ? C.hot : C.wire; }
function inLit(n, i){ return !!(n.iv && n.iv[i]); }
/* The short leads out to every pin, lit while the level on them is 1. */
function stubs(c, n, stub){
  var i, p, x = n.x, w = TYPES[n.t].w;
  c.lineWidth = 1.6; c.lineCap = "round"; c.lineJoin = "round";
  for (i = 0; i < nIn(n); i++){
    p = inPort(n, i); c.strokeStyle = lit(inLit(n, i));
    seg(c, x - stub, p.y, x, p.y);
  }
  for (i = 0; i < nOut(n); i++){
    p = outPort(n, i); c.strokeStyle = lit(lvl(n, i));
    seg(c, x + w, p.y, x + w + stub, p.y);
  }
}
/* One 7-segment digit in the box x,y,w,h; dp < 0 means no decimal point. */
function segDigit(c, x, y, w, h, mask, dp){
  var g = 2.5, m = y + h / 2, i, s = [
    [x + g, y, x + w - g, y], [x + w, y + g, x + w, m - g], [x + w, m + g, x + w, y + h - g],
    [x + g, y + h, x + w - g, y + h], [x, m + g, x, y + h - g], [x, y + g, x, m - g], [x + g, m, x + w - g, m]];
  c.lineWidth = Math.max(2.4, w / 7); c.lineCap = "round";
  for (i = 0; i < 7; i++){
    c.strokeStyle = (mask >> i) & 1 ? C.hot : C.grid;
    seg(c, s[i][0], s[i][1], s[i][2], s[i][3]);
  }
  if (dp >= 0){
    c.beginPath(); c.arc(x + w + 5, y + h, 2.2, 0, 7);
    c.fillStyle = dp ? C.hot : C.grid; c.fill();
  }
}
/* A pin's name inside the chip's edge. "~Q" is Q with a bar over it, and a clock
   pin gets the wedge a schematic marks one with. */
function pinName(c, s, x, y, side, on){
  var bar = s.charAt(0) === "~", t = bar ? s.slice(1) : s, tw, x1;
  if (t === "CLK"){
    c.strokeStyle = C.line; c.lineWidth = 1.1;
    poly(c, [x - 4, y - 4, x + 1, y, x - 4, y + 4]);
    x += 4;
  }
  c.font = PINFONT; c.textAlign = side; c.textBaseline = "middle";
  c.fillStyle = on ? C.hot : (PINTEXT || C.muted);
  c.fillText(t, x, y + 0.5);
  if (bar){
    tw = c.measureText(t).width; x1 = side === "right" ? x - tw : x;
    c.strokeStyle = c.fillStyle; c.lineWidth = 1; c.lineCap = "butt";
    seg(c, x1, y - 5, x1 + tw, y - 5);
    c.lineCap = "round";
  }
}
function mid(c, s, x, y, size){
  c.font = "600 " + size + 'px "IBM Plex Mono", monospace';
  c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = C.fg;
  c.fillText(s, x, y);
}
/* sixteen words, four by four, with the one being addressed lit */
function wordGrid(c, n, x, y, w, h){
  var d = TYPES[n.t], m = Array.isArray(n.m) ? n.m : null, at = bits(n.iv || [], 0, 4), i, cx, cy;
  var cw = 9.5, rh = Math.min(14, (h - TITLE - 8) / 4);
  var x0 = x + d.cx - cw * 1.5, y0 = y + TITLE + (h - TITLE) / 2 - rh * 1.5;
  c.font = '500 8.5px "IBM Plex Mono", monospace'; c.textAlign = "center"; c.textBaseline = "middle";
  for (i = 0; i < 16; i++){
    cx = x0 + (i & 3) * cw; cy = y0 + (i >> 2) * rh;
    c.fillStyle = i === at ? C.hot : C.muted;
    c.fillText(((m ? m[i] : 0) & 15).toString(16).toUpperCase(), cx, cy);
  }
}
/* What some chips show through the lid: a digit, a stored value, the operation. */
var INSIDE = {
  HEXIN: function(c, n, x, y, w, h){
    mid(c, ((n.s | 0) & 15).toString(16).toUpperCase(), x + (w - 10) / 2, y + TITLE + (h - TITLE) / 2, 22);
  },
  HEXD: function(c, n, x, y, w, h){
    segDigit(c, x + 19, y + TITLE + 7, w - 30, h - TITLE - 18, HEXSEG[bits(n.iv || [], 0, 4)], -1);
  },
  SEG7: function(c, n, x, y, w, h){
    var dw = w - 34, dh = Math.min(h - TITLE - 18, dw * 1.7), iv = n.iv || [];
    segDigit(c, x + 18, y + TITLE + (h - TITLE - dh) / 2, dw, dh, bits(iv, 0, 7), iv[7] ? 1 : 0);
  },
  ALU:  function(c, n, x, y, w, h){ mid(c, ALUOPS[bits(n.iv || [], 8, 3)], x + TYPES[n.t].cx, y + TITLE + (h - TITLE) / 2, 10); },
  REG4: function(c, n, x, y, w, h){ mid(c, ((n.m | 0) & 15).toString(16).toUpperCase(), x + TYPES[n.t].cx, y + TITLE + (h - TITLE) / 2, 13); },
  RAM:  wordGrid,
  ROM:  wordGrid
};
INSIDE.SHR4 = INSIDE.CNT4 = INSIDE.REG4;

/* Each kind of part past the seven gates, drawn at its corner n.x, n.y. */
var DRAW = {
  chip: function(c, n, stub){
    var d = TYPES[n.t], x = n.x, y = n.y, w = d.w, h = d.h, i, p;
    stubs(c, n, stub);
    c.lineWidth = 1.6; roundRect(c, x, y, w, h, 4);
    /* a chip you made is black, like the real thing, with its name on the lid */
    c.fillStyle = d.user ? USERCHIP : C.body; c.fill(); c.strokeStyle = d.user ? "#4a5366" : C.line; c.stroke();
    c.font = d.user ? USERFONT : TITLEFONT; c.textAlign = "center"; c.textBaseline = "middle";
    c.fillStyle = d.user ? "#f4f6fa" : C.fg;
    c.fillText(d.ab, x + w / 2, y + 8.5);
    if (d.user){                       /* the notch that marks the top of a chip */
      c.beginPath(); c.arc(x + w / 2, y, 3.2, 0, Math.PI);
      c.fillStyle = C.body; c.fill(); c.strokeStyle = "#4a5366"; c.lineWidth = 1.1; c.stroke();
    }
    PINTEXT = d.user ? "#c9d1de" : null;
    for (i = 0; i < d.ins; i++){ p = inPort(n, i); pinName(c, d.pn[i], x + 4, p.y, "left", inLit(n, i)); }
    for (i = 0; i < nOut(n); i++){ p = outPort(n, i); pinName(c, d.po[i], x + w - 4, p.y, "right", lvl(n, i)); }
    PINTEXT = null;
    if (INSIDE[n.t]) INSIDE[n.t](c, n, x, y, w, h);
  },
  vcc: function(c, n, stub){
    var x = n.x, m = n.y + 14;
    stubs(c, n, stub);
    c.strokeStyle = C.hot; seg(c, x + 20, m, x + 28, m);
    roundRect(c, x, m - 10, 20, 20, 4);
    c.fillStyle = C.body; c.fill(); c.strokeStyle = C.line; c.stroke();
    c.strokeStyle = C.hot; c.lineWidth = 2;
    seg(c, x + 10, m - 5, x + 10, m + 5); seg(c, x + 5, m, x + 15, m);
  },
  gnd: function(c, n, stub){
    var x = n.x, m = n.y + 14;
    stubs(c, n, stub);
    c.strokeStyle = C.wire; seg(c, x + 14, m, x + 28, m);
    c.strokeStyle = C.line; c.lineWidth = 2;
    seg(c, x + 14, m - 9, x + 14, m + 9); seg(c, x + 9, m - 6, x + 9, m + 6); seg(c, x + 4, m - 3, x + 4, m + 3);
  },
  res: function(c, n, stub){
    var x = n.x, m = n.y + 10, i, k = 6, step = 28 / k;
    stubs(c, n, stub);
    c.strokeStyle = lit(inLit(n, 0)); seg(c, x, m, x + 6, m);
    c.strokeStyle = lit(n.v); seg(c, x + 34, m, x + 40, m);
    c.strokeStyle = C.line; c.beginPath(); c.moveTo(x + 6, m);
    for (i = 0; i < k; i++) c.lineTo(x + 6 + step * (i + 0.5), m + (i % 2 ? 5 : -5));
    c.lineTo(x + 34, m); c.stroke();
  },
  diode: function(c, n, stub){
    var x = n.x, m = n.y + 10;
    stubs(c, n, stub);
    c.strokeStyle = lit(inLit(n, 0)); seg(c, x, m, x + 10, m);
    c.strokeStyle = lit(n.v); seg(c, x + 24, m, x + 36, m);
    c.beginPath(); c.moveTo(x + 10, m - 7); c.lineTo(x + 24, m); c.lineTo(x + 10, m + 7); c.closePath();
    c.fillStyle = n.v ? C.hot : C.body; c.fill(); c.strokeStyle = C.line; c.stroke();
    c.lineWidth = 2; seg(c, x + 24, m - 7, x + 24, m + 7);
  },
  cap: function(c, n, stub){
    var x = n.x, y = n.y, m = y + 15, q = Math.max(0, Math.min(1, +n.m || 0));
    stubs(c, n, stub);
    c.strokeStyle = lit(inLit(n, 0)); seg(c, x, m, x + 12, m);
    c.strokeStyle = lit(n.v); seg(c, x + 18, m, x + 30, m);
    /* the charge it holds, as a level filling the gap between the plates */
    if (q > 0.01){
      c.globalAlpha = 0.25 + 0.55 * q; c.fillStyle = C.hot;
      c.fillRect(x + 12, y + 25 - 20 * q, 6, 20 * q); c.globalAlpha = 1;
    }
    c.strokeStyle = C.line; c.lineWidth = 2.4; c.lineCap = "butt";
    seg(c, x + 12, y + 5, x + 12, y + 25); seg(c, x + 18, y + 5, x + 18, y + 25);
    c.lineCap = "round";
  },
  ind: function(c, n, stub){
    var x = n.x, m = n.y + 10, i, q = Math.max(0, Math.min(1, +n.m || 0));
    var coil = function(){
      c.beginPath(); c.moveTo(x + 8, m);
      for (i = 0; i < 4; i++) c.arc(x + 11.5 + 7 * i, m, 3.5, Math.PI, 0);
      c.stroke();
    };
    stubs(c, n, stub);
    c.strokeStyle = lit(inLit(n, 0)); seg(c, x, m, x + 8, m);
    c.strokeStyle = lit(n.v); seg(c, x + 36, m, x + 44, m);
    c.strokeStyle = C.line; c.lineWidth = 1.8; coil();
    /* the current building up in it */
    if (q > 0.01){ c.globalAlpha = q; c.strokeStyle = C.hot; coil(); c.globalAlpha = 1; }
  },
  /* a MOSFET on its side: the channel across the top, the gate plate under it */
  fet: function(c, n, stub){
    var d = TYPES[n.t], x = n.x, y = n.y, w = d.w, cx = x + w / 2, g = inLit(n, 1), on = d.neg ? !g : g;
    stubs(c, n, stub);
    c.strokeStyle = lit(inLit(n, 0)); poly(c, [x, y + 12, x + 11, y + 12, x + 11, y + 17]);
    c.strokeStyle = lit(n.v); poly(c, [x + w - 11, y + 17, x + w - 11, y + 12, x + w, y + 12]);
    c.lineWidth = 2.4; c.lineCap = "butt";
    c.strokeStyle = on && n.v ? C.hot : C.line; seg(c, x + 8, y + 17, x + w - 8, y + 17);
    c.strokeStyle = C.line; seg(c, x + 8, y + 22, x + w - 8, y + 22);
    c.lineCap = "round"; c.lineWidth = 1.6; c.strokeStyle = lit(g);
    if (d.neg){
      poly(c, [x, y + 30, cx, y + 30, cx, y + 28.5]);
      c.beginPath(); c.arc(cx, y + 25.5, 3, 0, 7);
      c.fillStyle = C.body; c.fill(); c.strokeStyle = C.line; c.lineWidth = 1.4; c.stroke();
    } else poly(c, [x, y + 30, cx, y + 30, cx, y + 22]);
  },
  /* a bipolar transistor on its side: the base bar, collector in, emitter out */
  bjt: function(c, n, stub){
    var d = TYPES[n.t], x = n.x, y = n.y, w = d.w, cx = x + w / 2, by = y + 21, g = inLit(n, 1), on = d.neg ? !g : g;
    var ex = cx + 5, ey = by, fx = x + w - 9, fy = y + 12, L, ux, uy, px, py;
    stubs(c, n, stub);
    c.lineWidth = 1.2; c.beginPath(); c.arc(cx, y + 19, 15, 0, 7);
    c.fillStyle = C.body; c.fill(); c.strokeStyle = C.line; c.stroke();
    c.lineWidth = 1.6;
    c.strokeStyle = lit(inLit(n, 0)); poly(c, [x, y + 12, x + 9, y + 12, cx - 5, by]);
    c.strokeStyle = lit(n.v); poly(c, [ex, ey, fx, fy, x + w, y + 12]);
    c.strokeStyle = lit(g); poly(c, [x, y + 30, cx, y + 30, cx, by]);
    c.lineWidth = 2.6; c.lineCap = "butt";
    c.strokeStyle = on && n.v ? C.hot : C.line; seg(c, cx - 8, by, cx + 8, by);
    c.lineCap = "round";
    /* the emitter arrow: out of the base on an NPN, into it on a PNP */
    L = Math.hypot(fx - ex, fy - ey); ux = (fx - ex) / L; uy = (fy - ey) / L;
    px = ex + (fx - ex) * 0.62; py = ey + (fy - ey) * 0.62;
    if (d.neg){ ux = -ux; uy = -uy; }
    c.beginPath();
    c.moveTo(px + ux * 3.2, py + uy * 3.2);
    c.lineTo(px - ux * 2.4 - uy * 3, py - uy * 2.4 + ux * 3);
    c.lineTo(px - ux * 2.4 + uy * 3, py - uy * 2.4 - ux * 3);
    c.closePath(); c.fillStyle = C.line; c.fill();
  },
  tri: function(c, n, stub){
    var d = TYPES[n.t], x = n.x, y = n.y, w = d.w, ex = x + w * 0.4;
    stubs(c, n, stub);
    c.strokeStyle = lit(inLit(n, 1)); poly(c, [x, y + 34, ex, y + 34, ex, y + 26 - 12 * 0.4]);
    c.beginPath(); c.moveTo(x, y + 2); c.lineTo(x + w, y + 14); c.lineTo(x, y + 26); c.closePath();
    c.fillStyle = C.body; c.fill(); c.strokeStyle = C.line; c.stroke();
  },
  clk: function(c, n, stub){
    var x = n.x, y = n.y, on = n.s ? 1 : 0;
    stubs(c, n, stub);
    c.lineWidth = 1.6; roundRect(c, x, y, 40, 30, 5);
    c.fillStyle = C.body; c.fill(); c.strokeStyle = C.line; c.stroke();
    c.strokeStyle = on ? C.hot : C.line;
    poly(c, [x + 6, y + 17, x + 12, y + 17, x + 12, y + 7, x + 20, y + 7, x + 20, y + 17,
             x + 28, y + 17, x + 28, y + 7, x + 34, y + 7]);
    c.font = '500 8px "IBM Plex Mono", monospace'; c.fillStyle = C.muted;
    c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText(rateText(rate(n)), x + 20, y + 24);
  }
};
/* The rail's picture of a chip: a small box with its title and a few pins. */
function chipIcon(g, t){
  var d = TYPES[t], x = 12, y = 4, w = 26, h = 26, i, k;
  g.lineWidth = 1.2; g.lineCap = "round"; g.strokeStyle = C.wire;
  k = Math.min(d.ins, 4);
  for (i = 0; i < k; i++) seg(g, x - 5, y + h * (i + 1) / (k + 1), x, y + h * (i + 1) / (k + 1));
  k = Math.min(d.outs, 4);
  for (i = 0; i < k; i++) seg(g, x + w, y + h * (i + 1) / (k + 1), x + w + 5, y + h * (i + 1) / (k + 1));
  roundRect(g, x, y, w, h, 3);
  g.fillStyle = d.user ? USERCHIP : C.body; g.fill(); g.strokeStyle = d.user ? "#4a5366" : C.line; g.lineWidth = 1.3; g.stroke();
  /* a name too long for the icon is cut short; the tile's label under it says it all */
  var ab = d.user && d.ab.length > 6 ? d.ab.slice(0, 5) + "…" : d.ab;
  g.font = '600 ' + (ab.length > 4 ? 6.5 : 7.5) + 'px "IBM Plex Mono", monospace';
  g.fillStyle = d.user ? "#f4f6fa" : C.fg; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(ab, x + w / 2, y + h / 2 + 0.5);
}
