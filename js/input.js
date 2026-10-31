/* Pointer, touch, zoom and keyboard input on the sheet. */
"use strict";

/* ---------- pointer ---------- */
/* Everything that moves under one drag: the part the pointer took hold of, and,
   if that part was part of a picked region, the rest of the region with it —
   loose wire ends included, so a block of circuit travels whole. */
function dragSet(p, primary, group){
  var off = [], seen = new Set(), i, w;
  var add = function(o){ off.push({o:o, dx:p.x - o.x, dy:p.y - o.y}); };
  add(primary); seen.add(primary);
  if (!group) return off;
  for (i = 0; i < nodes.length; i++)
    if (pickN.has(nodes[i].id) && !seen.has(nodes[i])){ seen.add(nodes[i]); add(nodes[i]); }
  for (i = 0; i < wires.length; i++){
    w = wires[i];
    if (!pickW.has(w.id)) continue;
    if (w.fa && !seen.has(w.fa)){ seen.add(w.fa); add(w.fa); }
    if (w.fb && !seen.has(w.fb)){ seen.add(w.fb); add(w.fb); }
  }
  return off;
}
/* Shift adds to the picked set or drops out of it; a plain click starts afresh. */
function pickHit(k, id, e){
  var set = k === "n" ? pickN : pickW;
  if (e.shiftKey){
    if (set.has(id)) set.delete(id); else { set.add(id); pickSpread(); }
  } else if (!set.has(id)) pickOne(k, id);
  pickDel();
}
/* ---------- zoom ---------- */
/* Zooming scales the sheet about a point on screen, so whatever is under the
   fingers (or the pointer) stays under them. The readout counts from the
   layout's default size - on a tablet that already draws the parts half as big again. */
function clampZ(z){ return Math.max(ZMIN, Math.min(ZMAX, z)); }
function zoomShow(){ $("#zPct").textContent = Math.round(zoom / ZDEF * 100) + "%"; }
function zoomAt(z, sx, sy){
  if (sx === undefined){ sx = cv.clientWidth / 2; sy = cv.clientHeight / 2; }
  var wx = (sx - pan.x) / zoom, wy = (sy - pan.y) / zoom;
  zoom = clampZ(z);
  pan.x = sx - wx * zoom; pan.y = sy - wy * zoom;
  ren.hidden = true; zoomShow(); draw(); saveCur();
}
/* the whole circuit, as big as the sheet will hold it */
function zoomFit(){
  var r = bounds(), W = cv.clientWidth, H = cv.clientHeight, pad = 40;
  if (!r){ pan = {x:0, y:0}; zoomAt(ZDEF, 0, 0); return; }
  zoom = clampZ(Math.min((W - pad * 2) / Math.max(1, r.x2 - r.x),
                         (H - pad * 2) / Math.max(1, r.y2 - r.y), ZDEF * 2));
  pan.x = (W - (r.x2 - r.x) * zoom) / 2 - r.x * zoom;
  pan.y = (H - (r.y2 - r.y) * zoom) / 2 - r.y * zoom;
  ren.hidden = true; zoomShow(); draw(); saveCur();
}
$("#zOut").addEventListener("click", function(){ zoomAt(zoom / 1.25); });
$("#zIn").addEventListener("click", function(){ zoomAt(zoom * 1.25); });
$("#zPct").addEventListener("click", function(){ zoomAt(ZDEF); });
$("#zFit").addEventListener("click", zoomFit);
cv.addEventListener("wheel", function(e){
  e.preventDefault();
  var r = cv.getBoundingClientRect();
  zoomAt(zoom * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
}, {passive:false});
/* Two fingers pinch. The second finger down turns whatever the first one began
   into a pinch: the half-made gesture is let go (a dragged part keeps where it
   got to, snapped to the grid) and from then on the pair zooms and pans. */
var touches = new Map(), pinch = null;
function pinchSpan(){
  var p = Array.from(touches.values()), r = cv.getBoundingClientRect();
  return {d:Math.max(1, Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y)),
          x:(p[0].x + p[1].x) / 2 - r.left, y:(p[0].y + p[1].y) / 2 - r.top};
}
cv.addEventListener("pointerdown", function(e){
  if (e.pointerType !== "touch") return;
  touches.set(e.pointerId, {x:e.clientX, y:e.clientY});
  if (touches.size < 2) return;
  e.stopImmediatePropagation();
  if (touches.size > 2 || pinch) return;
  var n = drag ? byId.get(drag.id) : null, moved = !!wend || !!(drag && drag.moved && !drag.lock);
  if (n && n.t === "BUTTON"){ n.s = 0; evaluate(); }
  if (drag && drag.off) drag.off.forEach(function(o){
    o.o.x = Math.round(o.o.x / SNAP) * SNAP; o.o.y = Math.round(o.o.y / SNAP) * SNAP;
  });
  drag = null; wiring = null; wend = null; marq = null; panning = null; ren.hidden = true;
  var s = pinchSpan();
  pinch = {d:s.d, z:zoom, wx:(s.x - pan.x) / zoom, wy:(s.y - pan.y) / zoom};
  if (moved) commit(); else draw();
});
window.addEventListener("pointermove", function(e){
  if (!touches.has(e.pointerId)) return;
  touches.set(e.pointerId, {x:e.clientX, y:e.clientY});
  if (!pinch || touches.size !== 2) return;
  var s = pinchSpan();
  zoom = clampZ(pinch.z * s.d / pinch.d);
  pan.x = s.x - pinch.wx * zoom; pan.y = s.y - pinch.wy * zoom;
  zoomShow(); draw();
});
function lift(e){
  if (!touches.delete(e.pointerId)) return;
  if (pinch && touches.size < 2){ pinch = null; saveCur(); }
}
window.addEventListener("pointerup", lift);
window.addEventListener("pointercancel", lift);

cv.addEventListener("pointerdown", function(e){
  ren.hidden = true;
  if (play) playEnd();                /* done watching: straight to the finished sheet */
  var p = toWorld(e), ph, n, w, group;
  cv.setPointerCapture(e.pointerId);
  cursor = p; hover = p;

  /* the middle and right buttons pan whatever tool is in hand, so the sheet can
     always be moved without giving up the band on the left button */
  if (e.button === 1 || e.button === 2 || space){
    e.preventDefault();                 /* no middle-click autoscroll over the sheet */
    panning = {x:e.clientX, y:e.clientY, px:pan.x, py:pan.y};
    return;
  }
  if (e.button !== 0 && e.pointerType === "mouse") return;

  /* locked: the parts worked by hand still answer the pointer, everything else only pans */
  if (testMode){
    n = nodeAt(p);
    if (n && TYPES[n.t].ctl){
      drag = {id:n.id, dx:0, dy:0, moved:false, lock:true};
      if (n.t === "BUTTON"){ n.s = 1; evaluate(); }
      draw(); return;
    }
    panning = {x:e.clientX, y:e.clientY, px:pan.x, py:pan.y};
    draw(); return;
  }

  /* a copy in hand goes down where the pointer says; Shift keeps it in hand */
  if (pasteMode){
    if (!clip){ setPasteMode(false); return; }
    pasteClip({x:p.x - clip.w / 2, y:p.y - clip.h / 2});
    if (e.shiftKey) draw(); else setPasteMode(false);
    return;
  }

  if (wireMode){
    ph = portTarget(p, pend ? (pend.kind === "out" ? "in" : "out") : null);
    if (ph){
      if (!pend){ pend = ph; draw(); }
      else { var ok = connect(pend, ph); pend = null; if (ok) commit(); else draw(); }
      return;
    }
    if (pend){ loose(pend, p); pend = null; commit(); return; }
    panning = {x:e.clientX, y:e.clientY, px:pan.x, py:pan.y};
    draw(); return;
  }

  if (pend){
    ph = portTarget(p, pend.kind === "out" ? "in" : "out");
    if (ph && ph.id === pend.id){ pend = null; draw(); return; }
    if (ph && connect(pend, ph)){ pend = null; commit(); return; }
    loose(pend, p); pend = null; commit(); return;
  }
  var we = endAt(p);
  if (we){ wend = we; pickOne("w", we.w.id); pickDel(); evaluate(); draw(); return; }
  /* A point's two ports share its dot, so the gestures split by intent instead:
     drag the dot to move it, tap it to start a wire from it. */
  n = pointAt(p);
  if (n){
    if (e.shiftKey){ pickHit("n", n.id, e); evaluate(); draw(); return; }
    group = pickN.has(n.id) && picked() > 1;
    if (!group) pickOne("n", n.id);
    drag = {id:n.id, off:dragSet(p, n, group), moved:false, sx:e.clientX, sy:e.clientY};
    nodes.splice(nodes.indexOf(n), 1); nodes.push(n);
    pickDel(); evaluate(); draw(); return;
  }
  ph = portAt(p);
  if (ph){ wiring = {from:ph, p:ph.pos, x:p.x, y:p.y, sx:e.clientX, sy:e.clientY}; draw(); return; }
  n = nodeAt(p);
  if (n){
    if (e.shiftKey){ pickHit("n", n.id, e); evaluate(); draw(); return; }
    group = pickN.has(n.id) && picked() > 1;
    if (!group) pickOne("n", n.id);
    drag = {id:n.id, off:dragSet(p, n, group), moved:false};
    nodes.splice(nodes.indexOf(n), 1); nodes.push(n);
    if (n.t === "BUTTON"){ n.s = 1; }
    pickDel(); evaluate(); draw(); return;
  }
  w = wireAt(p);
  if (w){ pickHit("w", w.id, e); evaluate(); draw(); return; }
  /* Bare sheet. Dragging it moves the sheet under the view, finger or mouse
     alike — that is how a circuit grows past the edge of the window, and it is
     the one gesture that needs no tool in hand. Boxing in a region is the Region
     tool (R), or Shift and drag without leaving the cursor. */
  if (!e.shiftKey) clearPick();
  if (regionMode || e.shiftKey){
    marq = {x0:p.x, y0:p.y, x:p.x, y:p.y, add:e.shiftKey};
  } else {
    panning = {x:e.clientX, y:e.clientY, px:pan.x, py:pan.y};
    cv.style.cursor = "grabbing";
  }
  pickDel(); evaluate(); draw();
});
window.addEventListener("pointermove", function(e){
  if (pend){ cursor = toWorld(e); draw(); }
  if (!drag && !wiring && !panning && !wend && !marq) return;
  var p = toWorld(e), n, i, o;
  if (wend){
    if (wend.e === "a") wend.w.fa = {x:p.x, y:p.y}; else wend.w.fb = {x:p.x, y:p.y};
    draw(); return;
  }
  if (wiring){ wiring.x = p.x; wiring.y = p.y; draw(); return; }
  if (marq){ marq.x = p.x; marq.y = p.y; draw(); return; }
  if (drag){
    n = byId.get(drag.id); if (!n) return;
    if (drag.lock) return;                        /* locked parts never move */
    /* a tap on a point must survive a few pixels of pointer jitter */
    if (!drag.moved && drag.sx !== undefined &&
        near({x:e.clientX, y:e.clientY}, {x:drag.sx, y:drag.sy}, 4)) return;
    for (i = 0; i < drag.off.length; i++){
      o = drag.off[i]; o.o.x = p.x - o.dx; o.o.y = p.y - o.dy;
    }
    drag.moved = true;
    draw(); return;
  }
  pan.x = panning.px + (e.clientX - panning.x);
  pan.y = panning.py + (e.clientY - panning.y);
  draw();
});
/* Where the pointer is resting, so a paste can land under it. */
cv.addEventListener("pointermove", function(e){ hover = toWorld(e); if (pasteMode) draw(); });
cv.addEventListener("pointerleave", function(){ hover = null; if (pasteMode) draw(); });
window.addEventListener("pointerup", function(e){
  var n, p, ph, r;
  if (wiring){
    p = toWorld(e);
    ph = portTarget(p, wiring.from.kind === "out" ? "in" : "out");
    if (ph && connect(wiring.from, ph)){ wiring = null; commit(); }
    else if (near({x:e.clientX, y:e.clientY}, {x:wiring.sx, y:wiring.sy}, 6)){
      pend = wiring.from; wiring = null; draw();
    }
    else { loose(wiring.from, p); wiring = null; commit(); }
  }
  if (wend){ dropEnd(wend, toWorld(e)); wend = null; commit(); }
  if (marq){
    applyMarq(marq); marq = null;
    pickDel(); evaluate(); draw();
    if (picked() > 1) flash(pickN.size + " part" + (pickN.size === 1 ? "" : "s") +
      " picked · Copy on the bar above them, then Paste drops it wherever you click");
  }
  if (drag){
    var lock = !!drag.lock, i, o;
    n = byId.get(drag.id);
    if (n){
      if (n.t === "BUTTON"){ n.s = 0; evaluate(); }
      else if (!drag.moved && tapPart(n)){ /* a switch flipped, a hex input counted on, a clock sped up */ }
      else if (!drag.moved && !lock && isPt(n)){ pend = {kind:"out", id:n.id, p:0, pos:{x:n.x, y:n.y}}; }
      if (drag.moved){
        if (drag.spawn){
          r = cv.getBoundingClientRect();
          if (e.clientX < r.left + 4 || e.clientX > r.right - 4 || e.clientY < r.top + 4 || e.clientY > r.bottom - 4){
            n.x = (70 - pan.x) / zoom + (cascade % 5) * 20;
            n.y = (60 - pan.y) / zoom + (cascade % 7) * 36;
            cascade++;
          }
        }
        /* every piece of what was dragged lands on the grid, not just the part
           the pointer had hold of, so a region keeps its shape */
        for (i = 0; i < (drag.off || []).length; i++){
          o = drag.off[i].o;
          o.x = Math.round(o.x / SNAP) * SNAP; o.y = Math.round(o.y / SNAP) * SNAP;
        }
      }
    }
    drag = null;
    /* driving a locked sheet changes switch state, not the build */
    if (lock){ evaluate(); draw(); saveCur(); } else commit();
  }
  if (panning){ panning = null; cv.style.cursor = cursorFor(); saveCur(); }
});
cv.addEventListener("dblclick", function(e){
  if (testMode) return;
  var p = toWorld(e), n = pointAt(p) || nodeAt(p);
  if (!n) return;
  if (n.t === "RAM" || n.t === "ROM"){ editWords(n); return; }
  var r = cv.getBoundingClientRect(), st = $("#stage").getBoundingClientRect();
  ren.hidden = false;
  ren.style.left = (r.left - st.left + pan.x + n.x * zoom) + "px";
  ren.style.top = (r.top - st.top + pan.y + n.y * zoom - (TYPES[n.t].k === "chip" ? 30 : 22)) + "px";
  ren.value = n.l || ""; ren.dataset.id = n.id;
  ren.focus(); ren.select();
});
/* What a RAM or ROM holds, as sixteen hex digits, address 0 first — the one
   dialog is enough to read it, program it, or wipe it. */
function editWords(n){
  var hex = words(n).map(function(v){ return v.toString(16).toUpperCase(); }).join("");
  ask({title:(n.t === "ROM" ? "Program the ROM" : "RAM contents"), ok:"Store", value:hex,
    msg:"Sixteen hex digits, 0–F, one per word: address 0 first, address F last.",
    check:function(v){
      v = (v || "").replace(/\s+/g, "");
      return /^[0-9a-f]{16}$/i.test(v) ? "" : "That needs exactly sixteen hex digits (0–9, A–F).";
    },
    done:function(v){
      pushUndo();
      n.m = v.replace(/\s+/g, "").split("").map(function(ch){ return parseInt(ch, 16); });
      commit();
      flash((n.t === "ROM" ? "ROM programmed" : "RAM loaded") + " · Ctrl+Z puts the old contents back");
    }});
}
ren.addEventListener("keydown", function(e){
  if (e.key === "Enter") ren.blur();
  if (e.key === "Escape") ren.hidden = true;
  e.stopPropagation();
});
ren.addEventListener("blur", function(){
  var n = byId.get(ren.dataset.id);
  if (n){ n.l = ren.value.trim(); commit(); }
  ren.hidden = true;
});
window.addEventListener("keydown", function(e){
  var tag = e.target && e.target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  if (!$("#home").hidden){
    if (e.key === "Escape" && nodes.length) enterBench();
    return;
  }
  if (document.querySelector("#arena:not([hidden]), #login:not([hidden])")) return;
  if (play) playEnd();
  if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")){
    e.preventDefault(); saveBuild(); return;
  }
  if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")){
    e.preventDefault(); undo(); return;
  }
  /* copy, cut, paste, select all — the region keys */
  if ((e.ctrlKey || e.metaKey) && (e.key === "c" || e.key === "C")){
    e.preventDefault(); copyPick(false); return;
  }
  if ((e.ctrlKey || e.metaKey) && (e.key === "x" || e.key === "X")){
    e.preventDefault(); copyPick(true); return;
  }
  if ((e.ctrlKey || e.metaKey) && (e.key === "v" || e.key === "V")){
    e.preventDefault(); pasteClip(); return;
  }
  if ((e.ctrlKey || e.metaKey) && (e.key === "a" || e.key === "A")){
    e.preventDefault(); selectAll(); return;
  }
  if (e.ctrlKey || e.metaKey) return;
  if (e.code === "Space"){ space = true; e.preventDefault(); return; }
  if (e.key === "t" || e.key === "T"){ setTest(!testMode); return; }
  if (e.key === "+" || e.key === "="){ zoomAt(zoom * 1.25); return; }
  if (e.key === "-" || e.key === "_"){ zoomAt(zoom / 1.25); return; }
  if (e.key === "0"){ zoomAt(ZDEF); return; }
  if (testMode) return;
  if (e.key === "Delete" || e.key === "Backspace"){ e.preventDefault(); removeSel(); }
  else if (e.key === "Escape"){
    wiring = null; wend = null; marq = null; clearPick();
    setSelectMode(); evaluate(); draw();
  }
  else if (e.key === "w" || e.key === "W"){ setWireMode(!wireMode); }
  else if (e.key === "r" || e.key === "R"){ setRegionMode(!regionMode); }
  else if (e.key === "p" || e.key === "P"){ setPasteMode(!pasteMode); }
  else if (e.key === "c" || e.key === "C"){ cleanUp(); }
});
window.addEventListener("keyup", function(e){ if (e.code === "Space") space = false; });
window.addEventListener("blur", function(){ space = false; });
cv.addEventListener("contextmenu", function(e){ e.preventDefault(); });
