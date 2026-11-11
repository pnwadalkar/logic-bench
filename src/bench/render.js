/* Painting the sheet, and finding what lies under the pointer. */
import { S } from "./state.js";
import { hits } from "./cleaner.js";
import { Collab } from "./collab.js";
import { GRID, PORT, PTR, SNAP, STUB, box, byId, dots, floats, hasOut, inPort, isPt, lvl, nIn, nOut, outPort, pickN, pickW } from "./core.js";
import { qWire } from "./quantum.js";
import { drawPart, roundRect } from "./shapes.js";
import { clearPick, pickSpread } from "./sim.js";

/* ---------- render ---------- */
export function draw(){
  if (S.queued) return;
  S.queued = true;
  requestAnimationFrame(function(){ S.queued = false; render(); });
}
/* Either end of a wire is a port on a part, or a loose point on the sheet. */
export function endA(w){ var n = w.a ? byId.get(w.a) : null; return n ? outPort(n, w.q) : w.fa; }
export function endB(w){ var n = w.b ? byId.get(w.b) : null; return n ? inPort(n, w.p) : w.fb; }
export function wirePath(c, p1, p2){
  c.beginPath(); c.moveTo(p1.x, p1.y); c.lineTo(p2.x, p2.y);
}
export function render(){
  if (!S.ctx) return;
  var W = S.cv.clientWidth, H = S.cv.clientHeight, i, j, n, w, a, b, pt, bx, at, gh, on;
  S.ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
  S.ctx.clearRect(0, 0, W, H);
  S.ctx.translate(Math.round(S.pan.x), Math.round(S.pan.y));
  S.ctx.scale(S.zoom, S.zoom);
  S.ctx.fillStyle = dots();
  S.ctx.fillRect(-S.pan.x / S.zoom - GRID, -S.pan.y / S.zoom - GRID, W / S.zoom + GRID * 2, H / S.zoom + GRID * 2);

  S.ctx.lineWidth = 2; S.ctx.lineCap = "round";
  for (i = 0; i < S.wires.length; i++){
    w = S.wires[i]; a = w.a ? byId.get(w.a) : null; bx = endA(w); pt = endB(w);
    if (!bx || !pt) continue;
    if (pickW.has(w.id)){
      S.ctx.strokeStyle = S.C.sel; S.ctx.lineWidth = 4; S.ctx.globalAlpha = 0.35;
      wirePath(S.ctx, bx, pt); S.ctx.stroke(); S.ctx.globalAlpha = 1; S.ctx.lineWidth = 2;
    }
    if (S.docKind === "quantum" && w.a && w.b){ qWire(S.ctx, a, w, bx, pt); continue; }
    on = a ? lvl(a, w.q) : 0;
    S.ctx.strokeStyle = on ? S.C.hot : S.C.wire;
    /* a wire nothing is driving — an off transistor's, say — is drawn broken */
    if (a && w.b && floats(a, w.q)) S.ctx.setLineDash([5, 4]);
    wirePath(S.ctx, bx, pt); S.ctx.stroke();
    S.ctx.setLineDash([]);
    /* an unfinished end gets an open ring, so a loose wire reads as loose */
    if (!w.a || !w.b){
      S.ctx.beginPath(); S.ctx.arc(w.a ? pt.x : bx.x, w.a ? pt.y : bx.y, 4, 0, 7);
      S.ctx.fillStyle = S.C.canvas; S.ctx.fill();
      S.ctx.strokeStyle = on ? S.C.hot : S.C.line; S.ctx.lineWidth = 1.6; S.ctx.stroke();
      S.ctx.lineWidth = 2;
    }
  }
  var ghost = S.wiring ? {p:S.wiring.p, to:{x:S.wiring.x, y:S.wiring.y}} :
              S.pend ? {p:S.pend.pos, to:S.cursor} : null;
  if (ghost){
    S.ctx.strokeStyle = S.C.sel; S.ctx.setLineDash([4, 4]);
    if (S.pend && S.pend.kind === "in") wirePath(S.ctx, ghost.to, ghost.p);
    else wirePath(S.ctx, ghost.p, ghost.to);
    S.ctx.stroke(); S.ctx.setLineDash([]);
  }
  for (i = 0; i < S.nodes.length; i++){
    n = S.nodes[i];
    if (pickN.has(n.id)){
      bx = box(n);
      S.ctx.strokeStyle = S.C.sel; S.ctx.lineWidth = 1; S.ctx.setLineDash([3, 3]);
      roundRect(S.ctx, bx.x - 3, bx.y - 3, bx.w + 6, bx.h + 6, 5); S.ctx.stroke();
      S.ctx.setLineDash([]);
    }
    drawPart(S.ctx, n, STUB);
  }
  if (S.wiring || S.drag || S.wireMode){
    for (i = 0; i < S.nodes.length; i++){
      n = S.nodes[i];
      S.ctx.fillStyle = S.C.sel; S.ctx.globalAlpha = 0.75;
      if (isPt(n)){
        /* one marker: a point's two ports share the dot */
        S.ctx.beginPath(); S.ctx.arc(n.x, n.y, PTR + 2.5, 0, 7); S.ctx.fill();
      } else {
        for (j = 0; j < nOut(n); j++){ pt = outPort(n, j); S.ctx.beginPath(); S.ctx.arc(pt.x, pt.y, 3, 0, 7); S.ctx.fill(); }
        for (j = 0; j < nIn(n); j++){ pt = inPort(n, j); S.ctx.beginPath(); S.ctx.arc(pt.x, pt.y, 3, 0, 7); S.ctx.fill(); }
      }
      S.ctx.globalAlpha = 1;
    }
  }
  if (S.pend){
    S.ctx.strokeStyle = S.C.sel; S.ctx.lineWidth = 2;
    S.ctx.beginPath(); S.ctx.arc(S.pend.pos.x, S.pend.pos.y, 5.5, 0, 7); S.ctx.stroke();
  }
  if (S.marq){
    var r = marqRect(S.marq);
    S.ctx.fillStyle = S.C.sel; S.ctx.globalAlpha = 0.09;
    S.ctx.fillRect(r.x, r.y, r.w, r.h); S.ctx.globalAlpha = 1;
    S.ctx.strokeStyle = S.C.sel; S.ctx.lineWidth = 1; S.ctx.setLineDash([4, 3]);
    S.ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w, r.h); S.ctx.setLineDash([]);
  }
  /* the copy in hand, ghosted where it would land */
  if (S.pasteMode && S.clip && S.hover){
    at = {x:Math.round((S.hover.x - S.clip.w / 2) / SNAP) * SNAP,
          y:Math.round((S.hover.y - S.clip.h / 2) / SNAP) * SNAP};
    gh = S.clip.nodes.map(function(cn){
      return {id:"g", t:cn.t, x:at.x + cn.x, y:at.y + cn.y, s:cn.s, v:0, l:cn.l, c:cn.c, m:cn.m, iv:[]};
    });
    S.ctx.save();
    S.ctx.globalAlpha = 0.5;
    S.ctx.lineWidth = 2; S.ctx.lineCap = "round"; S.ctx.strokeStyle = S.C.wire;
    for (i = 0; i < S.clip.wires.length; i++){
      w = S.clip.wires[i];
      a = w.a === null ? (w.fa ? {x:at.x + w.fa.x, y:at.y + w.fa.y} : null) : outPort(gh[w.a], w.q);
      pt = w.b === null ? (w.fb ? {x:at.x + w.fb.x, y:at.y + w.fb.y} : null) : inPort(gh[w.b], w.p);
      if (!a || !pt) continue;
      wirePath(S.ctx, a, pt); S.ctx.stroke();
    }
    for (i = 0; i < gh.length; i++) drawPart(S.ctx, gh[i], STUB);
    S.ctx.restore();
    S.ctx.strokeStyle = S.C.sel; S.ctx.lineWidth = 1; S.ctx.setLineDash([4, 3]);
    S.ctx.strokeRect(at.x - 6.5, at.y - 6.5, S.clip.w + 13, S.clip.h + 13);
    S.ctx.setLineDash([]);
  }
  Collab.drawPeers(S.ctx);
  if (S.onFrame) S.onFrame();
}
export function sizeCanvas(){
  if (!S.cv) return;
  S.dpr = Math.min(2, window.devicePixelRatio || 1);
  S.cv.width = Math.round(S.cv.clientWidth * S.dpr);
  S.cv.height = Math.round(S.cv.clientHeight * S.dpr);
}

/* ---------- hit tests ---------- */
export function toWorld(e){
  var r = S.cv.getBoundingClientRect();
  return {x:(e.clientX - r.left - S.pan.x) / S.zoom, y:(e.clientY - r.top - S.pan.y) / S.zoom};
}
export function near(p, q, d){ var dx = p.x - q.x, dy = p.y - q.y; return dx * dx + dy * dy <= d * d; }
/* The nearest port within reach. A chip's pins sit closer together than the
   reach, so it is the nearest that counts, not the first one found. */
export function portAt(p){
  var i, j, n, pt, best = null, bd = PORT * PORT + 0.01, d2;
  var see = function(kind, n, j, pt){
    d2 = (pt.x - p.x) * (pt.x - p.x) + (pt.y - p.y) * (pt.y - p.y);
    if (d2 < bd){ bd = d2; best = {kind:kind, id:n.id, p:j, pos:pt}; }
  };
  for (i = S.nodes.length - 1; i >= 0; i--){
    n = S.nodes[i];
    for (j = 0; j < nOut(n); j++) see("out", n, j, outPort(n, j));
    for (j = 0; j < nIn(n); j++) see("in", n, j, inPort(n, j));
  }
  return best;
}
export function nodeAt(p){
  var i, n, b;
  for (i = S.nodes.length - 1; i >= 0; i--){
    n = S.nodes[i]; b = box(n);
    if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return n;
  }
  return null;
}
/* Points are small and their ports sit on the dot, so they get their own disc. */
export function pointAt(p){
  var i, n;
  for (i = S.nodes.length - 1; i >= 0; i--){
    n = S.nodes[i];
    if (isPt(n) && near(p, n, PTR + 7)) return n;
  }
  return null;
}
export function nearestPort(n, p, kind){
  var best = 0, bd = Infinity, j, pt, d2, k = kind === "in" ? nIn(n) : nOut(n);
  var at = function(j){ return kind === "in" ? inPort(n, j) : outPort(n, j); };
  for (j = 0; j < k; j++){
    pt = at(j); d2 = (pt.x - p.x) * (pt.x - p.x) + (pt.y - p.y) * (pt.y - p.y);
    if (d2 < bd){ bd = d2; best = j; }
  }
  return {kind:kind, id:n.id, p:best, pos:at(best)};
}
/* A port under the pointer, or the most plausible port of the part under it. */
export function portTarget(p, want){
  var ph = portAt(p), n;
  if (ph && (!want || ph.kind === want)) return ph;
  n = pointAt(p) || nodeAt(p);
  if (!n) return null;
  if (want === "out") return hasOut(n) ? nearestPort(n, p, "out") : null;
  if (want === "in") return nIn(n) ? nearestPort(n, p, "in") : null;
  if (hasOut(n)) return nearestPort(n, p, "out");
  return nIn(n) ? nearestPort(n, p, "in") : null;
}
export function onSeg(p, a, b){
  var vx = b.x - a.x, vy = b.y - a.y, len = vx * vx + vy * vy, t = 0;
  if (len > 0) t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / len));
  return near(p, {x:a.x + vx * t, y:a.y + vy * t}, 7);
}
/* ---------- rubber band ---------- */
export function marqRect(m){
  return {x:Math.min(m.x0, m.x), y:Math.min(m.y0, m.y),
          w:Math.abs(m.x - m.x0), h:Math.abs(m.y - m.y0)};
}
export function inRect(r, p){ return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; }
/* A part is taken when the band touches its box; a wire when the band holds both
   of its ends, so a run leaving the region is left where it is. */
export function applyMarq(m){
  var r = marqRect(m), i, n, w, a, b;
  if (!m.add) clearPick();
  if (r.w < 3 && r.h < 3) return;
  for (i = 0; i < S.nodes.length; i++){ n = S.nodes[i]; if (hits(box(n), r)) pickN.add(n.id); }
  for (i = 0; i < S.wires.length; i++){
    w = S.wires[i]; a = endA(w); b = endB(w);
    if (a && b && inRect(r, a) && inRect(r, b)) pickW.add(w.id);
  }
  pickSpread();
}
export function wireAt(p){
  var i, w, a, b;
  for (i = S.wires.length - 1; i >= 0; i--){
    w = S.wires[i]; a = endA(w); b = endB(w);
    if (!a || !b) continue;
    if (onSeg(p, a, b)) return w;
  }
  return null;
}
