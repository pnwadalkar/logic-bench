/* Painting the sheet, and finding what lies under the pointer. */
"use strict";

/* ---------- render ---------- */
function draw(){
  if (queued) return;
  queued = true;
  requestAnimationFrame(function(){ queued = false; render(); });
}
/* Either end of a wire is a port on a part, or a loose point on the sheet. */
function endA(w){ var n = w.a ? byId.get(w.a) : null; return n ? outPort(n, w.q) : w.fa; }
function endB(w){ var n = w.b ? byId.get(w.b) : null; return n ? inPort(n, w.p) : w.fb; }
function wirePath(c, p1, p2){
  c.beginPath(); c.moveTo(p1.x, p1.y); c.lineTo(p2.x, p2.y);
}
function render(){
  var W = cv.clientWidth, H = cv.clientHeight, i, j, n, w, a, b, pt, bx, at, gh, on;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.translate(Math.round(pan.x), Math.round(pan.y));
  ctx.scale(zoom, zoom);
  ctx.fillStyle = dots();
  ctx.fillRect(-pan.x / zoom - GRID, -pan.y / zoom - GRID, W / zoom + GRID * 2, H / zoom + GRID * 2);

  ctx.lineWidth = 2; ctx.lineCap = "round";
  for (i = 0; i < wires.length; i++){
    w = wires[i]; a = w.a ? byId.get(w.a) : null; bx = endA(w); pt = endB(w);
    if (!bx || !pt) continue;
    if (pickW.has(w.id)){
      ctx.strokeStyle = C.sel; ctx.lineWidth = 4; ctx.globalAlpha = 0.35;
      wirePath(ctx, bx, pt); ctx.stroke(); ctx.globalAlpha = 1; ctx.lineWidth = 2;
    }
    on = a ? lvl(a, w.q) : 0;
    ctx.strokeStyle = on ? C.hot : C.wire;
    /* a wire nothing is driving — an off transistor's, say — is drawn broken */
    if (a && w.b && floats(a, w.q)) ctx.setLineDash([5, 4]);
    wirePath(ctx, bx, pt); ctx.stroke();
    ctx.setLineDash([]);
    /* an unfinished end gets an open ring, so a loose wire reads as loose */
    if (!w.a || !w.b){
      ctx.beginPath(); ctx.arc(w.a ? pt.x : bx.x, w.a ? pt.y : bx.y, 4, 0, 7);
      ctx.fillStyle = C.canvas; ctx.fill();
      ctx.strokeStyle = on ? C.hot : C.line; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.lineWidth = 2;
    }
  }
  var ghost = wiring ? {p:wiring.p, to:{x:wiring.x, y:wiring.y}} :
              pend ? {p:pend.pos, to:cursor} : null;
  if (ghost){
    ctx.strokeStyle = C.sel; ctx.setLineDash([4, 4]);
    if (pend && pend.kind === "in") wirePath(ctx, ghost.to, ghost.p);
    else wirePath(ctx, ghost.p, ghost.to);
    ctx.stroke(); ctx.setLineDash([]);
  }
  for (i = 0; i < nodes.length; i++){
    n = nodes[i];
    if (pickN.has(n.id)){
      bx = box(n);
      ctx.strokeStyle = C.sel; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      roundRect(ctx, bx.x - 3, bx.y - 3, bx.w + 6, bx.h + 6, 5); ctx.stroke();
      ctx.setLineDash([]);
    }
    drawPart(ctx, n, STUB);
  }
  if (wiring || drag || wireMode){
    for (i = 0; i < nodes.length; i++){
      n = nodes[i];
      ctx.fillStyle = C.sel; ctx.globalAlpha = 0.75;
      if (isPt(n)){
        /* one marker: a point's two ports share the dot */
        ctx.beginPath(); ctx.arc(n.x, n.y, PTR + 2.5, 0, 7); ctx.fill();
      } else {
        for (j = 0; j < nOut(n); j++){ pt = outPort(n, j); ctx.beginPath(); ctx.arc(pt.x, pt.y, 3, 0, 7); ctx.fill(); }
        for (j = 0; j < nIn(n); j++){ pt = inPort(n, j); ctx.beginPath(); ctx.arc(pt.x, pt.y, 3, 0, 7); ctx.fill(); }
      }
      ctx.globalAlpha = 1;
    }
  }
  if (pend){
    ctx.strokeStyle = C.sel; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(pend.pos.x, pend.pos.y, 5.5, 0, 7); ctx.stroke();
  }
  if (marq){
    var r = marqRect(marq);
    ctx.fillStyle = C.sel; ctx.globalAlpha = 0.09;
    ctx.fillRect(r.x, r.y, r.w, r.h); ctx.globalAlpha = 1;
    ctx.strokeStyle = C.sel; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w, r.h); ctx.setLineDash([]);
  }
  /* the copy in hand, ghosted where it would land */
  if (pasteMode && clip && hover){
    at = {x:Math.round((hover.x - clip.w / 2) / SNAP) * SNAP,
          y:Math.round((hover.y - clip.h / 2) / SNAP) * SNAP};
    gh = clip.nodes.map(function(cn){
      return {id:"g", t:cn.t, x:at.x + cn.x, y:at.y + cn.y, s:cn.s, v:0, l:cn.l, c:cn.c, m:cn.m, iv:[]};
    });
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.strokeStyle = C.wire;
    for (i = 0; i < clip.wires.length; i++){
      w = clip.wires[i];
      a = w.a === null ? (w.fa ? {x:at.x + w.fa.x, y:at.y + w.fa.y} : null) : outPort(gh[w.a], w.q);
      pt = w.b === null ? (w.fb ? {x:at.x + w.fb.x, y:at.y + w.fb.y} : null) : inPort(gh[w.b], w.p);
      if (!a || !pt) continue;
      wirePath(ctx, a, pt); ctx.stroke();
    }
    for (i = 0; i < gh.length; i++) drawPart(ctx, gh[i], STUB);
    ctx.restore();
    ctx.strokeStyle = C.sel; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
    ctx.strokeRect(at.x - 6.5, at.y - 6.5, clip.w + 13, clip.h + 13);
    ctx.setLineDash([]);
  }
  pickBar();
}
function sizeCanvas(){
  dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(cv.clientWidth * dpr);
  cv.height = Math.round(cv.clientHeight * dpr);
}

/* ---------- hit tests ---------- */
function toWorld(e){
  var r = cv.getBoundingClientRect();
  return {x:(e.clientX - r.left - pan.x) / zoom, y:(e.clientY - r.top - pan.y) / zoom};
}
function near(p, q, d){ var dx = p.x - q.x, dy = p.y - q.y; return dx * dx + dy * dy <= d * d; }
/* The nearest port within reach. A chip's pins sit closer together than the
   reach, so it is the nearest that counts, not the first one found. */
function portAt(p){
  var i, j, n, pt, best = null, bd = PORT * PORT + 0.01, d2;
  var see = function(kind, n, j, pt){
    d2 = (pt.x - p.x) * (pt.x - p.x) + (pt.y - p.y) * (pt.y - p.y);
    if (d2 < bd){ bd = d2; best = {kind:kind, id:n.id, p:j, pos:pt}; }
  };
  for (i = nodes.length - 1; i >= 0; i--){
    n = nodes[i];
    for (j = 0; j < nOut(n); j++) see("out", n, j, outPort(n, j));
    for (j = 0; j < nIn(n); j++) see("in", n, j, inPort(n, j));
  }
  return best;
}
function nodeAt(p){
  var i, n, b;
  for (i = nodes.length - 1; i >= 0; i--){
    n = nodes[i]; b = box(n);
    if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return n;
  }
  return null;
}
/* Points are small and their ports sit on the dot, so they get their own disc. */
function pointAt(p){
  var i, n;
  for (i = nodes.length - 1; i >= 0; i--){
    n = nodes[i];
    if (isPt(n) && near(p, n, PTR + 7)) return n;
  }
  return null;
}
function nearestPort(n, p, kind){
  var best = 0, bd = Infinity, j, pt, d2, k = kind === "in" ? nIn(n) : nOut(n);
  var at = function(j){ return kind === "in" ? inPort(n, j) : outPort(n, j); };
  for (j = 0; j < k; j++){
    pt = at(j); d2 = (pt.x - p.x) * (pt.x - p.x) + (pt.y - p.y) * (pt.y - p.y);
    if (d2 < bd){ bd = d2; best = j; }
  }
  return {kind:kind, id:n.id, p:best, pos:at(best)};
}
/* A port under the pointer, or the most plausible port of the part under it. */
function portTarget(p, want){
  var ph = portAt(p), n;
  if (ph && (!want || ph.kind === want)) return ph;
  n = pointAt(p) || nodeAt(p);
  if (!n) return null;
  if (want === "out") return hasOut(n) ? nearestPort(n, p, "out") : null;
  if (want === "in") return nIn(n) ? nearestPort(n, p, "in") : null;
  if (hasOut(n)) return nearestPort(n, p, "out");
  return nIn(n) ? nearestPort(n, p, "in") : null;
}
function onSeg(p, a, b){
  var vx = b.x - a.x, vy = b.y - a.y, len = vx * vx + vy * vy, t = 0;
  if (len > 0) t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / len));
  return near(p, {x:a.x + vx * t, y:a.y + vy * t}, 7);
}
/* ---------- rubber band ---------- */
function marqRect(m){
  return {x:Math.min(m.x0, m.x), y:Math.min(m.y0, m.y),
          w:Math.abs(m.x - m.x0), h:Math.abs(m.y - m.y0)};
}
function inRect(r, p){ return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; }
/* A part is taken when the band touches its box; a wire when the band holds both
   of its ends, so a run leaving the region is left where it is. */
function applyMarq(m){
  var r = marqRect(m), i, n, w, a, b;
  if (!m.add) clearPick();
  if (r.w < 3 && r.h < 3) return;
  for (i = 0; i < nodes.length; i++){ n = nodes[i]; if (hits(box(n), r)) pickN.add(n.id); }
  for (i = 0; i < wires.length; i++){
    w = wires[i]; a = endA(w); b = endB(w);
    if (a && b && inRect(r, a) && inRect(r, b)) pickW.add(w.id);
  }
  pickSpread();
}
function wireAt(p){
  var i, w, a, b;
  for (i = wires.length - 1; i >= 0; i--){
    w = wires[i]; a = endA(w); b = endB(w);
    if (!a || !b) continue;
    if (onSeg(p, a, b)) return w;
  }
  return null;
}
