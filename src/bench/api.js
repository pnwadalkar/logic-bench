/* A small console API, for wiring from devtools. */
import { S, notify } from "./state.js";
import { example, example2, libRead, load, renameBuild, saveBuild, saveCur, snapshot } from "./builds.js";
import { cleanUp, playEnd, setTest, setWireMode } from "./cleaner.js";
import { TYPES, byId, hasOut, lvl, nIn, nOut, pickN, pickW } from "./core.js";
import { addNode, commit, connect, copyPick, pasteClip, selectAll, undo } from "./edit.js";
import { newSheet } from "./home.js";
import { exampleQ } from "./quantum.js";
import { applyMarq, draw } from "./render.js";
import { evaluate, picked, words } from "./sim.js";
import { tickNow } from "./timing.js";

/* ---------- console API ---------- */
/* Wiring from devtools: bench.wire("A","Sum"), bench.add("NAND",300,120), bench.ports() */
export function findNode(ref){
  if (!ref) return null;
  if (byId.get(ref)) return byId.get(ref);
  var i, s = String(ref).toLowerCase();
  for (i = 0; i < S.nodes.length; i++) if ((S.nodes[i].l || "").toLowerCase() === s) return S.nodes[i];
  for (i = 0; i < S.nodes.length; i++) if (S.nodes[i].t.toLowerCase() === s) return S.nodes[i];
  return null;
}
export function installApi(){
  window.bench = API;
}
var API = {
  /* bench.wire(from, to, inputIndex, outputIndex) — refs are a label ("A"), an id
     ("n3") or a type ("XOR"); the output index picks one of a chip's outputs */
  wire:function(from, to, port, out){
    var a = findNode(from), b = findNode(to);
    if (!a || !b) return "no such part: " + (a ? to : from);
    if (!hasOut(a)) return a.t + " has no output";
    if (!nIn(b)) return b.t + " has no inputs";
    var p = port === undefined ? 0 : port | 0, q = out === undefined ? 0 : out | 0;
    if (p < 0 || p >= nIn(b)) return "input index out of range (0.." + (nIn(b) - 1) + ")";
    if (q < 0 || q >= nOut(a)) return "output index out of range (0.." + (nOut(a) - 1) + ")";
    connect({kind:"out", id:a.id, p:q}, {kind:"in", id:b.id, p:p});
    commit();
    return (a.l || a.t) + (nOut(a) > 1 ? "[" + q + "]" : "") + " → " + (b.l || b.t) + "[" + p + "]";
  },
  /* bench.parts() — every kind of part, by family */
  parts:function(){
    var o = {};
    S.CATS.forEach(function(g){ o[g.n] = g.t.map(function(t){ return t + " (" + TYPES[t].n + ")"; }); });
    return o;
  },
  /* bench.tick(n) — step time on n times at once: clocks, capacitors, inductors */
  tick:function(k){
    for (var i = 0; i < (k === undefined ? 1 : k | 0); i++) tickNow();
    return S.nodes.filter(function(n){ return TYPES[n.t].tm; }).map(function(n){
      return {id:n.id, type:n.t, out:n.v, charge:n.t === "CLOCK" ? undefined : n.m};
    });
  },
  /* bench.add("AND", x, y) → the new part */
  add:function(t, x, y){
    t = String(t || "").toUpperCase();
    if (!TYPES[t]) return "unknown part: " + t + " (" + Object.keys(TYPES).join(", ") + ")";
    var n = addNode(t, x === undefined ? (120 - S.pan.x) / S.zoom : x, y === undefined ? (120 - S.pan.y) / S.zoom : y);
    commit();
    return {id:n.id, type:n.t, label:n.l, x:n.x, y:n.y};
  },
  /* bench.set("A", 1) — flip a switch or button, or set a hex input to 0–15 */
  set:function(ref, v){
    var n = findNode(ref);
    if (n && n.t === "HEXIN"){ n.s = (v | 0) & 15; commit(); return (n.l || n.id) + " = " + n.s; }
    if (!n || (n.t !== "SWITCH" && n.t !== "BUTTON")) return "not a switch, button or hex input";
    n.s = v ? 1 : 0; commit();
    return (n.l || n.id) + " = " + n.s;
  },
  /* bench.mem("n4") — what a RAM or ROM holds; bench.mem("n4", "0123456789ABCDEF") to load it */
  mem:function(ref, hex){
    var n = findNode(ref);
    if (!n || (n.t !== "RAM" && n.t !== "ROM")) return "not a RAM or ROM";
    if (hex !== undefined){
      hex = String(hex).replace(/\s+/g, "");
      if (!/^[0-9a-f]{16}$/i.test(hex)) return "sixteen hex digits, please";
      n.m = hex.split("").map(function(ch){ return parseInt(ch, 16); }); commit();
    }
    return words(n).map(function(v){ return v.toString(16).toUpperCase(); }).join("");
  },
  /* bench.cut("A", "Sum") or bench.cut("w7") — drop a wire */
  cut:function(from, to){
    var before = S.wires.length, a, b;
    if (to === undefined){
      S.wires = S.wires.filter(function(w){ return w.id !== from; });
    } else {
      a = findNode(from); b = findNode(to);
      if (!a || !b) return "no such part";
      S.wires = S.wires.filter(function(w){ return !(w.a === a.id && w.b === b.id); });
    }
    commit();
    return (before - S.wires.length) + " wire(s) cut";
  },
  /* bench.ports() — what is on the sheet, with live values */
  ports:function(){
    return S.nodes.map(function(n){
      return {id:n.id, type:n.t, label:n.l, out:n.v, outs:(n.ov || []).slice(), ins:nIn(n), x:n.x, y:n.y};
    });
  },
  list:function(){
    return S.wires.map(function(w){
      var a = w.a ? byId.get(w.a) : null, b = w.b ? byId.get(w.b) : null;
      return {id:w.id, from:(a && (a.l || a.t)) || "loose end",
        to:(b && (b.l || b.t)) || "loose end", output:w.q | 0, input:w.p, level:a ? lvl(a, w.q) : 0};
    });
  },
  /* bench.pick(x, y, w, h) — box in a region, the way dragging a band does */
  pick:function(x, y, w, h){
    applyMarq({x0:x, y0:y, x:x + (w || 0), y:y + (h || 0), add:false});
    evaluate(); draw();
    return {parts:pickN.size, wires:pickW.size};
  },
  all:function(){ selectAll(); return picked() + " picked"; },
  /* bench.copy() then bench.paste(x, y) — the copy lands centred on x,y */
  copy:function(){ copyPick(false); return S.clip ? S.clip.nodes.length + " parts on the clipboard" : "nothing copied"; },
  paste:function(x, y){
    if (x !== undefined){ S.hover = {x:x, y:y}; pasteClip(); S.hover = null; }
    else pasteClip();
    return pickN.size + " parts pasted";
  },
  /* bench.clean() — cleaner looks; bench.undo() puts it back */
  clean:function(){ cleanUp(); return S.nodes.length + " parts · " + S.wires.length + " wires"; },
  /* bench.steps(false) — clean in one jump instead of walking the passes */
  steps:function(on){
    S.stepPlay = on === undefined ? !S.stepPlay : !!on;
    if (!S.stepPlay) playEnd();
    return S.stepPlay ? "the cleaner shows its passes" : "the cleaner lands in one go";
  },
  undo:function(){ undo(); return S.nodes.length + " parts · " + S.wires.length + " wires"; },
  /* bench.save("name") / bench.open("name") / bench.builds() */
  save:function(name){ if (name) S.docName = String(name); saveBuild(); return S.docName; },
  open:function(name){
    var d = libRead()[name];
    if (!d) return "no build called " + name;
    load(d); S.docName = name; S.docDirty = false; notify(); evaluate(); draw(); saveCur();
    return "opened " + name;
  },
  builds:function(){ return Object.keys(libRead()); },
  json:function(){ return snapshot(); },
  load:function(d){ if (load(typeof d === "string" ? JSON.parse(d) : d)){ S.docDirty = true; commit(); return "loaded"; } return "nothing to load"; },
  /* bench.example() — the half adder; bench.example("counter") — the clocked counter; bench.example("bell") — two entangled qubits */
  example:function(which){ if (which === "counter") example2(); else if (which === "bell") exampleQ(); else example(); return S.docName; },
  /* bench.kind() — "classical" or "quantum"; bench.fresh("quantum") — a new sheet of that kind */
  kind:function(){ return S.docKind; },
  fresh:function(kind){ newSheet(kind); return S.docKind; },
  /* bench.outcomes() — on a quantum sheet, what the meters read together and how likely */
  outcomes:function(){ evaluate(); return S.docKind === "quantum" ? JSON.parse(JSON.stringify(S.QRES)) : "not a quantum build"; },
  name:function(s){ renameBuild(String(s || "")); return S.docName; },
  mode:function(on){ setWireMode(on === undefined ? !S.wireMode : on); return S.wireMode ? "wire mode on" : "wire mode off"; },
  /* bench.test() / bench.test(true) / bench.test(false) — lock the sheet and drive it */
  test:function(on){
    setTest(on === undefined ? !S.testMode : on);
    return S.testMode ? "test mode on — sheet locked, switches live" : "edit mode";
  }
};
