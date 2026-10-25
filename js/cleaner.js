/* Cleaner looks: the passes that square a circuit up, and the panel that shows them run. */
"use strict";

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

   6. Elbows. Every promise that had to be refused is squared off instead: level
      out of the output, down a lane in the gap before the target column, level
      into the input. Runs leaving one output share the lane, the way a branch is
      drawn by hand.

   So nothing is left on a slant, nothing had to be stacked to get there, and the
   whole thing ends up in a fraction of the space. */
var COLGAP = GRID;         /* clear air between one column of parts and the next */
var ROWGAP = GRID / 2;     /* clear air between two parts stacked in one column */
var ROOM = 6;              /* the least air two part boxes may be pushed to */
var LEAN = 1;              /* a slant under a pixel is not worth a corner */
var LANE = SNAP;           /* how wide a turning lane is, in the gap before a column */

/* 1. A corner with one driver behind it hands that driver's level straight on, so
      it is spliced out and whatever it fed is hung on the driver instead. Chains
      of them dissolve one link per sweep, so the sweeps repeat until the sheet
      stops changing. */
function dissolvePoints(){
  var gone = 0, pass, k;
  var sweep = function(){
    var i, j, n, ins, outs, cut = 0, seen = {}, ok;
    for (i = nodes.length - 1; i >= 0; i--){
      n = nodes[i];
      if (!isPt(n) || n.l) continue;                /* a corner you named is yours */
      ins = []; outs = [];
      for (j = 0; j < wires.length; j++){
        if (wires[j].b === n.id) ins.push(wires[j]);
        if (wires[j].a === n.id) outs.push(wires[j]);
      }
      /* several drivers meeting at one dot is a net, not geometry: it stays */
      if (ins.length !== 1 || !ins[0].a || !outs.length) continue;
      ok = true;
      for (j = 0; j < outs.length; j++)
        if (!outs[j].b || outs[j].b === ins[0].a) ok = false;  /* loose end, or self-wiring */
      if (!ok) continue;
      for (j = 0; j < outs.length; j++) outs[j].a = ins[0].a;
      wires.splice(wires.indexOf(ins[0]), 1);
      nodes.splice(i, 1);
      cut++;
    }
    if (!cut) return 0;
    /* the splice can leave two identical wires on one input; one of them is enough */
    wires = wires.filter(function(w){
      if (!w.a || !w.b) return true;
      var key = w.a + ">" + w.b + ":" + w.p;
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
function colOf(){
  var col = new Map(), i, k, w, ca, cb, changed, last;
  for (i = 0; i < nodes.length; i++) col.set(nodes[i].id, 0);
  for (k = 0; k <= nodes.length; k++){
    changed = false;
    for (i = 0; i < wires.length; i++){
      w = wires[i];
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
     on level until it gets there, and every answer is read off one edge. */
  last = -1;
  for (i = 0; i < nodes.length; i++)
    if (nodes[i].t !== "LAMP") last = Math.max(last, col.get(nodes[i].id));
  for (i = 0; i < nodes.length; i++)
    if (nodes[i].t === "LAMP") col.set(nodes[i].id, last + 1);
  return col;
}
/* The parts of each column, left to right. */
function colBands(col){
  var g = new Map(), i, c, keys;
  for (i = 0; i < nodes.length; i++){
    c = col.get(nodes[i].id) || 0;
    if (!g.has(c)) g.set(c, []);
    g.get(c).push(nodes[i]);
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
function boxOffY(n){ return isPt(n) ? PTR + 4 : 2; }
function boxOffX(n){ return isPt(n) ? PTR + 4 : (nIn(n) ? STUB : 0) + 2; }
/* Set the columns down a gap apart, each one only as wide as it needs. A column
   of nothing but junctions is a branch, not a stage of the circuit, so it is given
   half the gap — it should read as part of the wiring either side of it.

   The gap is kept narrow, because the gaps are most of the width of a drawing.
   A gap that will have runs turning in it is the exception, and `extra` is the
   room those turns need, in pixels, for each column that needs any. */
function layoutX(bands, extra){
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
function idRank(n){ return parseInt(String(n.id).replace(/\D+/g, ""), 10) || 0; }
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
function pinInputs(){
  var list = [], i, n;
  pin = new Map();
  for (i = 0; i < nodes.length; i++){
    n = nodes[i];
    if (!nIn(n)) list.push(n);                /* nothing to drive it: it is an input */
  }
  list.sort(function(p, q){
    return box(p).y - box(q).y || box(p).x - box(q).x || idRank(p) - idRank(q);
  });
  for (i = 0; i < list.length; i++) pin.set(list[i].id, i);
}
/* The pinned parts of one column put back in pin order, every other part left in
   the slot the ordering gave it. */
function repin(g){
  var slots = [], mem = [], i;
  for (i = 0; i < g.length; i++) if (pin.has(g[i].id)){ slots.push(i); mem.push(g[i]); }
  if (mem.length < 2) return;
  mem.sort(function(p, q){ return pin.get(p.id) - pin.get(q.id); });
  for (i = 0; i < slots.length; i++) g[slots[i]] = mem[i];
}
function seedOrder(bands){
  var rank = new Map(), i, j, g, mean;
  mean = function(n){
    var k, w, r, sum = 0, cnt = 0;
    for (k = 0; k < wires.length; k++){
      w = wires[k];
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
function seedY(bands){
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
function stackY(bands){
  var side = function(bands, back){
    var i, j, k, g, mid = new Map(), top, hb;
    for (i = 0; i < bands.length; i++){
      g = back ? bands[bands.length - 1 - i] : bands[i];
      for (j = 0; j < g.length; j++){
        var n = g[j], sum = 0, cnt = 0;
        for (k = 0; k < wires.length; k++){
          var w = wires[k], o = null;
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
function ends(w){
  var a = w.a ? byId.get(w.a) : null, b = w.b ? byId.get(w.b) : null;
  var pa = a ? outPort(a) : w.fa, pb = b ? inPort(b, w.p) : w.fb;
  if (!pa || !pb) return null;
  return {w:w, a:a, b:b, pa:pa, pb:pb};
}
/* Which coordinate the two ends have to share. A part's stubs point sideways, so
   a run into one is made level. Only a run between loose ends and Points is free
   to stand up instead, which is how a vertical branch gets built in the first place. */
function runAxis(e){
  var free = (!e.a || isPt(e.a)) && (!e.b || isPt(e.b));
  return (free && Math.abs(e.pb.y - e.pa.y) > Math.abs(e.pb.x - e.pa.x)) ? "x" : "y";
}
function leanOf(e, axis){ return axis === "y" ? e.pb.y - e.pa.y : e.pb.x - e.pa.x; }
function coordOf(axis, n){ return axis === "y" ? n.y : n.x; }
function boxAt(n, x, y){ var b = box(n); return {x:b.x + (x - n.x), y:b.y + (y - n.y), w:b.w, h:b.h}; }
function hits(A, B){
  return Math.min(A.x + A.w, B.x + B.w) > Math.max(A.x, B.x) &&
         Math.min(A.y + A.h, B.y + B.h) > Math.max(A.y, B.y);
}

/* A rigid row: parts whose coordinate on one axis is pinned to each other, so the
   whole row slides as one piece. rel is where a member sits when the row is left
   where it was found, which is why a part nothing ties to never moves at all. */
function rowsNew(axis){ return {axis:axis, at:new Map(), rel:new Map(), mem:[]}; }
function rowFind(R, n){
  if (!R.at.has(n.id)){
    R.at.set(n.id, R.mem.length); R.rel.set(n.id, coordOf(R.axis, n)); R.mem.push([n]);
  }
  return R.at.get(n.id);
}
function relBox(R, n, s){
  var v = R.rel.get(n.id) + s;
  return R.axis === "y" ? boxAt(n, n.x, v) : boxAt(n, v, n.y);
}
/* Tie two parts so that a.coord - b.coord comes out at k. Refused, and left for an
   elbow, when the row already says otherwise or when the join would stack parts. */
function rowTie(R, a, b, k){
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
function rowPlace(R){
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
function cmpId(a, b){
  var x = a ? a.id : "", y = b ? b.id : "";
  return x < y ? -1 : x > y ? 1 : 0;
}
/* Pin every run that can be pinned, and hand back the ones that cannot. */
function alignRows(){
  var R = {y:rowsNew("y"), x:rowsNew("x")}, list = [], bad = [], i, e, axis, k;
  for (i = 0; i < wires.length; i++){
    e = ends(wires[i]);
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
function lap(m, n){
  var A = box(m), B = box(n);
  return {x:Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x),
          y:Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y)};
}
/* Nothing readable hides behind something else. Parts are pushed apart a whole row
   at a time and only vertically, so squaring a run up is not undone to make room
   and the left-to-right flow of the signal is left alone. */
function unstack(R){
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
    for (i = 0; i < nodes.length; i++)
      for (j = i + 1; j < nodes.length; j++){
        o = lap(nodes[i], nodes[j]);
        if (o.x <= 0 || o.y <= 0) continue;
        gi = row(nodes[i]); gj = row(nodes[j]);
        if (gi === gj) continue;             /* one row: it was cleared when it was tied */
        hit = true; d = (o.y + ROOM) / 2;
        if (box(nodes[i]).y <= box(nodes[j]).y){ slide(gi, -d); slide(gj, d); }
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
function orderInputs(){
  var list = [], tops = [], i;
  for (i = 0; i < nodes.length; i++) if (pin.has(nodes[i].id)) list.push(nodes[i]);
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
function squeezeY(R){
  var seen = new Set(), items = [], i, j, g, lo, hi, it, shift = 0, edge = null, gap, b;
  var span = function(list, lo, hi){
    return {lo:lo, hi:hi, set:function(d){
      for (var k = 0; k < list.length; k++) list[k].y += d;
    }};
  };
  for (i = 0; i < nodes.length; i++){
    if (seen.has(nodes[i].id)) continue;
    g = R.at.has(nodes[i].id) ? R.mem[R.at.get(nodes[i].id)] : null;
    if (!g || !g.length) g = [nodes[i]];
    lo = Infinity; hi = -Infinity;
    for (j = 0; j < g.length; j++){
      seen.add(g[j].id); b = box(g[j]);
      lo = Math.min(lo, b.y); hi = Math.max(hi, b.y + b.h);
    }
    items.push(span(g, lo, hi));
  }
  /* a wire floating free of every part is one more thing with a height */
  for (i = 0; i < wires.length; i++){
    if (wires[i].a || wires[i].b) continue;
    if (!wires[i].fa || !wires[i].fb) continue;
    g = [wires[i].fa, wires[i].fb];
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
function pullEnds(){
  var i, w, e, axis;
  for (i = 0; i < wires.length; i++){
    w = wires[i];
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
/* Which runs did not come out level on the sheet that is being kept. A pass can
   only report the promises it refused, and the sheet it refused them on is not
   quite the sheet that ends up kept — it is refused halfway through a round,
   before the parts are pushed apart, the inputs dealt their order back and the
   rows squeezed up. What needs squaring off is not what some pass refused: it is
   whatever is left on a slant, which the sheet itself can be asked. Asking it
   here also means the answer depends on the kept sheet alone, so the corners come
   out the same on every press. A run between two junctions that is standing up on
   purpose is a branch, not a slant, and is left alone. */
function skewRuns(){
  var out = [], i, e;
  for (i = 0; i < wires.length; i++){
    e = ends(wires[i]);
    if (!e || !e.a || !e.b) continue;
    if (runAxis(e) !== "y") continue;
    if (Math.abs(e.pb.y - e.pa.y) <= LEAN) continue;
    out.push(wires[i]);
  }
  return out;
}
/* Square off the runs the rows refused: level out of the output, down a column at a
   junction, level into the input. Everything leaving one output shares the column,
   so a fan-out reads as one trunk with a branch off it rather than two slants. */
/* Is a turning lane at this x, running between these two heights, clear of every
   part on the sheet? A corner dot standing on a gate, or a run drawn straight
   through one, reads as a short rather than as a turn. Junctions are not asked
   about: a lane is made of them, and two of them near each other hides nothing. */
function laneFree(x, lo, hi){
  var i, n, b;
  for (i = 0; i < nodes.length; i++){
    n = nodes[i];
    if (isPt(n)) continue;
    b = box(n);
    if (x > b.x - PTR && x < b.x + b.w + PTR && hi > b.y - PTR && lo < b.y + b.h + PTR) return false;
  }
  return true;
}
function elbows(bad){
  var byOut = new Map(), i, e, made = 0, groups = [], taken = {};
  for (i = 0; i < bad.length; i++){
    e = ends(bad[i]);
    if (!e || !e.a || !e.b) continue;
    if (Math.abs(e.pb.y - e.pa.y) <= LEAN) continue;     /* it came out straight anyway */
    if (!byOut.has(e.a.id)) byOut.set(e.a.id, []);
    byOut.get(e.a.id).push(e);
  }
  /* Lanes are handed out by where the runs are on the sheet, never by the order
     the wires happen to sit in the list: that order is shuffled every time a
     corner is dissolved and redrawn, and lanes that moved with it would redraw
     a sheet that was already clean. Each group's own runs are ordered top-down
     for the same reason. */
  byOut.forEach(function(g){
    var near = Infinity, j;
    for (j = 0; j < g.length; j++) near = Math.min(near, g[j].pb.x);
    g.sort(function(p, q){
      return p.pb.y - q.pb.y || p.pb.x - q.pb.x ||
             (p.w.b < q.w.b ? -1 : p.w.b > q.w.b ? 1 : 0) || (p.w.p | 0) - (q.w.p | 0);
    });
    groups.push({g:g, near:Math.round(near), y:g[0].pa.y, x:g[0].pa.x, src:g[0].w.a});
  });
  /* The last word is the output's own id. Everything before it can tie — a sheet
     is full of parts at matching heights — and what settles a tie otherwise is
     the order the runs sit in the wire list, which pass 1 rebuilds every time it
     splices a corner out. A press would then build the same drawing by a
     different route, and a sheet that was already clean would come back with its
     corners renumbered. */
  groups.sort(function(p, q){
    return p.near - q.near || p.y - q.y || p.x - q.x ||
           (p.src < q.src ? -1 : p.src > q.src ? 1 : 0);
  });
  /* A lane is counted against the column it turns into, not against the sheet:
     two turns in front of two different columns are nowhere near each other and
     have no business pushing each other sideways. layoutX is told how many each
     column came to need, and reserves that gap on the next round. */
  var lanes = {};
  groups.forEach(function(it){
    var g = it.g;
    var src = g[0].w.a, pa = g[0].pa, near = it.near, lane, col, trunk, p2, i, lo, hi, try2;
    lane = lanes[near] = (lanes[near] || 0) + 1;
    /* The turn is made in the blank gap in front of the column being fed, a lane
       further back for each further output that has to turn. Two trunks on one
       lane would stand two junctions of different nets a few pixels apart, which
       reads as a short. The lane stops short of the nearest input, so the run
       never doubles back on itself. */
    col = Math.round((near - lane * LANE) / SNAP) * SNAP;
    col = Math.max(pa.x + SNAP, Math.min(col, near - SNAP));
    /* and if that lane is not clear air, it is stepped back towards the output
       until it is: through the gap in front of an earlier column if need be,
       which only means the run turns sooner. A lane another trunk has already
       taken is stepped over too. Nowhere clear to stand — a crowded sheet, or a
       target in the very next column — and the turn is made where it has to be. */
    lo = pa.y; hi = pa.y;
    for (i = 0; i < g.length; i++){ lo = Math.min(lo, g[i].pb.y); hi = Math.max(hi, g[i].pb.y); }
    try2 = col;
    for (i = 0; i < 24 && try2 - SNAP > pa.x; i++){
      if (!taken[try2] && laneFree(try2, lo, hi)){ col = try2; break; }
      try2 -= SNAP;
    }
    taken[col] = 1;
    trunk = addNode("POINT", col, pa.y);
    wires.push({id:"w" + (seq++), a:src, b:trunk.id, p:0, fa:null, fb:null});
    for (i = 0; i < g.length; i++){
      p2 = addNode("POINT", col, g[i].pb.y);
      wires.push({id:"w" + (seq++), a:trunk.id, b:p2.id, p:0, fa:null, fb:null});
      g[i].w.a = p2.id; g[i].w.fa = null;
      made++;
    }
  });
  return made;
}
/* Room for the corners a column is going to need, read off the wiring before any
   of it is laid out. A part with one input is fed by one run and that run can
   always be made level, so a column of those needs no turning room at all and is
   set down tight against the one before it. A part with two or more inputs can
   only be level with one of them, so the rest have to turn in the gap in front
   of its column, and that gap is given lanes to turn in.

   Reading this off the wiring rather than off the last round's refusals is what
   keeps it honest: the layout stays a plain function of the circuit, so the
   rounds still settle and a second press still changes nothing. */
function laneRoom(bands){
  var extra = {}, i, j, g, ins, k, w, most;
  for (i = 1; i < bands.length; i++){
    g = bands[i]; most = 0;
    for (j = 0; j < g.length; j++){
      ins = 0;
      for (k = 0; k < wires.length; k++){
        w = wires[k];
        if (w.b === g[j].id && w.a) ins++;
      }
      if (ins > most) most = ins;
    }
    if (most > 1) extra[i] = Math.min(most - 1, 3) * LANE;
  }
  return extra;
}
function bounds(){
  var i, w, n, b, r = null, add = function(x, y, x2, y2){
    if (!r) r = {x:x, y:y, x2:x2, y2:y2};
    else { r.x = Math.min(r.x, x); r.y = Math.min(r.y, y); r.x2 = Math.max(r.x2, x2); r.y2 = Math.max(r.y2, y2); }
  };
  for (i = 0; i < nodes.length; i++){ n = nodes[i]; b = box(n); add(b.x, b.y, b.x + b.w, b.y + b.h); }
  for (i = 0; i < wires.length; i++){
    w = wires[i];
    if (w.fa) add(w.fa.x, w.fa.y, w.fa.x, w.fa.y);
    if (w.fb) add(w.fb.x, w.fb.y, w.fb.x, w.fb.y);
  }
  return r;
}
/* How much sheet the drawing takes up, for the before-and-after. */
function area(r){ return r ? Math.max(1, (r.x2 - r.x) * (r.y2 - r.y)) : 1; }
/* Where every part and loose end has ended up, to a hundredth of a pixel. The
   settling loop below stops as soon as a pass stops changing this. */
/* Where every part and loose end has ended up, to a hundredth of a pixel, so one
   round of the passes can be told from another. */
function placeMark(){
  var i, w, s = [];
  for (i = 0; i < nodes.length; i++)
    s.push(Math.round(nodes[i].x * 100) + "," + Math.round(nodes[i].y * 100));
  for (i = 0; i < wires.length; i++){
    w = wires[i];
    if (w.fa) s.push("a" + Math.round(w.fa.x * 100) + "," + Math.round(w.fa.y * 100));
    if (w.fb) s.push("b" + Math.round(w.fb.x * 100) + "," + Math.round(w.fb.y * 100));
  }
  return s.join(" ");
}
/* How good a sheet this round made: corners it could not avoid first, then the
   paper it takes, then the wire it spends. Fewer, smaller, shorter. */
function layoutScore(bad){
  var i, e, len = 0;
  for (i = 0; i < wires.length; i++){
    e = ends(wires[i]);
    if (e) len += Math.abs(e.pb.x - e.pa.x) + Math.abs(e.pb.y - e.pa.y);
  }
  return [bad.length, Math.round(area(bounds())), Math.round(len)];
}
function scoreLess(p, q){
  for (var i = 0; i < p.length; i++) if (p[i] !== q[i]) return p[i] < q[i];
  return false;
}
/* A round's sheet, kept so it can be gone back to once the rounds are done. The
   loop neither adds nor drops a part or a wire, so position by position is the
   whole of it. */
function keepPlace(bad, cols){
  var i, w, pos = [], fre = [];
  for (i = 0; i < nodes.length; i++) pos.push(nodes[i].x, nodes[i].y);
  for (i = 0; i < wires.length; i++){
    w = wires[i];
    fre.push(w.fa ? w.fa.x : 0, w.fa ? w.fa.y : 0, w.fb ? w.fb.x : 0, w.fb ? w.fb.y : 0);
  }
  return {pos:pos, fre:fre, bad:bad, cols:cols, score:layoutScore(bad)};
}
function putPlace(p){
  var i, w, k;
  for (i = 0; i < nodes.length; i++){ nodes[i].x = p.pos[i * 2]; nodes[i].y = p.pos[i * 2 + 1]; }
  for (i = 0; i < wires.length; i++){
    w = wires[i]; k = i * 4;
    if (w.fa){ w.fa.x = p.fre[k]; w.fa.y = p.fre[k + 1]; }
    if (w.fb){ w.fb.x = p.fre[k + 2]; w.fb.y = p.fre[k + 3]; }
  }
}
function bestPlace(log, from){
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
function stepTrack(){
  var steps = [{doc:snapshot(), name:"The sheet as it stands"}];
  var step = function(name){ steps.push({doc:snapshot(), name:name}); };
  step.steps = steps;
  return step;
}
var STEP_MS = 340, HOLD_MS = 120, stepPlay = true, play = null;
function reduceMotion(){
  return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}
/* The list of passes, the one running now lit. Captions are this file's own
   words, so they are set as text rather than built into markup. */
function stepPanel(at){
  var el = $("#steps"), ol, li, i, b;
  if (!at){ el.classList.remove("show"); el.hidden = true; el.textContent = ""; return; }
  el.textContent = "";
  b = document.createElement("b");
  b.textContent = "Cleaner · step " + at + " of " + (play.s.length - 1);
  el.appendChild(b);
  ol = document.createElement("ol");
  for (i = 1; i < play.s.length; i++){
    li = document.createElement("li");
    li.className = i < at ? "done" : i === at ? "now" : "";
    var k = document.createElement("i");
    k.textContent = i < at ? "✓" : String(i);
    li.appendChild(k);
    li.appendChild(document.createTextNode(play.s[i].name));
    ol.appendChild(li);
  }
  el.appendChild(ol);
  el.hidden = false; el.classList.add("show");
}
/* A pass's sheet, put up without disturbing where the view is pointed: the pan
   is travelled separately, so the drawing is not yanked about as it tidies. */
function playShow(doc){
  var keep = {x:pan.x, y:pan.y};
  load(doc); pan = keep; evaluate();
}
function playStage(){
  var prev = play.s[play.i - 1].doc, cur = play.s[play.i], was = {}, wasW = {}, mv = [], i, n, o, w;
  for (i = 0; i < prev.nodes.length; i++) was[prev.nodes[i].id] = prev.nodes[i];
  for (i = 0; i < prev.wires.length; i++) wasW[prev.wires[i].id] = prev.wires[i];
  playShow(cur.doc);
  /* a part the pass moved travels; one the pass made starts where it ends, so a
     new corner simply appears at the turn it was made for */
  for (i = 0; i < nodes.length; i++){
    n = nodes[i]; o = was[n.id];
    mv.push({o:n, x0:o ? o.x : n.x, y0:o ? o.y : n.y, x1:n.x, y1:n.y});
  }
  for (i = 0; i < wires.length; i++){
    w = wires[i]; o = wasW[w.id];
    if (w.fa) mv.push({o:w.fa, x0:o && o.fa ? o.fa.x : w.fa.x, y0:o && o.fa ? o.fa.y : w.fa.y, x1:w.fa.x, y1:w.fa.y});
    if (w.fb) mv.push({o:w.fb, x0:o && o.fb ? o.fb.x : w.fb.x, y0:o && o.fb ? o.fb.y : w.fb.y, x1:w.fb.x, y1:w.fb.y});
  }
  play.mv = mv;
  play.pan = {x0:prev.pan ? prev.pan.x : pan.x, y0:prev.pan ? prev.pan.y : pan.y,
              x1:cur.doc.pan ? cur.doc.pan.x : pan.x, y1:cur.doc.pan ? cur.doc.pan.y : pan.y};
  play.t0 = 0;
  stepPanel(play.i);
  play.raf = requestAnimationFrame(playFrame);
}
function playFrame(ts){
  if (!play) return;
  if (!play.t0) play.t0 = ts;
  var d = ts - play.t0, k = Math.min(1, d / STEP_MS), e, i, o;
  e = k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) * (1 - k);     /* ease in, ease out */
  for (i = 0; i < play.mv.length; i++){
    o = play.mv[i];
    o.o.x = o.x0 + (o.x1 - o.x0) * e;
    o.o.y = o.y0 + (o.y1 - o.y0) * e;
  }
  pan.x = play.pan.x0 + (play.pan.x1 - play.pan.x0) * e;
  pan.y = play.pan.y0 + (play.pan.y1 - play.pan.y0) * e;
  render();
  if (d < STEP_MS + HOLD_MS){ play.raf = requestAnimationFrame(playFrame); return; }
  play.i++;
  if (play.i >= play.s.length){ playEnd(); return; }
  playStage();
}
/* Straight to the finished sheet: when the passes have all been shown, and when
   anything at all is asked of the bench while they are still being shown. */
function playEnd(){
  if (!play) return;
  var last = play.s[play.s.length - 1].doc;
  if (play.raf) cancelAnimationFrame(play.raf);
  play = null;
  stepPanel(0);
  load(last);
  evaluate(); draw();
}
function playSteps(steps){
  if (play) playEnd();
  if (!stepPlay || reduceMotion() || steps.length < 2){ stepPanel(0); return; }
  play = {s:steps, i:1, raf:0};
  playStage();
}
/* The cleaner moves parts and adds corners, so it keeps the sheet it started
   from for Ctrl+Z. */
function cleanUp(){
  if (testMode) return;
  if (!nodes.length){ flash("Nothing on the sheet to clean up yet."); return; }
  pushUndo();
  var was = area(bounds());
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
    if (!room) room = laneRoom(bands);        /* the same every round: the wiring has not changed */
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
  /* What has to be squared off is read straight off the kept sheet: whatever is
     still on a slant, rather than whatever some round's pass refused halfway
     through laying it out. */
  var corners = elbows(skewRuns());
  var r = bounds();
  if (r){ pan.x = 48 - r.x * zoom; pan.y = 40 - r.y * zoom; }
  clearPick(); pend = null; wiring = null; wend = null; marq = null;
  step("Corners squared — the runs that could not be made level");
  commit();
  playSteps(step.steps);
  var saved = Math.round((1 - area(r) / was) * 100);
  flash("Cleaner looks · " + best.cols + " column" + (best.cols > 1 ? "s" : "") +
    (corners ? " · " + corners + " corner" + (corners > 1 ? "s" : "") + " squared" : "") +
    (saved > 2 ? " · " + saved + "% less space" : "") +
    " · Ctrl+Z puts it back");
}
/* Light the rail tool that matches the mode we are actually in. */
function markTool(){
  var w = document.querySelector('.part[data-t="WIRE"]'),
      s = document.querySelector('.part[data-t="SELECT"]'),
      r = document.querySelector('.part[data-t="REGION"]'),
      v = document.querySelector('.part[data-t="PASTE"]');
  if (w) w.classList.toggle("on", wireMode);
  if (r) r.classList.toggle("on", regionMode);
  if (v){ v.classList.toggle("on", pasteMode); v.classList.toggle("off", !clip); }
  if (s) s.classList.toggle("on", !wireMode && !regionMode && !pasteMode);
}
function cursorFor(){
  if (testMode) return "pointer";
  if (pasteMode) return "copy";
  if (wireMode) return "cell";
  if (regionMode) return "crosshair";
  return "grab";              /* dragging the bare sheet moves it */
}
function setWireMode(on){
  wireMode = !!on; pend = null;
  if (wireMode){ regionMode = false; pasteMode = false; }
  markTool();
  cv.style.cursor = cursorFor();
  draw();
}
/* The band tool: drag anywhere on the sheet to box in a region, finger or mouse. */
function setRegionMode(on){
  regionMode = !!on;
  if (regionMode){ wireMode = false; pasteMode = false; pend = null; }
  markTool();
  cv.style.cursor = cursorFor();
  draw();
}
/* Back to the plain cursor: no wire mode, no band, nothing half-drawn in hand. */
function setSelectMode(){
  wiring = null; wend = null; marq = null; regionMode = false; pasteMode = false;
  setWireMode(false);
}
/* Test mode: the circuit is frozen as built and can only be driven. Switches and
   buttons still work; nothing can be moved, wired, renamed or deleted. */
function setTest(on){
  testMode = !!on;
  if (testMode){
    wiring = null; wend = null; drag = null; marq = null; regionMode = false; pasteMode = false;
    clearPick(); ren.hidden = true;
    setWireMode(false);
  }
  var b = $("#btnTest");
  b.textContent = testMode ? "Test · on" : "Test";
  b.classList.toggle("armed", testMode);
  $("#rail").classList.toggle("lock", testMode);
  pickDel();
  $("#btnClean").disabled = testMode;
  $("#tip").textContent = $("#tip").title = testMode ? TIP_TEST : TIP_EDIT;
  cv.style.cursor = cursorFor();
  draw();
}
