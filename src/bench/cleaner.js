/* Cleaner looks: the passes that square a circuit up, and the panel that shows them run. */
import { S, ask, flash, notify } from "./state.js";
import { load, snapshot } from "./builds.js";
import { Collab } from "./collab.js";
import { GRID, PTR, SNAP, STUB, box, byId, hasOut, inPort, isPt, nIn, newId, outPort } from "./core.js";
import { addNode, commit, pushUndo } from "./edit.js";
import { closeRename } from "./input.js";
import { draw, render } from "./render.js";
import { clearPick, evaluate, reindex } from "./sim.js";

/* ---------- cleaner ---------- */
/* Cleaner looks. Six passes, in this order, because the order is what makes it
   work. Each one only ever tightens or straightens; none of them can hide a part
   behind another or send a signal backwards.

   1. Dissolve. A corner is only ever geometry: one driver goes in and the same
      level comes out, so every unnamed one is spliced away and its branches hang
      straight off the output that was feeding it. Pass 6 draws the corners the
      layout actually needs. That is what makes the cleaner idempotent — run it
      twice and the second run finds the same sheet rather than piling corner on
      corner. A junction several drivers meet at means something no wire does, so
      that one stays, and so does any corner you have named.

   2. Columns. Every part sits one column to the right of the furthest-right thing
      that drives it, so the signal always reads left to right. A column is only
      as wide as its widest part, and the columns are set down one COLGAP apart —
      that alone takes most of the width out of a hand-drawn sheet. The lamps
      are the exception: a lamp is a readout and not a stage, so they all go in
      one column of their own past the right-hand end of the wiring, and the
      answers are read off down a single edge of the sheet.

   3. Stack. Inside a column the parts are ordered by the height of what feeds
      them, then packed ROWGAP apart. Ordering by feed is what uncrosses wires;
      packing is what takes the height out. The inputs are the exception here:
      nothing feeds them, so their order is the one thing only the person who
      drew the sheet can say, and pass 2b pins it as it was found.

   4. Rows. A wire that should run level is a promise that its two ports share a
      y, and the parts tied by such promises travel as one rigid row. Promises are
      taken in the order they already nearly hold. Columns make nearly all of them
      keepable: two parts tied level can only collide if they share a column.

   4a. Order. Keeping a run level means moving the parts it ties, so pass 4 can
      slide one input past another and undo the order pass 2b pinned. The inputs
      are therefore dealt their own heights back out, in pin order: they all sit
      in one column and all stand the same height, so this only ever swaps two of
      them over, and the sheet is as tightly packed after it as before. A run
      left on a slant by the swap is squared off by pass 6 like any other.

   5. Squeeze. Whole rows — not single parts — are slid up until only ROWGAP of
      blank sheet is left between them, so a run that was just made straight stays
      straight while the drawing gets shorter.

   6. Routing. Every promise that had to be refused, and every level run that would
      pass straight through a part, is drawn the way it would be by hand: level out
      of the output, along a lane beside the column, over a clear channel if it has
      far to go, down a lane in front of the target column, level into the input.
      Each net gets a lane of its own and the gaps are widened to hold them, so
      two nets are never drawn on top of one another and no wire hides behind a part.

   So nothing is left on a slant, nothing had to be stacked to get there, and the
   whole thing ends up in a fraction of the space. */
/* Roomy on purpose: the point of the cleaner is a drawing you can follow with a
   finger, so a wire's route is never squeezed in between its neighbours. */
export var COLGAP = GRID * 2;     /* clear air between one column of parts and the next */
export var ROWGAP = GRID;         /* clear air between two parts stacked in one column */
export var ROOM = SNAP;           /* the least air two part boxes may be pushed to */
export var LEAN = 1;              /* a slant under a pixel is not worth a corner */
export var LANE = GRID;           /* the width of one lane, in the gap beside a column */

/* 1. A corner with one driver behind it hands that driver's level straight on, so
      it is spliced out and whatever it fed is hung on the driver instead. Chains
      of them dissolve one link per sweep, so the sweeps repeat until the sheet
      stops changing. */
export function dissolvePoints(){
  var gone = 0, pass, k;
  var sweep = function(){
    var i, j, n, ins, outs, cut = 0, seen = {}, ok;
    for (i = S.nodes.length - 1; i >= 0; i--){
      n = S.nodes[i];
      if (!isPt(n) || n.l) continue;                /* a corner you named is yours */
      ins = []; outs = [];
      for (j = 0; j < S.wires.length; j++){
        if (S.wires[j].b === n.id) ins.push(S.wires[j]);
        if (S.wires[j].a === n.id) outs.push(S.wires[j]);
      }
      /* several drivers meeting at one dot is a net, not geometry: it stays */
      if (ins.length !== 1 || !ins[0].a || !outs.length) continue;
      ok = true;
      for (j = 0; j < outs.length; j++)
        if (!outs[j].b || outs[j].b === ins[0].a) ok = false;  /* loose end, or self-wiring */
      if (!ok) continue;
      for (j = 0; j < outs.length; j++){ outs[j].a = ins[0].a; outs[j].q = ins[0].q | 0; }
      S.wires.splice(S.wires.indexOf(ins[0]), 1);
      S.nodes.splice(i, 1);
      cut++;
    }
    if (!cut) return 0;
    /* the splice can leave two identical wires on one input; one of them is enough */
    S.wires = S.wires.filter(function(w){
      if (!w.a || !w.b) return true;
      var key = w.a + "." + (w.q | 0) + ">" + w.b + ":" + w.p;
      if (seen[key]) return false;
      seen[key] = 1; return true;
    });
    reindex();
    return cut;
  };
  for (pass = 0; pass < 12; pass++){
    k = sweep();
    gone += k;
    if (!k) break;
  }
  return gone;
}

/* 2. Which column each part belongs in. Bounded passes, so a feedback loop
      settles on a number instead of spinning the CPU. */
export function colOf(){
  var col = new Map(), i, k, w, ca, cb, changed, last;
  for (i = 0; i < S.nodes.length; i++) col.set(S.nodes[i].id, 0);
  for (k = 0; k <= S.nodes.length; k++){
    changed = false;
    for (i = 0; i < S.wires.length; i++){
      w = S.wires[i];
      if (!w.a || !w.b) continue;
      ca = col.get(w.a); cb = col.get(w.b);
      if (ca === undefined || cb === undefined) continue;
      if (cb < ca + 1){ col.set(w.b, ca + 1); changed = true; }
    }
    if (!changed) break;
  }
  /* A lamp is not a stage of the circuit, it is a readout of one. Left to the
     count above, each lamp lands one step to the right of whatever drives it,
     which scatters the readouts all over the sheet — the carry lamp halfway up
     the middle of an adder, the sum lamps somewhere off its right. So the lamps
     are taken out of the count and all put in one column of their own, past the
     right-hand end of the wiring: whatever reaches a lamp early simply carries
     on level until it gets there, and every answer is read off one edge. The
     displays are readouts too — anything with no output is — and go with them. */
  last = -1;
  for (i = 0; i < S.nodes.length; i++)
    if (hasOut(S.nodes[i])) last = Math.max(last, col.get(S.nodes[i].id));
  for (i = 0; i < S.nodes.length; i++)
    if (!hasOut(S.nodes[i])) col.set(S.nodes[i].id, last + 1);
  return col;
}
/* The parts of each column, left to right. */
export function colBands(col){
  var g = new Map(), i, c, keys;
  for (i = 0; i < S.nodes.length; i++){
    c = col.get(S.nodes[i].id) || 0;
    if (!g.has(c)) g.set(c, []);
    g.get(c).push(S.nodes[i]);
  }
  keys = [];
  g.forEach(function(v, k){ keys.push(k); });
  keys.sort(function(a, b){ return a - b; });
  return keys.map(function(k){ return g.get(k); });
}
/* Putting a part at a place.

   A part is held by its corner but laid out by its box, so a pass that wants a
   box edge at some coordinate has to go through the gap between the two. These
   two give that gap from the kind of part — a whole number, the same for every
   part of that kind — and a pass then sets `n.y = top + boxOffY(n)`, which lands
   the part exactly on `top` whatever it was sitting at before.

   Written the obvious way instead, `n.y += top - box(n).y`, it would be the same
   thing in exact arithmetic and something subtly different in a computer's: the
   difference is worked out from where the part was sitting, and a part sitting at
   -15.374999999999998 because an earlier press put it there leaves the
   thousandth of a billionth of a pixel it cannot represent behind in the answer.

   That dust is invisible on screen and fatal to the passes. Pass 4 takes the
   runs in the order of how level they already are, and two runs that are level by
   the same amount — which on a tidy sheet is most of them — then get decided by
   the dust rather than by the sheet. A press starting from a hand-drawn sheet and
   a press starting from an already-cleaned one would keep a different promise,
   square a different corner and land somewhere else: exactly what pass 2a exists
   to prevent. So every pass that sets a place, rather than shifting one, sets it
   through these. */
export function boxOffY(n){ return isPt(n) ? PTR + 4 : 2; }
export function boxOffX(n){ return isPt(n) ? PTR + 4 : (nIn(n) ? STUB : 0) + 2; }
/* Set the columns down a gap apart, each one only as wide as it needs. A column
   of nothing but junctions is a branch, not a stage of the circuit, so it is given
   half the gap — it should read as part of the wiring either side of it.

   The gap is kept narrow, because the gaps are most of the width of a drawing.
   A gap that will have runs turning in it is the exception, and `extra` is the
   room those turns need, in pixels, for each column that needs any. */
export function layoutX(bands, extra){
  var x = 0, i, j, g, wide, b, allPt, gap;
  for (i = 0; i < bands.length; i++){
    g = bands[i]; wide = 0; allPt = true;
    for (j = 0; j < g.length; j++){
      wide = Math.max(wide, box(g[j]).w);
      if (!isPt(g[j])) allPt = false;
    }
    gap = (extra && extra[i]) || 0;
    if (i && gap) x = Math.round((x + gap) / SNAP) * SNAP;
    for (j = 0; j < g.length; j++) g[j].x = x + boxOffX(g[j]);
    x = Math.round((x + wide + (allPt ? COLGAP / 2 : COLGAP)) / SNAP) * SNAP;
  }
}
/* 2a. Where the parts start from, taken from the wiring instead of from wherever
       on the sheet they happen to be sitting.

       Without this the cleaner is a function of the drawing, not of the circuit:
       every pass after it reads the heights it finds, so a press that starts
       from a hand-drawn sheet and a press that starts from an already-cleaned
       one set off down different paths and can finish somewhere different. The
       passes do settle on a small circuit, and then it makes no odds — but on a
       middling one they can go on trading places for longer than anyone is going
       to wait, and whichever round the waiting stopped on is then the answer.

       So the sheet is first put in an order that depends on nothing but the
       wiring and the order the parts were built in. Columns are taken left to
       right and each part is set at the mean of the places its drivers took in
       the columns before it — the ordinary way to uncross a layered drawing, and
       the same idea pass 3 applies afterwards in pixels. The leftmost column,
       and anything fed only from its right, falls back on the order it was built
       in. From there every press runs the same course and lands in the same
       place. */
export function idRank(n){ return parseInt(String(n.id).replace(/\D+/g, ""), 10) || 0; }
/* 2b. The inputs keep the order they are in.

       Nothing drives a switch, so the wiring says nothing whatever about which
       input belongs above which. Left to itself pass 3 orders the leftmost
       column by the heights of the gates it feeds, and a bus drawn A1, B1, CIN,
       A2, B2, A3, B3 comes back in whatever order happened to suit the gates —
       which reads as random, because it is an order nobody chose.

       That one order is the thing the circuit cannot tell you and the person who
       drew it can. So it is read off the sheet once, top to bottom, before
       anything has moved, and then held: the passes order the rest of a column
       by what feeds it as before, and the pinned parts are put back into the
       slots they hold in that column, in pin order.

       Pinning also makes the order stable press to press, which is the same
       thing pass 2a is for: the cleaner leaves the inputs in pin order, so a
       second press reads back the same pins and lays down the same sheet. */
var pin = new Map();
export function pinInputs(){
  var list = [], i, n;
  pin = new Map();
  for (i = 0; i < S.nodes.length; i++){
    n = S.nodes[i];
    if (!nIn(n)) list.push(n);                /* nothing to drive it: it is an input */
  }
  list.sort(function(p, q){
    return box(p).y - box(q).y || box(p).x - box(q).x || idRank(p) - idRank(q);
  });
  for (i = 0; i < list.length; i++) pin.set(list[i].id, i);
}
/* The pinned parts of one column put back in pin order, every other part left in
   the slot the ordering gave it. */
export function repin(g){
  var slots = [], mem = [], i;
  for (i = 0; i < g.length; i++) if (pin.has(g[i].id)){ slots.push(i); mem.push(g[i]); }
  if (mem.length < 2) return;
  mem.sort(function(p, q){ return pin.get(p.id) - pin.get(q.id); });
  for (i = 0; i < slots.length; i++) g[slots[i]] = mem[i];
}
export function seedOrder(bands){
  var rank = new Map(), i, j, g, mean;
  mean = function(n){
    var k, w, r, sum = 0, cnt = 0;
    for (k = 0; k < S.wires.length; k++){
      w = S.wires[k];
      if (w.b !== n.id || !w.a) continue;
      r = rank.get(w.a);
      if (r === undefined) continue;        /* fed from its own right: a loop */
      sum += r; cnt++;
    }
    return cnt ? sum / cnt : Infinity;      /* nothing to go on: built order */
  };
  for (i = 0; i < bands.length; i++){
    g = bands[i];
    if (i) g.sort(function(p, q){ return mean(p) - mean(q) || idRank(p) - idRank(q); });
    else g.sort(function(p, q){ return idRank(p) - idRank(q); });
    repin(g);
    for (j = 0; j < g.length; j++) rank.set(g[j].id, j);
  }
}
/* and the heights to match the order, packed from the top of the sheet down */
export function seedY(bands){
  var i, j, g, y, b;
  for (i = 0; i < bands.length; i++){
    g = bands[i]; y = 0;
    for (j = 0; j < g.length; j++){
      b = box(g[j]);
      g[j].y = y + boxOffY(g[j]);
      y = Math.round((y + b.h + ROWGAP) / SNAP) * SNAP;
    }
  }
}
/* 3. Order a column by the height of what drives it (or, for the leftmost
      column, of what it drives), then pack it from its own top down. */
export function stackY(bands){
  var side = function(bands, back){
    var i, j, k, g, mid = new Map(), top, hb;
    for (i = 0; i < bands.length; i++){
      g = back ? bands[bands.length - 1 - i] : bands[i];
      for (j = 0; j < g.length; j++){
        var n = g[j], sum = 0, cnt = 0;
        for (k = 0; k < S.wires.length; k++){
          var w = S.wires[k], o = null;
          if (!w.a || !w.b) continue;
          if (!back && w.b === n.id) o = byId.get(w.a);
          if (back && w.a === n.id) o = byId.get(w.b);
          if (!o) continue;
          sum += box(o).y + box(o).h / 2; cnt++;
        }
        mid.set(n.id, cnt ? sum / cnt : box(n).y + box(n).h / 2);
      }
      top = Infinity;
      for (j = 0; j < g.length; j++) top = Math.min(top, box(g[j]).y);
      /* ties settled by the part's own id, never by where it sits in the list:
         the sort runs inside the pass that is moving these parts, so comparing
         their live positions here would not even be a consistent order */
      g.sort(function(p, q){
        return mid.get(p.id) - mid.get(q.id) ||
               (p.id < q.id ? -1 : p.id > q.id ? 1 : 0);
      });
      repin(g);           /* an input's order is the drawer's, not the gates' */
      for (j = 0; j < g.length; j++){
        hb = box(g[j]);
        g[j].y = top + boxOffY(g[j]);
        top = Math.round((top + hb.h + ROWGAP) / SNAP) * SNAP;
      }
    }
  };
  side(bands, false); side(bands, true); side(bands, false);
}

/* Both ends of a wire, as the parts they sit on and the points they are drawn to. */
export function ends(w){
  var a = w.a ? byId.get(w.a) : null, b = w.b ? byId.get(w.b) : null;
  var pa = a ? outPort(a, w.q) : w.fa, pb = b ? inPort(b, w.p) : w.fb;
  if (!pa || !pb) return null;
  return {w:w, a:a, b:b, pa:pa, pb:pb};
}
/* Which coordinate the two ends have to share. A part's stubs point sideways, so
   a run into one is made level. Only a run between loose ends and Points is free
   to stand up instead, which is how a vertical branch gets built in the first place. */
export function runAxis(e){
  var free = (!e.a || isPt(e.a)) && (!e.b || isPt(e.b));
  return (free && Math.abs(e.pb.y - e.pa.y) > Math.abs(e.pb.x - e.pa.x)) ? "x" : "y";
}
export function leanOf(e, axis){ return axis === "y" ? e.pb.y - e.pa.y : e.pb.x - e.pa.x; }
export function coordOf(axis, n){ return axis === "y" ? n.y : n.x; }
export function boxAt(n, x, y){ var b = box(n); return {x:b.x + (x - n.x), y:b.y + (y - n.y), w:b.w, h:b.h}; }
export function hits(A, B){
  return Math.min(A.x + A.w, B.x + B.w) > Math.max(A.x, B.x) &&
         Math.min(A.y + A.h, B.y + B.h) > Math.max(A.y, B.y);
}

/* A rigid row: parts whose coordinate on one axis is pinned to each other, so the
   whole row slides as one piece. rel is where a member sits when the row is left
   where it was found, which is why a part nothing ties to never moves at all. */
export function rowsNew(axis){ return {axis:axis, at:new Map(), rel:new Map(), mem:[]}; }
export function rowFind(R, n){
  if (!R.at.has(n.id)){
    R.at.set(n.id, R.mem.length); R.rel.set(n.id, coordOf(R.axis, n)); R.mem.push([n]);
  }
  return R.at.get(n.id);
}
export function relBox(R, n, s){
  var v = R.rel.get(n.id) + s;
  return R.axis === "y" ? boxAt(n, n.x, v) : boxAt(n, v, n.y);
}
/* Tie two parts so that a.coord - b.coord comes out at k. Refused, and left for an
   elbow, when the row already says otherwise or when the join would stack parts. */
export function rowTie(R, a, b, k){
  var ga = rowFind(R, a), gb = rowFind(R, b), i, j, s, A, B;
  if (ga === gb) return Math.abs((R.rel.get(a.id) - R.rel.get(b.id)) - k) < 0.5;
  s = R.rel.get(a.id) - k - R.rel.get(b.id);
  A = R.mem[ga]; B = R.mem[gb];
  for (i = 0; i < A.length; i++)
    for (j = 0; j < B.length; j++){
      /* Two junctions landing near each other is untidy but it hides nothing, and
         refusing the row over it would square the run up with yet another corner
         on every pass. Only a part with a body to hide behind vetoes a row. */
      if (isPt(A[i]) && isPt(B[j])) continue;
      if (hits(relBox(R, A[i], 0), relBox(R, B[j], s))) return false;
    }
  for (i = 0; i < B.length; i++){
    R.rel.set(B[i].id, R.rel.get(B[i].id) + s);
    R.at.set(B[i].id, ga);
    A.push(B[i]);
  }
  R.mem[gb] = [];
  return true;
}
/* Set each row down where it costs the least travel: the middle of where its own
   parts came from. A row of one lands exactly where it was. */
export function rowPlace(R){
  var i, j, g, d, shift;
  for (i = 0; i < R.mem.length; i++){
    g = R.mem[i];
    if (!g.length) continue;
    d = [];
    for (j = 0; j < g.length; j++) d.push(coordOf(R.axis, g[j]) - R.rel.get(g[j].id));
    d.sort(function(p, q){ return p - q; });
    shift = d[d.length >> 1];
    for (j = 0; j < g.length; j++){
      if (R.axis === "y") g[j].y = R.rel.get(g[j].id) + shift;
      else g[j].x = R.rel.get(g[j].id) + shift;
    }
  }
}
/* Two parts, in a fixed order, by the id they were built with. Parts the bench
   made itself are long gone by the time this is asked — pass 1 dissolves every
   corner before anything is laid out — so what is left to compare is the ids of
   the parts the sheet was drawn with, and those do not change from one press to
   the next. */
export function cmpId(a, b){
  var x = a ? a.id : "", y = b ? b.id : "";
  return x < y ? -1 : x > y ? 1 : 0;
}
/* Pin every run that can be pinned, and hand back the ones that cannot. */
export function alignRows(){
  var R = {y:rowsNew("y"), x:rowsNew("x")}, list = [], bad = [], i, e, axis, k;
  for (i = 0; i < S.wires.length; i++){
    e = ends(S.wires[i]);
    if (!e || !e.a || !e.b) continue;        /* a loose end is pulled on to the line later */
    axis = runAxis(e);
    list.push({e:e, axis:axis, off:Math.abs(leanOf(e, axis))});
  }
  /* Straightest first: a run that already holds gets its promise kept, and it is
     the run contradicting it that goes to the elbows. Runs that lean the same
     amount — on a tidy sheet most of them lean none at all — are settled by
     where they are rather than by where they sit in the wire list, because that
     list is reshuffled every time a corner is dissolved and redrawn. Without
     that, the same sheet could refuse a different promise on the second press
     and square off a different corner. Positions can tie too — a tidy sheet is
     full of parts at matching heights — so the last word goes to the ids of the
     parts at either end, which nothing reshuffles. */
  list.sort(function(p, q){
    return p.off - q.off ||
      p.e.pa.x - q.e.pa.x || p.e.pa.y - q.e.pa.y ||
      p.e.pb.x - q.e.pb.x || p.e.pb.y - q.e.pb.y ||
      (p.e.w.p | 0) - (q.e.w.p | 0) ||
      cmpId(p.e.a, q.e.a) || cmpId(p.e.b, q.e.b);
  });
  for (i = 0; i < list.length; i++){
    e = list[i].e; axis = list[i].axis;
    k = axis === "y" ? (e.pb.y - e.b.y) - (e.pa.y - e.a.y)
                     : (e.pb.x - e.b.x) - (e.pa.x - e.a.x);
    if (!rowTie(R[axis], e.a, e.b, k)) bad.push(e.w);
  }
  rowPlace(R.y); rowPlace(R.x);
  return {bad:bad, rows:R.y};
}
/* How far two part boxes lap over each other, on each axis. Positive both ways
   means one is sitting on top of the other. */
export function lap(m, n){
  var A = box(m), B = box(n);
  return {x:Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x),
          y:Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y)};
}
/* Nothing readable hides behind something else. Parts are pushed apart a whole row
   at a time and only vertically, so squaring a run up is not undone to make room
   and the left-to-right flow of the signal is left alone. */
export function unstack(R){
  var solo = new Map();
  var row = function(n){
    var g = R.at.has(n.id) ? R.mem[R.at.get(n.id)] : null;
    if (g && g.length) return g;
    if (!solo.has(n.id)) solo.set(n.id, [n]);
    return solo.get(n.id);
  };
  var slide = function(g, d){ for (var i = 0; i < g.length; i++) g[i].y += d; };
  var k, i, j, o, d, hit, gi, gj;
  for (k = 0; k < 14; k++){
    hit = false;
    for (i = 0; i < S.nodes.length; i++)
      for (j = i + 1; j < S.nodes.length; j++){
        o = lap(S.nodes[i], S.nodes[j]);
        if (o.x <= 0 || o.y <= 0) continue;
        gi = row(S.nodes[i]); gj = row(S.nodes[j]);
        if (gi === gj) continue;             /* one row: it was cleared when it was tied */
        hit = true; d = (o.y + ROOM) / 2;
        if (box(S.nodes[i]).y <= box(S.nodes[j]).y){ slide(gi, -d); slide(gj, d); }
        else { slide(gi, d); slide(gj, -d); }
      }
    if (!hit) return;
  }
}
/* 4a. The inputs get their own heights dealt back out to them, in pin order.

      Pass 4 keeps a run level by moving the parts it ties, and a gate pulls the
      input feeding it towards its own height, so the pass can slide one input
      past another and quietly undo the order pass 2b pinned. Rather than forbid
      that — forbidding it makes pass 4 fling the gates about instead, and then
      nothing fits — the inputs are simply dealt their heights back out
      afterwards: the heights they are sitting at, sorted, handed to them in pin
      order.

      Nothing else on the sheet moves and nothing can collide, because the inputs
      all sit in one column (nothing drives them, so pass 2 puts them all in the
      first) and all stand the same height: the deal only ever swaps two of them
      over in slots that were already theirs. A run left on a slant by a swap is
      squared off by pass 6 along with every other slant. */
export function orderInputs(){
  var list = [], tops = [], i;
  for (i = 0; i < S.nodes.length; i++) if (pin.has(S.nodes[i].id)) list.push(S.nodes[i]);
  if (list.length < 2) return;
  for (i = 0; i < list.length; i++) tops.push(box(list[i]).y);
  tops.sort(function(p, q){ return p - q; });
  list.sort(function(p, q){ return pin.get(p.id) - pin.get(q.id); });
  for (i = 0; i < list.length; i++) list[i].y = tops[i] + boxOffY(list[i]);
}
/* 5. Slide whole rows up until only ROWGAP of blank sheet is left between them.
      A row moves as one piece, so a run that was just made straight stays
      straight; a span that laps over the one above it is already as close as it
      can get and is left alone. */
export function squeezeY(R){
  var seen = new Set(), items = [], i, j, g, lo, hi, it, shift = 0, edge = null, gap, b;
  var span = function(list, lo, hi){
    return {lo:lo, hi:hi, set:function(d){
      for (var k = 0; k < list.length; k++) list[k].y += d;
    }};
  };
  for (i = 0; i < S.nodes.length; i++){
    if (seen.has(S.nodes[i].id)) continue;
    g = R.at.has(S.nodes[i].id) ? R.mem[R.at.get(S.nodes[i].id)] : null;
    if (!g || !g.length) g = [S.nodes[i]];
    lo = Infinity; hi = -Infinity;
    for (j = 0; j < g.length; j++){
      seen.add(g[j].id); b = box(g[j]);
      lo = Math.min(lo, b.y); hi = Math.max(hi, b.y + b.h);
    }
    items.push(span(g, lo, hi));
  }
  /* a wire floating free of every part is one more thing with a height */
  for (i = 0; i < S.wires.length; i++){
    if (S.wires[i].a || S.wires[i].b) continue;
    if (!S.wires[i].fa || !S.wires[i].fb) continue;
    g = [S.wires[i].fa, S.wires[i].fb];
    items.push(span(g, Math.min(g[0].y, g[1].y), Math.max(g[0].y, g[1].y)));
  }
  items.sort(function(p, q){ return p.lo - q.lo; });
  for (i = 0; i < items.length; i++){
    it = items[i];
    if (edge !== null){
      gap = it.lo - edge;
      if (gap > ROWGAP) shift -= gap - ROWGAP;
    }
    edge = edge === null ? it.hi : Math.max(edge, it.hi);
    it.set(shift);
  }
}
/* A loose end has nothing holding it: it steps on to the line of whatever it is
   wired to, one gap clear of the port, so it follows its part across the sheet. */
export function pullEnds(){
  var i, w, e, axis;
  for (i = 0; i < S.wires.length; i++){
    w = S.wires[i];
    if (w.a && w.b) continue;
    e = ends(w);
    if (!e) continue;
    if (e.a){ w.fb.x = e.pa.x + COLGAP; w.fb.y = e.pa.y; }
    else if (e.b){ w.fa.x = e.pb.x - COLGAP; w.fa.y = e.pb.y; }
    else {
      axis = runAxis(e);
      if (axis === "y") w.fa.y = w.fb.y = Math.round((w.fa.y + w.fb.y) / 2);
      else w.fa.x = w.fb.x = Math.round((w.fa.x + w.fb.x) / 2);
    }
  }
}
/* 6. Routing. Every run that could not be made level, and every level run that would
      cut straight through a part on its way, is drawn the way it would be by hand:
      level out of the output, along a lane in the gap just after the output's column,
      up or down to a clear channel, along the channel past whatever is in the way,
      down a lane in the gap just before the target's column, level into the input.
      A run into the very next column needs no channel: one lane, between the two.

      Two rules keep it readable, and they are what the pass is built around:
        - one net, one lane. Two different nets never share a lane, nor a channel
          height where they would lie on top of each other, because a wire drawn
          over another one reads as a short;
        - a gap is made as wide as the lanes in it need. The pass counts the nets
          that turn in each gap, and if the layout left less room than that the
          columns on the right are slid across to make it — only sideways, so every
          level run stays level.

      Nothing here depends on the order the wires sit in the list: that order is
      reshuffled whenever a corner is dissolved, so everything is sorted by place
      and by id, and a second press lays down the same drawing. */
export function ride(pa, pb, b){
  /* does the straight run pa-pb, level, go through this box? */
  var pad = 3, x1 = Math.min(pa.x, pb.x), x2 = Math.max(pa.x, pb.x);
  return pa.y > b.y - pad && pa.y < b.y + b.h + pad && x2 > b.x && x1 < b.x + b.w;
}
export function blockedRun(e){
  var i, n;
  if (Math.abs(e.pb.y - e.pa.y) > LEAN) return false;
  for (i = 0; i < S.nodes.length; i++){
    n = S.nodes[i];
    if (n === e.a || n === e.b) continue;
    if (ride(e.pa, e.pb, box(n))) return true;
  }
  return false;
}
export function bandEdges(g){
  var lo = Infinity, hi = -Infinity, j, b;
  for (j = 0; j < g.length; j++){ b = box(g[j]); lo = Math.min(lo, b.x); hi = Math.max(hi, b.x + b.w); }
  return {lo:lo, hi:hi};
}
export function route(){
  var col = colOf(), bands = colBands(col), nb = bands.length, bandOf = new Map();
  var jobs = [], jobSet = new Set(), used = [], made = 0, i, j, k, w, e, g, it, d;
  bands.forEach(function(gr, bi){ gr.forEach(function(nd){ bandOf.set(nd.id, bi); }); });

  /* which runs need routing */
  for (i = 0; i < S.wires.length; i++){
    w = S.wires[i]; e = ends(w);
    if (!e || !e.a || !e.b) continue;
    if (runAxis(e) !== "y") continue;           /* a branch standing up between corners is left alone */
    if (Math.abs(e.pb.y - e.pa.y) > LEAN || blockedRun(e)) jobSet.add(w);
  }
  if (!jobSet.size) return 0;
  S.wires.forEach(function(wr){
    if (!jobSet.has(wr)) return;
    var ee = ends(wr), ca = bandOf.get(wr.a), cb = bandOf.get(wr.b);
    jobs.push({w:wr, net:wr.a + "." + (wr.q | 0), ca:ca, cb:cb, adj:cb === ca + 1, y0:ee.pa.y, y1:ee.pb.y});
  });

  /* The lanes each gap needs: the nets that depart through it and the nets that
     arrive through it, one lane per net. Gap g lies to the right of column g. */
  var snapUp = function(v){ return Math.ceil(v / SNAP) * SNAP; };
  var snapDn = function(v){ return Math.floor(v / SNAP) * SNAP; };
  var split = {};            /* "gap|net": this net leaves and arrives through the gap on lanes of its own */
  var keyOf = function(gap, net, kind){ return split[gap + "|" + net] ? net + (kind === "dep" ? "|d" : "|a") : net; };
  /* Two pins a fraction of a pixel apart draw as one line, so rows count as the same row
     when they lie within a pixel of each other, not only when they are equal to the digit. */
  var row = new Map();
  (function(){
    var ys = [], last = null, cur = null;
    jobs.forEach(function(jb){ ys.push(jb.y0, jb.y1); });
    ys.sort(function(p, q){ return p - q; });
    ys.forEach(function(y){
      if (last === null || y - last > 1) cur = Math.round(y);
      row.set(y, cur); last = y;
    });
  })();
  var plan = function(){
    var need = {};
    var want = function(gap, key, anchor, kind, y){
      if (!need[gap]) need[gap] = {};
      var t = need[gap][key] || (need[gap][key] = {y:anchor, dep:{}, arr:{}});
      if (anchor < t.y) t.y = anchor;
      t[kind][row.get(y)] = 1;
    };
    jobs.forEach(function(jb){
      var ag = jb.adj ? jb.ca : jb.cb - 1;
      want(jb.ca, keyOf(jb.ca, jb.net, "dep"), jb.y0, "dep", jb.y0);
      want(ag, keyOf(ag, jb.net, "arr"), jb.y0, "arr", jb.y1);
    });
    return need;
  };
  /* The order of the lanes in one gap, left to right. A net that leaves a part
     runs level from it out to its lane; a net that arrives runs level from its
     lane to the part. So the nets that only leave stand leftmost, the ones that
     only arrive rightmost, and a net that does both is in between. And if one net
     leaves on a row where another arrives, the arriving lane has to stand to the
     right, or the two level stretches would lie on one line and read as one wire.
     Two nets that each leave on the row the other arrives on cannot both be
     satisfied by any order: those come back in `stuck`, to be given a lane for
     leaving and another for arriving. */
  var arrange = function(info){
    var rank = function(k){ var a = Object.keys(info[k].arr).length, d = Object.keys(info[k].dep).length; return a ? (d ? 1 : 2) : 0; };
    var base = Object.keys(info).sort(function(p, q){
      return rank(p) - rank(q) || info[p].y - info[q].y || (p < q ? -1 : p > q ? 1 : 0);
    });
    var after = {}, indeg = {}, order = [], stuck = [], left = base.slice(), pick, a, b, y;
    base.forEach(function(n){ after[n] = []; indeg[n] = 0; });
    base.forEach(function(nn){
      base.forEach(function(mm){
        if (nn === mm) return;
        for (y in info[nn].dep) if (info[mm].arr[y]){ after[nn].push(mm); indeg[mm]++; break; }
      });
    });
    while (left.length){
      pick = -1;
      for (a = 0; a < left.length; a++) if (!indeg[left[a]]){ pick = a; break; }
      if (pick < 0){ stuck = stuck.concat(left); pick = 0; }
      b = left.splice(pick, 1)[0];
      order.push(b);
      after[b].forEach(function(mm){ indeg[mm]--; });
    }
    return {order:order, stuck:stuck};
  };
  var need, ar, it, grew;
  for (it = 0; it < 8; it++){
    need = plan(); ar = {}; grew = 0;
    Object.keys(need).forEach(function(gp){
      ar[gp] = arrange(need[gp]);
      ar[gp].stuck.forEach(function(key){
        if (/\|[da]$/.test(key) || split[gp + "|" + key]) return;
        split[gp + "|" + key] = 1; grew++;
      });
    });
    if (!grew) break;
  }
  var count = function(gap){ return need[gap] ? Object.keys(need[gap]).length : 0; };

  /* make each gap wide enough, left to right, sliding everything to its right */
  for (g = 0; g < nb - 1; g++){
    k = count(g);
    if (!k) continue;
    var L = bandEdges(bands[g]), R = bandEdges(bands[g + 1]);
    var last = snapUp(L.hi + SNAP) + (k - 1) * LANE;
    d = last + SNAP - R.lo;
    if (d <= 0) continue;
    d = snapUp(d);
    for (j = g + 1; j < nb; j++) bands[j].forEach(function(nd){ nd.x += d; });
    for (j = 0; j < S.wires.length; j++){
      if (S.wires[j].fa && S.wires[j].fa.x >= R.lo) S.wires[j].fa.x += d;
      if (S.wires[j].fb && S.wires[j].fb.x >= R.lo) S.wires[j].fb.x += d;
    }
  }
  pullEnds();

  /* hand the lanes out in that order */
  var laneX = {};
  Object.keys(need).map(Number).forEach(function(gap){
    var nets = ar[gap].order.slice(), x0, dir;
    if (gap < 0){ x0 = snapDn(bandEdges(bands[0]).lo - SNAP); dir = -1; nets.reverse(); }   /* the far-left gap is laid out leftwards */
    else { x0 = snapUp(bandEdges(bands[gap]).hi + SNAP); dir = 1; }
    laneX[gap] = {};
    nets.forEach(function(net, ix){ laneX[gap][net] = x0 + dir * ix * LANE; });
  });

  /* heights already spoken for: every run left level, with the span it covers */
  for (i = 0; i < S.wires.length; i++){
    w = S.wires[i];
    if (jobSet.has(w)) continue;
    e = ends(w);
    if (!e || !e.a || !e.b || Math.abs(e.pb.y - e.pa.y) > LEAN) continue;
    used.push({y:e.pa.y, x1:Math.min(e.pa.x, e.pb.x), x2:Math.max(e.pa.x, e.pb.x), net:w.a + "." + (w.q | 0)});
  }
  var clash = function(y, x1, x2, net){
    for (var u = 0; u < used.length; u++){
      if (used[u].net === net) continue;
      if (Math.abs(used[u].y - y) < 1 && Math.min(x2, used[u].x2) - Math.max(x1, used[u].x1) > 1) return true;
    }
    return false;
  };
  /* a channel height, level across the span of columns the run goes over, clear of
     every part in them and of every other net's wire; the nearest one wins */
  var channel = function(jb, x1, x2, pa, pb){
    var lo = Math.min(jb.ca, jb.cb), hi = Math.max(jb.ca, jb.cb), iv = [], c = [], t, m, y, q;
    for (t = lo; t <= hi; t++)
      for (m = 0; m < bands[t].length; m++){
        q = box(bands[t][m]); iv.push([q.y - PTR, q.y + q.h + PTR]);
      }
    iv.sort(function(p, r){ return p[0] - r[0]; });
    var mg = [];
    iv.forEach(function(v){
      if (mg.length && v[0] <= mg[mg.length - 1][1]) mg[mg.length - 1][1] = Math.max(mg[mg.length - 1][1], v[1]);
      else mg.push([v[0], v[1]]);
    });
    for (t = 0; t + 1 < mg.length; t++)
      for (y = snapUp(mg[t][1] + 1); y < mg[t + 1][0]; y += SNAP) c.push(y);
    for (t = 0; t < 60; t++){
      c.push(snapDn(mg[0][0] - 1) - t * SNAP);
      c.push(snapUp(mg[mg.length - 1][1] + 1) + t * SNAP);
    }
    c.sort(function(p, r){
      return (Math.abs(p - pa.y) + Math.abs(p - pb.y)) - (Math.abs(r - pa.y) + Math.abs(r - pb.y)) || p - r;
    });
    for (t = 0; t < c.length; t++) if (!clash(c[t], x1, x2, jb.net)) return c[t];
    return c[c.length - 1];
  };

  /* draw them: strict order by place and id, one chain of corners per run, shared
     where two runs of one net go the same way */
  jobs.sort(function(p, q){
    return p.y0 - q.y0 || (p.net < q.net ? -1 : p.net > q.net ? 1 : 0) ||
           ends(p.w).pb.y - ends(q.w).pb.y || ends(p.w).pb.x - ends(q.w).pb.x ||
           (p.w.b < q.w.b ? -1 : p.w.b > q.w.b ? 1 : 0) || (p.w.p | 0) - (q.w.p | 0);
  });
  /* Every run's two level stubs — out of its part to its lane, and from its lane into the
     part it feeds — are heights spoken for too, before any channel is chosen. Otherwise
     a channel picked for one net can land on the very row another net leaves or arrives
     on, and the two read as one wire. */
  jobs.forEach(function(jb){
    var ee = ends(jb.w), pa = ee.pa, pb = ee.pb;
    var ag = jb.adj ? jb.ca : jb.cb - 1, xd = laneX[jb.ca][keyOf(jb.ca, jb.net, "dep")], xa = laneX[ag][keyOf(ag, jb.net, "arr")];
    if (xd === undefined || xa === undefined) return;
    used.push({y:pa.y, x1:Math.min(pa.x, xd), x2:Math.max(pa.x, xd), net:jb.net});
    used.push({y:pb.y, x1:Math.min(xa, pb.x), x2:Math.max(xa, pb.x), net:jb.net});
  });
  var cache = {};
  var chain = function(jb, pts){
    var prev = {id:jb.w.a, q:jb.w.q | 0}, nd, key, s;
    for (s = 0; s < pts.length; s++){
      key = jb.net + "|" + pts[s][0] + "|" + pts[s][1];
      nd = cache[key];
      if (!nd){
        nd = addNode("POINT", pts[s][0], pts[s][1]);
        S.wires.push({id:newId("w"), a:prev.id, q:prev.q, b:nd.id, p:0, fa:null, fb:null});
        cache[key] = nd; made++;
      }
      prev = {id:nd.id, q:0};
    }
    jb.w.a = prev.id; jb.w.q = 0; jb.w.fa = null;
  };
  jobs.forEach(function(jb){
    var ee = ends(jb.w), pa = ee.pa, pb = ee.pb, xd, xa, yc, pts;
    var ag = jb.adj ? jb.ca : jb.cb - 1, dk = keyOf(jb.ca, jb.net, "dep"), ak = keyOf(ag, jb.net, "arr");
    xd = laneX[jb.ca][dk];
    if (jb.adj && dk === ak){                       /* the next column over: one lane does it */
      chain(jb, [[xd, pa.y], [xd, pb.y]]);
      return;
    }
    xa = laneX[ag][ak];
    yc = channel(jb, Math.min(xd, xa), Math.max(xd, xa), pa, pb);
    used.push({y:yc, x1:Math.min(xd, xa), x2:Math.max(xd, xa), net:jb.net});
    pts = [[xd, pa.y], [xd, yc], [xa, yc], [xa, pb.y]];
    chain(jb, pts.filter(function(p, ix){ return !ix || p[0] !== pts[ix - 1][0] || p[1] !== pts[ix - 1][1]; }));
  });
  return made;
}
/* ---------- wiring check ----------
   The Cleaner only ever moves parts and redraws corners — it must never change
   what drives what. This is the proof: every real part's input is traced back
   through any chain of junctions to the real outputs feeding it (a junction can
   have more than one driver tied to it, so the net is the whole set), and the
   result is a signature of the circuit's actual wiring, with every scrap of
   geometry left out. Taken before the passes run and again after, the two must
   read the same — if they don't, a pass broke something, and cleanUp() below
   puts the sheet back exactly as it was rather than hand back a broken circuit. */
export function wireSignature(){
  var parent = new Map();
  var find = function(x){
    var r = x;
    while (parent.get(r) !== r) r = parent.get(r);
    return r;
  };
  var ensure = function(x){ if (!parent.has(x)) parent.set(x, x); return x; };
  var union = function(x, y){
    ensure(x); ensure(y);
    var rx = find(x), ry = find(y);
    if (rx !== ry) parent.set(rx, ry);
  };
  var keyOut = function(id, q){ var n = byId.get(id); return (n && isPt(n)) ? "P:" + id : "O:" + id + ":" + (q | 0); };
  var keyIn = function(id, p){ var n = byId.get(id); return (n && isPt(n)) ? "P:" + id : "I:" + id + ":" + p; };
  var i, w, n, ins, p, k, r, outs, groups = new Map(), sig = [];
  for (i = 0; i < S.wires.length; i++){
    w = S.wires[i];
    if (!w.a || !w.b) continue;
    union(keyOut(w.a, w.q), keyIn(w.b, w.p));
  }
  parent.forEach(function(v, key){
    r = find(key);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(key);
  });
  for (i = 0; i < S.nodes.length; i++){
    n = S.nodes[i];
    if (isPt(n)) continue;
    ins = nIn(n);
    for (p = 0; p < ins; p++){
      k = "I:" + n.id + ":" + p;
      r = parent.has(k) ? find(k) : null;
      outs = r ? groups.get(r).filter(function(s){ return s.charAt(0) === "O"; }).sort() : [];
      sig.push(n.id + "#" + p + "=" + outs.join(","));
    }
  }
  sig.sort();
  return sig.join("|");
}
export function bounds(){
  var i, w, n, b, r = null, add = function(x, y, x2, y2){
    if (!r) r = {x:x, y:y, x2:x2, y2:y2};
    else { r.x = Math.min(r.x, x); r.y = Math.min(r.y, y); r.x2 = Math.max(r.x2, x2); r.y2 = Math.max(r.y2, y2); }
  };
  for (i = 0; i < S.nodes.length; i++){ n = S.nodes[i]; b = box(n); add(b.x, b.y, b.x + b.w, b.y + b.h); }
  for (i = 0; i < S.wires.length; i++){
    w = S.wires[i];
    if (w.fa) add(w.fa.x, w.fa.y, w.fa.x, w.fa.y);
    if (w.fb) add(w.fb.x, w.fb.y, w.fb.x, w.fb.y);
  }
  return r;
}
/* How much sheet the drawing takes up, for the before-and-after. */
export function area(r){ return r ? Math.max(1, (r.x2 - r.x) * (r.y2 - r.y)) : 1; }
/* Where every part and loose end has ended up, to a hundredth of a pixel. The
   settling loop below stops as soon as a pass stops changing this. */
/* Where every part and loose end has ended up, to a hundredth of a pixel, so one
   round of the passes can be told from another. */
export function placeMark(){
  var i, w, s = [];
  for (i = 0; i < S.nodes.length; i++)
    s.push(Math.round(S.nodes[i].x * 100) + "," + Math.round(S.nodes[i].y * 100));
  for (i = 0; i < S.wires.length; i++){
    w = S.wires[i];
    if (w.fa) s.push("a" + Math.round(w.fa.x * 100) + "," + Math.round(w.fa.y * 100));
    if (w.fb) s.push("b" + Math.round(w.fb.x * 100) + "," + Math.round(w.fb.y * 100));
  }
  return s.join(" ");
}
/* How good a sheet this round made: corners it could not avoid first, then the
   paper it takes, then the wire it spends. Fewer, smaller, shorter. */
export function layoutScore(bad){
  var i, e, len = 0;
  for (i = 0; i < S.wires.length; i++){
    e = ends(S.wires[i]);
    if (e) len += Math.abs(e.pb.x - e.pa.x) + Math.abs(e.pb.y - e.pa.y);
  }
  return [bad.length, Math.round(area(bounds())), Math.round(len)];
}
export function scoreLess(p, q){
  for (var i = 0; i < p.length; i++) if (p[i] !== q[i]) return p[i] < q[i];
  return false;
}
/* A round's sheet, kept so it can be gone back to once the rounds are done. The
   loop neither adds nor drops a part or a wire, so position by position is the
   whole of it. */
export function keepPlace(bad, cols){
  var i, w, pos = [], fre = [];
  for (i = 0; i < S.nodes.length; i++) pos.push(S.nodes[i].x, S.nodes[i].y);
  for (i = 0; i < S.wires.length; i++){
    w = S.wires[i];
    fre.push(w.fa ? w.fa.x : 0, w.fa ? w.fa.y : 0, w.fb ? w.fb.x : 0, w.fb ? w.fb.y : 0);
  }
  return {pos:pos, fre:fre, bad:bad, cols:cols, score:layoutScore(bad)};
}
export function putPlace(p){
  var i, w, k;
  for (i = 0; i < S.nodes.length; i++){ S.nodes[i].x = p.pos[i * 2]; S.nodes[i].y = p.pos[i * 2 + 1]; }
  for (i = 0; i < S.wires.length; i++){
    w = S.wires[i]; k = i * 4;
    if (w.fa){ w.fa.x = p.fre[k]; w.fa.y = p.fre[k + 1]; }
    if (w.fb){ w.fb.x = p.fre[k + 2]; w.fb.y = p.fre[k + 3]; }
  }
}
export function bestPlace(log, from){
  var i, b = log[from];
  for (i = from + 1; i < log.length; i++) if (scoreLess(log[i].score, b.score)) b = log[i];
  return b;
}
/* ---------- showing the work ---------- */
/* The cleaner works in named passes, and the whole sheet after each one is kept
   here so the change can be played back a pass at a time instead of landing all
   at once. Keeping a sheet per pass costs nothing worth counting — there are
   seven — and it means the playback is the real thing each pass did rather than
   a drawing of it. */
export function stepTrack(){
  var steps = [{doc:snapshot(), name:"The sheet as it stands"}];
  var step = function(name){ steps.push({doc:snapshot(), name:name}); };
  step.steps = steps;
  return step;
}
export var STEP_MS = 340; export var HOLD_MS = 120; S.stepPlay = true; S.play = null;
export function reduceMotion(){
  return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}
/* The list of passes, the one running now lit: the Steps component draws it. */
export function stepPanel(at){
  S.steps = at ? {at:at, names:S.play.s.slice(1).map(function(s){ return s.name; })} : null;
  notify();
}
/* A pass's sheet, put up without disturbing where the view is pointed: the pan
   is travelled separately, so the drawing is not yanked about as it tidies. */
export function playShow(doc){
  var keep = {x:S.pan.x, y:S.pan.y};
  load(doc); S.pan = keep; evaluate();
}
export function playStage(){
  var prev = S.play.s[S.play.i - 1].doc, cur = S.play.s[S.play.i], was = {}, wasW = {}, mv = [], i, n, o, w;
  for (i = 0; i < prev.nodes.length; i++) was[prev.nodes[i].id] = prev.nodes[i];
  for (i = 0; i < prev.wires.length; i++) wasW[prev.wires[i].id] = prev.wires[i];
  playShow(cur.doc);
  /* a part the pass moved travels; one the pass made starts where it ends, so a
     new corner simply appears at the turn it was made for */
  for (i = 0; i < S.nodes.length; i++){
    n = S.nodes[i]; o = was[n.id];
    mv.push({o:n, x0:o ? o.x : n.x, y0:o ? o.y : n.y, x1:n.x, y1:n.y});
  }
  for (i = 0; i < S.wires.length; i++){
    w = S.wires[i]; o = wasW[w.id];
    if (w.fa) mv.push({o:w.fa, x0:o && o.fa ? o.fa.x : w.fa.x, y0:o && o.fa ? o.fa.y : w.fa.y, x1:w.fa.x, y1:w.fa.y});
    if (w.fb) mv.push({o:w.fb, x0:o && o.fb ? o.fb.x : w.fb.x, y0:o && o.fb ? o.fb.y : w.fb.y, x1:w.fb.x, y1:w.fb.y});
  }
  S.play.mv = mv;
  S.play.pan = {x0:prev.pan ? prev.pan.x : S.pan.x, y0:prev.pan ? prev.pan.y : S.pan.y,
              x1:cur.doc.pan ? cur.doc.pan.x : S.pan.x, y1:cur.doc.pan ? cur.doc.pan.y : S.pan.y};
  S.play.t0 = 0;
  stepPanel(S.play.i);
  S.play.raf = requestAnimationFrame(playFrame);
}
export function playFrame(ts){
  if (!S.play) return;
  if (!S.play.t0) S.play.t0 = ts;
  var d = ts - S.play.t0, k = Math.min(1, d / STEP_MS), e, i, o;
  e = k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) * (1 - k);     /* ease in, ease out */
  for (i = 0; i < S.play.mv.length; i++){
    o = S.play.mv[i];
    o.o.x = o.x0 + (o.x1 - o.x0) * e;
    o.o.y = o.y0 + (o.y1 - o.y0) * e;
  }
  S.pan.x = S.play.pan.x0 + (S.play.pan.x1 - S.play.pan.x0) * e;
  S.pan.y = S.play.pan.y0 + (S.play.pan.y1 - S.play.pan.y0) * e;
  render();
  if (d < STEP_MS + HOLD_MS){ S.play.raf = requestAnimationFrame(playFrame); return; }
  S.play.i++;
  if (S.play.i >= S.play.s.length){ playEnd(); return; }
  playStage();
}
/* Straight to the finished sheet: when the passes have all been shown, and when
   anything at all is asked of the bench while they are still being shown. */
export function playEnd(){
  if (!S.play) return;
  var last = S.play.s[S.play.s.length - 1].doc;
  if (S.play.raf) cancelAnimationFrame(S.play.raf);
  S.play = null;
  stepPanel(0);
  load(last);
  evaluate(); draw();
}
export function playSteps(steps){
  if (S.play) playEnd();
  if (!S.stepPlay || reduceMotion() || steps.length < 2){ stepPanel(0); return; }
  S.play = {s:steps, i:1, raf:0};
  playStage();
}
/* Wires attached to nothing, put back level (or plumb, whichever they leant towards)
   in a row beneath everything else, in the order they were drawn. */
export function layOrphans(list){
  var r = bounds(), x = r ? r.x : 0, y = r ? r.y2 + 60 : 0, i, w, dx, dy;
  for (i = 0; i < list.length; i++){
    w = list[i]; dx = w.fb.x - w.fa.x; dy = w.fb.y - w.fa.y;
    if (Math.abs(dx) >= Math.abs(dy)) dy = 0; else dx = 0;
    w.fa = {x:x, y:y}; w.fb = {x:x + dx, y:y + dy};
    y += Math.abs(dy) + 30;
    S.wires.push(w);
  }
}
/* The cleaner moves parts and adds corners, so it keeps the sheet it started
   from for Ctrl+Z. */
export function cleanUp(sure){
  if (S.docKind === "quantum"){ flash("The Cleaner lays out classical builds only, for now."); return; }
  if (S.testMode) return;
  if (!S.nodes.length){ flash("Nothing on the sheet to clean up yet."); return; }
  if (Collab.active() && sure !== true && Collab.peers().length){
    ask({title:"Tidy the shared sheet", ok:"Tidy it", msg:"The Cleaner rearranges every part on this sheet, including the parts others are working on right now. Ctrl+Z puts yours back.",
      done:function(){ cleanUp(true); }});
    return;
  }
  pushUndo();
  var preDoc = snapshot();
  var preSig = wireSignature();
  var was = area(bounds());
  /* A wire with nothing at either end belongs to no part, so the layout has nothing
     to hold it to. It is set aside while the parts are laid out, then squared and
     laid in a row under the finished circuit — so it lands in the same place every
     press instead of being carried further along each time. */
  var orphans = S.wires.filter(function(w){ return !w.a && !w.b && w.fa && w.fb; });
  if (orphans.length) S.wires = S.wires.filter(function(w){ return orphans.indexOf(w) < 0; });
  var step = stepTrack();            /* the sheet as it stands, to play back from */
  pinInputs();                       /* the order the inputs are in, before a thing has moved */
  dissolvePoints();
  var bands, a = null, i, mark, hit, room = null;
  var seen = new Map(), log = [], best = null;
  step("Corners dissolved — a bend in a wire is only geometry");
  bands = colBands(colOf());
  seedOrder(bands); seedY(bands);
  step("Ordered — from the wiring, with the inputs in the order you drew them");
  /* Stacking orders a column by the height of what feeds it, so it reads the
     heights it finds — and one round therefore lands somewhere the next round
     would still tidy. A small sheet settles after a few rounds; a big one can
     end up with two or three layouts that trade places forever, each round
     undoing the one before. So the rounds run until a sheet turns up that has
     been seen already — a settled sheet repeats itself at once, a pair that
     disagree repeat every two or three rounds — and the tidiest sheet in that
     repeat is the one kept.

     Picking the tidiest sheet in the repeat, rather than whichever round the
     loop happened to stop on, is what keeps the rounds worth running. What makes
     a second press change nothing is pass 2a: both presses start from the same
     order, so both run the same course and arrive at the same repeat. */
  for (i = 0; i < 20; i++){
    bands = colBands(colOf());
    if (!room) room = {};                     /* the gaps are widened for their lanes in pass 6, once the heights are known */
    layoutX(bands, room);
    if (!i) step("Columns — one step right of what drives it, the lamps on one edge");
    stackY(bands);
    if (!i) step("Stacked — each column ordered by what feeds it");
    a = alignRows();
    unstack(a.rows);
    if (!i) step("Straightened — every run that can be level is made level");
    squeezeY(a.rows);
    /* last, because the squeeze moves whole rows and a row reaches as far as its
       furthest-flung member: squeezing can slide one input past another every bit
       as easily as straightening can, so the deal has to come after it */
    orderInputs();
    pullEnds();
    if (!i) step("Squeezed — the dead space taken out, the inputs dealt back in order");
    mark = placeMark();
    hit = seen.get(mark);
    if (hit !== undefined){ best = bestPlace(log, hit); break; }   /* round hit is where the repeat starts */
    seen.set(mark, log.length);
    log.push(keepPlace(a.bad, bands.length));
  }
  if (!best) best = bestPlace(log, 0);     /* no repeat inside the cap: the best of what was seen */
  putPlace(best);
  step("Settled — the rounds repeated until the parts stopped moving");
  /* What has to be routed is read straight off the kept sheet: whatever is still
     on a slant, and whatever runs level straight through a part, rather than
     whatever some round's pass refused halfway through laying it out. */
  var corners = route();
  if (orphans.length) layOrphans(orphans);
  /* the proof: the circuit this round drew must wire up exactly as the one it
     started from did. A mismatch means a pass broke a connection, so the sheet
     goes back to how it stood before Clean was pressed rather than hand back a
     circuit that no longer does what it did. */
  if (wireSignature() !== preSig){
    S.undoStack.pop();
    load(preDoc);
    commit();
    flash("Cleaner found its own tidy-up had changed the wiring, so it put the sheet back as it was.");
    return;
  }
  var r = bounds();
  if (r){ S.pan.x = 48 - r.x * S.zoom; S.pan.y = 40 - r.y * S.zoom; }
  clearPick(); S.pend = null; S.wiring = null; S.wend = null; S.marq = null;
  step("Routed — every net in its own lane, nothing drawn through a part");
  commit();
  playSteps(step.steps);
  var saved = Math.round((1 - area(r) / was) * 100);
  flash("Cleaner looks · " + best.cols + " column" + (best.cols > 1 ? "s" : "") +
    (corners ? " · " + corners + " corner" + (corners > 1 ? "s" : "") + " squared" : "") +
    (saved > 2 ? " · " + saved + "% less space" : "") +
    " · Ctrl+Z puts it back");
}
/* the pointer over the sheet says which tool is in hand */
export function setCursor(){ if (S.cv) S.cv.style.cursor = cursorFor(); }
export function cursorFor(){
  if (S.testMode) return "pointer";
  if (S.pasteMode) return "copy";
  if (S.wireMode) return "cell";
  if (S.regionMode) return "crosshair";
  return "grab";              /* dragging the bare sheet moves it */
}
export function setWireMode(on){
  S.wireMode = !!on; S.pend = null;
  if (S.wireMode){ S.regionMode = false; S.pasteMode = false; }
  notify();
  setCursor();
  draw();
}
/* The band tool: drag anywhere on the sheet to box in a region, finger or mouse. */
export function setRegionMode(on){
  S.regionMode = !!on;
  if (S.regionMode){ S.wireMode = false; S.pasteMode = false; S.pend = null; }
  notify();
  setCursor();
  draw();
}
/* Back to the plain cursor: no wire mode, no band, nothing half-drawn in hand. */
export function setSelectMode(){
  S.wiring = null; S.wend = null; S.marq = null; S.regionMode = false; S.pasteMode = false;
  setWireMode(false);
}
/* Test mode: the circuit is frozen as built and can only be driven. Switches and
   buttons still work; nothing can be moved, wired, renamed or deleted. */
export function setTest(on){
  S.testMode = !!on;
  if (S.testMode){
    S.wiring = null; S.wend = null; S.drag = null; S.marq = null; S.regionMode = false; S.pasteMode = false;
    clearPick(); closeRename();
    setWireMode(false);
  }
  notify();
  setCursor();
  draw();
}
