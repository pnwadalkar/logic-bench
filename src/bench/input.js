/* Pointer, touch, zoom and keyboard input on the sheet. */
import { S, ask, flash, notify } from "./state.js";
import { saveBuild, saveCur } from "./builds.js";
import { bounds, cleanUp, playEnd, setCursor, setRegionMode, setSelectMode, setTest, setWireMode } from "./cleaner.js";
import { SNAP, TYPES, ZMAX, ZMIN, byId, isPt, pickN, pickW } from "./core.js";
import { commit, connect, copyPick, dropEnd, endAt, pasteClip, pushUndo, removeSel, selectAll, setPasteMode, undo } from "./edit.js";
import { enterBench } from "./home.js";
import { applyMarq, draw, near, nodeAt, pointAt, portAt, portTarget, toWorld, wireAt } from "./render.js";
import { clearPick, evaluate, pickOne, pickSpread, picked, words } from "./sim.js";
import { tapPart } from "./timing.js";

/* ---------- pointer ---------- */
/* Everything that moves under one drag: the part the pointer took hold of, and,
   if that part was part of a picked region, the rest of the region with it —
   loose wire ends included, so a block of circuit travels whole. */
export function dragSet(p, primary, group){
  var off = [], seen = new Set(), i, w;
  var add = function(o){ off.push({o:o, dx:p.x - o.x, dy:p.y - o.y}); };
  add(primary); seen.add(primary);
  if (!group) return off;
  for (i = 0; i < S.nodes.length; i++)
    if (pickN.has(S.nodes[i].id) && !seen.has(S.nodes[i])){ seen.add(S.nodes[i]); add(S.nodes[i]); }
  for (i = 0; i < S.wires.length; i++){
    w = S.wires[i];
    if (!pickW.has(w.id)) continue;
    if (w.fa && !seen.has(w.fa)){ seen.add(w.fa); add(w.fa); }
    if (w.fb && !seen.has(w.fb)){ seen.add(w.fb); add(w.fb); }
  }
  return off;
}
/* Shift adds to the picked set or drops out of it; a plain click starts afresh. */
/* A wire runs from a port to a port. Let go of one over bare sheet and there is
   no wire: nothing is left dangling with an end on nothing. */
export function noWire(){ flash("No wire made — a wire needs a port at both ends"); }
export function pickHit(k, id, e){
  var set = k === "n" ? pickN : pickW;
  if (e.shiftKey){
    if (set.has(id)) set.delete(id); else { set.add(id); pickSpread(); }
  } else if (!set.has(id)) pickOne(k, id);
  notify();
}
/* ---------- zoom ---------- */
/* Zooming scales the sheet about a point on screen, so whatever is under the
   fingers (or the pointer) stays under them. The readout counts from the
   layout's default size - on a tablet that already draws the parts half as big again. */
export function clampZ(z){ return Math.max(ZMIN, Math.min(ZMAX, z)); }
/* the zoom readout counts from the layout's own default size */
export function zoomPct(){ return Math.round(S.zoom / S.ZDEF * 100) + "%"; }
/* the little box a part is renamed in: put away */
export function closeRename(){ if (S.rename){ S.rename = null; notify(); } }
export function zoomAt(z, sx, sy){
  if (sx === undefined){ sx = S.cv.clientWidth / 2; sy = S.cv.clientHeight / 2; }
  var wx = (sx - S.pan.x) / S.zoom, wy = (sy - S.pan.y) / S.zoom;
  S.zoom = clampZ(z);
  S.pan.x = sx - wx * S.zoom; S.pan.y = sy - wy * S.zoom;
  closeRename(); notify(); draw(); saveCur();
}
/* the whole circuit, as big as the sheet will hold it */
export function zoomFit(){
  var r = bounds(), W = S.cv.clientWidth, H = S.cv.clientHeight, pad = 40;
  if (!r){ S.pan = {x:0, y:0}; zoomAt(S.ZDEF, 0, 0); return; }
  S.zoom = clampZ(Math.min((W - pad * 2) / Math.max(1, r.x2 - r.x),
                         (H - pad * 2) / Math.max(1, r.y2 - r.y), S.ZDEF * 2));
  S.pan.x = (W - (r.x2 - r.x) * S.zoom) / 2 - r.x * S.zoom;
  S.pan.y = (H - (r.y2 - r.y) * S.zoom) / 2 - r.y * S.zoom;
  closeRename(); notify(); draw(); saveCur();
}

export function onWheel(e){
  e.preventDefault();
  var r = S.cv.getBoundingClientRect();
  zoomAt(S.zoom * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
}
/* Two fingers pinch. The second finger down turns whatever the first one began
   into a pinch: the half-made gesture is let go (a dragged part keeps where it
   got to, snapped to the grid) and from then on the pair zooms and pans. */
export var touches = new Map(); var pinch = null;
export function pinchSpan(){
  var p = Array.from(touches.values()), r = S.cv.getBoundingClientRect();
  return {d:Math.max(1, Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y)),
          x:(p[0].x + p[1].x) / 2 - r.left, y:(p[0].y + p[1].y) / 2 - r.top};
}
/* a second finger down: see above */
export function onTouchDown(e){
  if (e.pointerType !== "touch") return;
  touches.set(e.pointerId, {x:e.clientX, y:e.clientY});
  if (touches.size < 2) return;
  e.stopImmediatePropagation();
  if (touches.size > 2 || pinch) return;
  var n = S.drag ? byId.get(S.drag.id) : null, moved = !!S.wend || !!(S.drag && S.drag.moved && !S.drag.lock);
  if (n && n.t === "BUTTON"){ n.s = 0; evaluate(); }
  if (S.drag && S.drag.off) S.drag.off.forEach(function(o){
    o.o.x = Math.round(o.o.x / SNAP) * SNAP; o.o.y = Math.round(o.o.y / SNAP) * SNAP;
  });
  S.drag = null; S.wiring = null; S.wend = null; S.marq = null; S.panning = null; closeRename();
  var s = pinchSpan();
  pinch = {d:s.d, z:S.zoom, wx:(s.x - S.pan.x) / S.zoom, wy:(s.y - S.pan.y) / S.zoom};
  if (moved) commit(); else draw();
}
export function onTouchMove(e){
  if (!touches.has(e.pointerId)) return;
  touches.set(e.pointerId, {x:e.clientX, y:e.clientY});
  if (!pinch || touches.size !== 2) return;
  var s = pinchSpan();
  S.zoom = clampZ(pinch.z * s.d / pinch.d);
  S.pan.x = s.x - pinch.wx * S.zoom; S.pan.y = s.y - pinch.wy * S.zoom;
  notify(); draw();
}
export function lift(e){
  if (!touches.delete(e.pointerId)) return;
  if (pinch && touches.size < 2){ pinch = null; saveCur(); }
}



export function onPointerDown(e){
  closeRename();
  if (S.play) playEnd();                /* done watching: straight to the finished sheet */
  var p = toWorld(e), ph, n, w, group;
  S.cv.setPointerCapture(e.pointerId);
  S.cursor = p; S.hover = p;

  /* the middle and right buttons pan whatever tool is in hand, so the sheet can
     always be moved without giving up the band on the left button */
  if (e.button === 1 || e.button === 2 || S.space){
    e.preventDefault();                 /* no middle-click autoscroll over the sheet */
    S.panning = {x:e.clientX, y:e.clientY, px:S.pan.x, py:S.pan.y};
    return;
  }
  if (e.button !== 0 && e.pointerType === "mouse") return;

  /* locked: the parts worked by hand still answer the pointer, everything else only pans */
  if (S.testMode){
    n = nodeAt(p);
    if (n && TYPES[n.t].ctl){
      S.drag = {id:n.id, dx:0, dy:0, moved:false, lock:true};
      if (n.t === "BUTTON"){ n.s = 1; evaluate(); }
      draw(); return;
    }
    S.panning = {x:e.clientX, y:e.clientY, px:S.pan.x, py:S.pan.y};
    draw(); return;
  }

  /* a copy in hand goes down where the pointer says; Shift keeps it in hand */
  if (S.pasteMode){
    if (!S.clip){ setPasteMode(false); return; }
    pasteClip({x:p.x - S.clip.w / 2, y:p.y - S.clip.h / 2});
    if (e.shiftKey) draw(); else setPasteMode(false);
    return;
  }

  if (S.wireMode){
    ph = portTarget(p, S.pend ? (S.pend.kind === "out" ? "in" : "out") : null);
    if (ph){
      if (!S.pend){ S.pend = ph; draw(); }
      else { var ok = connect(S.pend, ph); S.pend = null; if (ok) commit(); else draw(); }
      return;
    }
    if (S.pend){ S.pend = null; noWire(); draw(); return; }
    S.panning = {x:e.clientX, y:e.clientY, px:S.pan.x, py:S.pan.y};
    draw(); return;
  }

  if (S.pend){
    ph = portTarget(p, S.pend.kind === "out" ? "in" : "out");
    if (ph && ph.id === S.pend.id){ S.pend = null; draw(); return; }
    if (ph && connect(S.pend, ph)){ S.pend = null; commit(); return; }
    S.pend = null; noWire(); draw(); return;
  }
  var we = endAt(p);
  if (we){ S.wend = we; pickOne("w", we.w.id); notify(); evaluate(); draw(); return; }
  /* A point's two ports share its dot, so the gestures split by intent instead:
     drag the dot to move it, tap it to start a wire from it. */
  n = pointAt(p);
  if (n){
    if (e.shiftKey){ pickHit("n", n.id, e); evaluate(); draw(); return; }
    group = pickN.has(n.id) && picked() > 1;
    if (!group) pickOne("n", n.id);
    S.drag = {id:n.id, off:dragSet(p, n, group), moved:false, sx:e.clientX, sy:e.clientY};
    S.nodes.splice(S.nodes.indexOf(n), 1); S.nodes.push(n);
    notify(); evaluate(); draw(); return;
  }
  ph = portAt(p);
  if (ph){ S.wiring = {from:ph, p:ph.pos, x:p.x, y:p.y, sx:e.clientX, sy:e.clientY}; draw(); return; }
  n = nodeAt(p);
  if (n){
    if (e.shiftKey){ pickHit("n", n.id, e); evaluate(); draw(); return; }
    group = pickN.has(n.id) && picked() > 1;
    if (!group) pickOne("n", n.id);
    S.drag = {id:n.id, off:dragSet(p, n, group), moved:false};
    S.nodes.splice(S.nodes.indexOf(n), 1); S.nodes.push(n);
    if (n.t === "BUTTON"){ n.s = 1; }
    notify(); evaluate(); draw(); return;
  }
  w = wireAt(p);
  if (w){ pickHit("w", w.id, e); evaluate(); draw(); return; }
  /* Bare sheet. Dragging it moves the sheet under the view, finger or mouse
     alike — that is how a circuit grows past the edge of the window, and it is
     the one gesture that needs no tool in hand. Boxing in a region is the Region
     tool (R), or Shift and drag without leaving the cursor. */
  if (!e.shiftKey) clearPick();
  if (S.regionMode || e.shiftKey){
    S.marq = {x0:p.x, y0:p.y, x:p.x, y:p.y, add:e.shiftKey};
  } else {
    S.panning = {x:e.clientX, y:e.clientY, px:S.pan.x, py:S.pan.y};
    S.cv.style.cursor = "grabbing";
  }
  notify(); evaluate(); draw();
}
export function onPointerMove(e){
  if (S.pend){ S.cursor = toWorld(e); draw(); }
  if (!S.drag && !S.wiring && !S.panning && !S.wend && !S.marq) return;
  var p = toWorld(e), n, i, o;
  if (S.wend){
    if (S.wend.e === "a") S.wend.w.fa = {x:p.x, y:p.y}; else S.wend.w.fb = {x:p.x, y:p.y};
    draw(); return;
  }
  if (S.wiring){ S.wiring.x = p.x; S.wiring.y = p.y; draw(); return; }
  if (S.marq){ S.marq.x = p.x; S.marq.y = p.y; draw(); return; }
  if (S.drag){
    n = byId.get(S.drag.id); if (!n) return;
    if (S.drag.lock) return;                        /* locked parts never move */
    /* a tap on a point must survive a few pixels of pointer jitter */
    if (!S.drag.moved && S.drag.sx !== undefined &&
        near({x:e.clientX, y:e.clientY}, {x:S.drag.sx, y:S.drag.sy}, 4)) return;
    for (i = 0; i < S.drag.off.length; i++){
      o = S.drag.off[i]; o.o.x = p.x - o.dx; o.o.y = p.y - o.dy;
    }
    S.drag.moved = true;
    draw(); return;
  }
  S.pan.x = S.panning.px + (e.clientX - S.panning.x);
  S.pan.y = S.panning.py + (e.clientY - S.panning.y);
  draw();
}
/* While something is being dragged, a touch must belong to the drag alone: left
   to the browser it can pull the page down to refresh or slide the address bar,
   and the viewport shrinks under the finger mid-drag. */
export function onTouchMoveGuard(e){
  if (S.drag || S.wiring || S.wend || S.marq || S.panning) e.preventDefault();
}
/* Where the pointer is resting, so a paste can land under it. */
export function onHover(e){ S.hover = toWorld(e); if (S.pasteMode) draw(); }
export function onLeave(){ S.hover = null; if (S.pasteMode) draw(); }
export function onPointerUp(e){
  var n, p, ph, r;
  if (S.wiring){
    p = toWorld(e);
    ph = portTarget(p, S.wiring.from.kind === "out" ? "in" : "out");
    if (ph && connect(S.wiring.from, ph)){ S.wiring = null; commit(); }
    else if (near({x:e.clientX, y:e.clientY}, {x:S.wiring.sx, y:S.wiring.sy}, 6)){
      S.pend = S.wiring.from; S.wiring = null; draw();
    }
    else { S.wiring = null; noWire(); draw(); }
  }
  if (S.wend){ dropEnd(S.wend, toWorld(e)); S.wend = null; commit(); }
  if (S.marq){
    applyMarq(S.marq); S.marq = null;
    notify(); evaluate(); draw();
    if (picked() > 1) flash(pickN.size + " part" + (pickN.size === 1 ? "" : "s") +
      " picked · Copy on the bar above them, then Paste drops it wherever you click");
  }
  if (S.drag){
    var lock = !!S.drag.lock, i, o;
    n = byId.get(S.drag.id);
    if (n){
      if (n.t === "BUTTON"){ n.s = 0; evaluate(); }
      else if (!S.drag.moved && tapPart(n)){ /* a switch flipped, a hex input counted on, a clock sped up */ }
      else if (!S.drag.moved && !lock && isPt(n)){ S.pend = {kind:"out", id:n.id, p:0, pos:{x:n.x, y:n.y}}; }
      if (S.drag.moved){
        if (S.drag.spawn){
          r = S.cv.getBoundingClientRect();
          if (e.clientX < r.left + 4 || e.clientX > r.right - 4 || e.clientY < r.top + 4 || e.clientY > r.bottom - 4){
            /* let go off the sheet: bring it in, with a whole saved area moving as one */
            var tx = (70 - S.pan.x) / S.zoom + (S.cascade % 5) * 20, ty = (60 - S.pan.y) / S.zoom + (S.cascade % 7) * 36;
            var sx = tx - n.x, sy = ty - n.y;
            for (i = 0; i < S.drag.off.length; i++){ S.drag.off[i].o.x += sx; S.drag.off[i].o.y += sy; }
            S.cascade++;
          }
        }
        /* every piece of what was dragged lands on the grid, not just the part
           the pointer had hold of, so a region keeps its shape */
        for (i = 0; i < (S.drag.off || []).length; i++){
          o = S.drag.off[i].o;
          o.x = Math.round(o.x / SNAP) * SNAP; o.y = Math.round(o.y / SNAP) * SNAP;
        }
      }
    }
    S.drag = null;
    /* driving a locked sheet changes switch state, not the build */
    if (lock){ evaluate(); draw(); saveCur(); } else commit();
  }
  if (S.panning){ S.panning = null; setCursor(); saveCur(); }
}
export function onDblClick(e){
  if (S.testMode) return;
  var p = toWorld(e), n = pointAt(p) || nodeAt(p);
  if (!n) return;
  if (n.t === "RAM" || n.t === "ROM"){ editWords(n); return; }
  /* the canvas fills the stage, so a sheet point is a stage point */
  S.rename = {id:n.id, value:n.l || "", left:S.pan.x + n.x * S.zoom,
    top:S.pan.y + n.y * S.zoom - (TYPES[n.t].k === "chip" ? 30 : 22)};
  notify();
}
/* What a RAM or ROM holds, as sixteen hex digits, address 0 first — the one
   dialog is enough to read it, program it, or wipe it. */
export function editWords(n){
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
/* the rename box is done with: the part takes the name typed, or keeps its own */
export function renameDone(value){
  var n = S.rename ? byId.get(S.rename.id) : null;
  S.rename = null;
  if (n && value !== null){ n.l = String(value).trim(); commit(); }
  notify();
}
export function onKeyDown(e){
  var tag = e.target && e.target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  if (S.dialog || S.chooser) return;
  if (S.homeOpen){
    if (e.key === "Escape" && S.nodes.length) enterBench();
    return;
  }
  if (S.arenaOpen || S.login) return;
  if (S.play) playEnd();
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
  if (e.code === "Space"){ S.space = true; e.preventDefault(); return; }
  if (e.key === "t" || e.key === "T"){ setTest(!S.testMode); return; }
  if (e.key === "+" || e.key === "="){ zoomAt(S.zoom * 1.25); return; }
  if (e.key === "-" || e.key === "_"){ zoomAt(S.zoom / 1.25); return; }
  if (e.key === "0"){ zoomAt(S.ZDEF); return; }
  if (S.testMode) return;
  if (e.key === "Delete" || e.key === "Backspace"){ e.preventDefault(); removeSel(); }
  else if (e.key === "Escape"){
    S.wiring = null; S.wend = null; S.marq = null; clearPick();
    setSelectMode(); evaluate(); draw();
  }
  else if (e.key === "w" || e.key === "W"){ setWireMode(!S.wireMode); }
  else if (e.key === "r" || e.key === "R"){ setRegionMode(!S.regionMode); }
  else if (e.key === "p" || e.key === "P"){ setPasteMode(!S.pasteMode); }
  else if (e.key === "c" || e.key === "C"){ cleanUp(); }
}
export function onKeyUp(e){ if (e.code === "Space") S.space = false; }
export function onBlur(){ S.space = false; }
export function onContextMenu(e){ e.preventDefault(); }

/* Hang every listener the sheet needs on its canvas, and on the window for the
   moves and releases that happen off it. Returns the function that takes them
   all down again. The touch listeners go first: a second finger turns whatever
   the first began into a pinch, and stops the event there. */
export function attachInput(cv){
  var list = [
    [cv, "wheel", onWheel, {passive:false}],
    [cv, "pointerdown", onTouchDown],
    [window, "pointermove", onTouchMove],
    [window, "pointerup", lift],
    [window, "pointercancel", lift],
    [cv, "pointerdown", onPointerDown],
    [window, "pointermove", onPointerMove],
    [document, "touchmove", onTouchMoveGuard, {passive:false}],
    [cv, "pointermove", onHover],
    [cv, "pointerleave", onLeave],
    [window, "pointerup", onPointerUp],
    [cv, "dblclick", onDblClick],
    [window, "keydown", onKeyDown],
    [window, "keyup", onKeyUp],
    [window, "blur", onBlur],
    [cv, "contextmenu", onContextMenu]
  ];
  list.forEach(function(l){ l[0].addEventListener(l[1], l[2], l[3]); });
  return function(){ list.forEach(function(l){ l[0].removeEventListener(l[1], l[2], l[3]); }); };
}
