/* Time on the bench: clocks tick, capacitors charge and drain, inductors catch up. */
import { S, flash } from "./state.js";
import { TYPES } from "./core.js";
import { draw } from "./render.js";
import { evaluate, hi } from "./sim.js";

/* ---------- time ---------- */
/* Everything else on the sheet settles at once; these parts change with time, so
   a timer steps them every TICK and settles the sheet again when one has moved. */
export var TICK = 50;                       /* ms between steps */
export var RATES = [1, 2, 5, 10, 0.5, 0];   /* a clock's speeds in Hz, in the order a click steps through; 0 stops it */
export var CHARGE = 0.22;                   /* how far a capacitor gets towards a strong drive each step */
export var LEAK = 0.997;                    /* what a floating capacitor keeps of its charge each step */
export var CATCH = 0.14;                    /* how far an inductor's current gets towards its input each step */
export function rate(n){ return typeof n.c === "number" ? n.c : 1; }
export function rateText(r){ return r === 0 ? "stop" : r === 0.5 ? "½ Hz" : r + " Hz"; }
export function tick(){
  if (S.play || document.hidden || S.homeOpen || S.arenaOpen || S.login) return;
  tickNow();
}
export function tickNow(){
  var i, n, d, was, to, r, half, moved = false;
  for (i = 0; i < S.nodes.length; i++){
    n = S.nodes[i];
    if (!TYPES[n.t].tm) continue;
    if (n.t === "CLOCK"){
      r = rate(n);
      if (!r){ n.ta = 0; continue; }
      half = 500 / r; n.ta = (n.ta || 0) + TICK;
      while (n.ta >= half){ n.ta -= half; n.s = n.s ? 0 : 1; moved = true; }
      continue;
    }
    d = n.idr ? n.idr[0] | 0 : 0; was = +n.m || 0;
    if (n.t === "CAP"){
      /* driven, it charges or drains — slower through a resistor, which is the
         RC delay; left floating, it holds what it has and slowly leaks it */
      if (d === 0){ to = 0; n.m = was * LEAK; }
      else { to = hi(d); n.m = was + (to - was) * (d > 2 ? CHARGE : CHARGE / 3); }
    } else {
      to = hi(d); n.m = was + (to - was) * CATCH;
    }
    if (Math.abs(n.m - to) < 0.002) n.m = to;
    if (Math.abs(n.m - was) > 1e-4) moved = true;
  }
  if (moved){ evaluate(); draw(); }
}
/* started once, when the bench boots */
export function startClock(){ return setInterval(tick, TICK); }

/* A click on a part that is worked by hand: a switch flips, a hex input counts on,
   a clock steps to its next speed. False for any other part. */
export function tapPart(n){
  if (n.t === "SWITCH") n.s = n.s ? 0 : 1;
  else if (n.t === "HEXIN") n.s = ((n.s | 0) + 1) & 15;
  else if (n.t === "QUBIT") n.s = n.s ? 0 : 1;
  else if (n.t === "CLOCK"){
    n.c = RATES[(RATES.indexOf(rate(n)) + 1) % RATES.length]; n.ta = 0;
    flash("Clock · " + (n.c ? rateText(n.c) : "stopped — click it again to start it"));
  }
  else return false;
  evaluate();
  return true;
}
