/* The arena's checker: runs a build against a challenge and measures it.
   It judges three things — does it work (every input pattern), how fast (the longest
   run of gate delays from an input to an output) and how small (transistors, and wires).
   The build is run where it stands, apart from the sheet on screen. */
import { S } from "./state.js";
import { graphOf } from "./builds.js";
import { TYPES, byId } from "./core.js";
import { reindex, solve } from "./sim.js";

/* ---------- what a part costs ---------- */
/* Transistors a part is made of, and gate delays it takes to pass a signal. A chip
   is priced as the gates inside it would be built, so a chip is no free lunch. */
export var COST = {
  NOT:[2,1], NAND:[4,1], NOR:[4,1], AND:[6,2], OR:[6,2], XOR:[8,3], XNOR:[8,3], BUF:[4,2], TRI:[6,2],
  RES:[1,1], DIODE:[1,1], NMOS:[1,1], PMOS:[1,1], NPN:[1,1], PNP:[1,1],
  HADD:[14,3], FADD:[28,6], ADD4:[112,12], CMP4:[56,6], ALU:[220,14],
  MUX2:[12,3], MUX4:[36,5], DEMUX4:[24,3], DEC24:[20,3], DEC38:[56,4], ENC42:[22,4]
};
/* wires, junctions, supplies and the challenge's own switches and lamps are free */
export var FREE = {POINT:1, SWITCH:1, LAMP:1, VCC:1, GND:1};
/* what a challenge may be built from: "gates" is the gates and the electronic parts, "chips"
   adds the arithmetic and routing families. Memory, clocks, capacitors and inductors depend on
   time, so a combinational challenge has no use for them; ROM would just hold the answer. */
export var GATES_OK = {AND:1, OR:1, NOT:1, NAND:1, NOR:1, XOR:1, XNOR:1, BUF:1, TRI:1,
  RES:1, DIODE:1, NMOS:1, PMOS:1, NPN:1, PNP:1};
export var CHIPS_OK = {HADD:1, FADD:1, ADD4:1, CMP4:1, ALU:1, MUX2:1, MUX4:1, DEMUX4:1, DEC24:1, DEC38:1, ENC42:1};
/* the score: lower is better */
export var W_SIZE = 1; export var W_SPEED = 4; export var W_WIRE = 0.5;

export function partCost(t){ return COST[t] ? COST[t][0] : 0; }
export function partDelay(t){ return COST[t] ? COST[t][1] : 0; }

/* Run fn with this graph standing in for the sheet, then put the sheet back. */
export function isolated(g, fn){
  var sn = S.nodes, sw = S.wires;
  S.nodes = g.nodes; S.wires = g.wires; reindex();
  try { return fn(); }
  finally { S.nodes = sn; S.wires = sw; reindex(); }
}

/* the input and output ports of a graph, matched to the challenge's names */
export function matchPorts(g, ch){
  var sws = g.nodes.filter(function(n){ return n.t === "SWITCH"; }),
      lps = g.nodes.filter(function(n){ return n.t === "LAMP"; });
  var byLabel = function(list, names){
    var map = {}, count = {}, out = [], ok = true;
    list.forEach(function(n){
      var k = (n.l || "").trim().toLowerCase();
      if (!k) return;
      count[k] = (count[k] || 0) + 1;
      map[k] = n;
    });
    names.forEach(function(nm){
      var k = nm.toLowerCase();
      /* two parts with one name would be a guess */
      if (count[k] === 1) out.push(map[k]); else ok = false;
    });
    return ok ? out : null;
  };
  var byPlace = function(list){
    return list.slice().sort(function(a, b){ return a.y - b.y || a.x - b.x; });
  };
  var ins = byLabel(sws, ch.ins), outs = byLabel(lps, ch.outs), how = "by label";
  if ((!ins || !outs) && sws.length === ch.ins.length && lps.length === ch.outs.length){
    ins = byPlace(sws); outs = byPlace(lps); how = "by position, top to bottom";
  }
  return {ins:ins, outs:outs, how:how, nSw:sws.length, nLp:lps.length};
}

/* a loop means feedback — a latch, or an oscillator — and a combinational challenge has none */
export function hasLoop(g){
  var next = {}, state = {}, found = false;
  g.nodes.forEach(function(n){ next[n.id] = []; });
  g.wires.forEach(function(w){ if (w.a && w.b && next[w.a]) next[w.a].push(w.b); });
  var walk = function(id){
    var i;
    if (found) return;
    state[id] = 1;
    for (i = 0; i < next[id].length; i++){
      if (state[next[id][i]] === 1){ found = true; return; }
      if (!state[next[id][i]]) walk(next[id][i]);
    }
    state[id] = 2;
  };
  g.nodes.forEach(function(n){ if (!state[n.id]) walk(n.id); });
  return found;
}

/* the longest run of gate delays from anywhere to one of these outputs */
export function longestPath(g, outs){
  var into = {}, memo = {};
  g.nodes.forEach(function(n){ into[n.id] = []; });
  g.wires.forEach(function(w){ if (w.a && w.b && into[w.b]) into[w.b].push(w.a); });
  var at = function(id){
    if (memo[id] !== undefined) return memo[id];
    var n = byId.get(id), best = 0;
    into[id].forEach(function(s){ best = Math.max(best, at(s)); });
    return (memo[id] = best + partDelay(n.t));
  };
  return outs.reduce(function(m, n){ return Math.max(m, at(n.id)); }, 0);
}

export function tally(list){
  var c = {};
  list.forEach(function(t){ c[t] = (c[t] || 0) + 1; });
  return Object.keys(c).map(function(t){ return (c[t] > 1 ? c[t] + "× " : "") + TYPES[t].n; }).join(", ");
}

/* judge(data, challenge) → a report. ok is true only for a build that follows the
   rules and gets every input pattern right; only then are the measurements a score. */
export function judge(data, ch){
  var rep = {ok:false, errors:[], notes:[], pass:0, total:1 << ch.ins.length, miss:[]};
  var g, ports, bad, loose;
  if (!data || !Array.isArray(data.nodes) || !data.nodes.length){ rep.errors.push("The build is empty."); return rep; }
  g = graphOf(data);
  if (!g.nodes.length){ rep.errors.push("The build is empty."); return rep; }

  /* the rules: which parts are allowed */
  bad = g.nodes.filter(function(n){
    var t = n.t;
    if (FREE[t] || GATES_OK[t]) return false;
    return !(ch.use === "chips" && CHIPS_OK[t] && (ch.ban || []).indexOf(t) < 0);
  }).map(function(n){ return n.t; });
  if (bad.length){
    rep.errors.push("This challenge doesn't allow " + tally(bad) + (ch.use === "chips"
      ? " here. Gates, electronic parts and the arithmetic and routing chips (bar " +
        (ch.ban || []).map(function(t){ return TYPES[t].n; }).join(", ") + ") are fine."
      : ". Build it from gates and electronic parts only."));
    return rep;
  }

  /* the ports */
  ports = matchPorts(g, ch);
  if (!ports.ins || !ports.outs){
    rep.errors.push("Label " + ch.ins.length + " switches " + ch.ins.join(", ") + " and " + ch.outs.length +
      " lamps " + ch.outs.join(", ") + " (double-click a part to rename it). This build has " +
      ports.nSw + " switch" + (ports.nSw === 1 ? "" : "es") + " and " + ports.nLp + " lamp" + (ports.nLp === 1 ? "" : "s") + ".");
    return rep;
  }
  rep.notes.push("Switches and lamps matched " + ports.how + ".");
  if (ports.nSw !== ch.ins.length || ports.nLp !== ch.outs.length){
    rep.errors.push("Keep only the challenge's own " + ch.ins.length + " switches and " + ch.outs.length +
      " lamps — an extra switch would be a free constant. Use Power or Ground for a fixed 1 or 0.");
    return rep;
  }

  if (hasLoop(g)){ rep.errors.push("A wire loops back on itself. This challenge is combinational — no feedback."); return rep; }

  /* every input pin wired */
  loose = isolated(g, function(){ return solve(); });
  if (loose){
    rep.errors.push(loose + " input pin" + (loose > 1 ? "s are" : " is") + " left open. Wire every input — an open pin would be a free 0.");
    return rep;
  }

  /* all the input patterns */
  isolated(g, function(){
    var m, i, bitsIn, want, got, ok;
    for (m = 0; m < rep.total; m++){
      bitsIn = [];
      for (i = 0; i < ch.ins.length; i++){ bitsIn.push((m >> i) & 1); ports.ins[i].s = bitsIn[i]; }
      solve();
      want = ch.f(bitsIn);
      got = ports.outs.map(function(n){ return n.iv[0] | 0; });
      ok = want.every(function(v, k){ return v === got[k]; });
      if (ok) rep.pass++;
      else if (rep.miss.length < 3) rep.miss.push({ins:bitsIn, want:want, got:got});
    }
    rep.depth = longestPath(g, ports.outs);
  });

  rep.parts = g.nodes.filter(function(n){ return !FREE[n.t]; }).length;
  rep.size = g.nodes.reduce(function(s, n){ return s + partCost(n.t); }, 0);
  rep.wires = g.wires.filter(function(w){ return w.a && w.b; }).length;
  rep.cost = rep.size * W_SIZE + rep.depth * W_SPEED + rep.wires * W_WIRE;
  if (rep.pass !== rep.total){
    rep.errors.push(rep.pass + " of " + rep.total + " input patterns come out right.");
    return rep;
  }
  rep.ok = true;
  return rep;
}
