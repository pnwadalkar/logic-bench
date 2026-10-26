/* A small console API, for wiring from devtools. */
"use strict";

/* ---------- console API ---------- */
/* Wiring from devtools: bench.wire("A","Sum"), bench.add("NAND",300,120), bench.ports() */
function findNode(ref){
  if (!ref) return null;
  if (byId.get(ref)) return byId.get(ref);
  var i, s = String(ref).toLowerCase();
  for (i = 0; i < nodes.length; i++) if ((nodes[i].l || "").toLowerCase() === s) return nodes[i];
  for (i = 0; i < nodes.length; i++) if (nodes[i].t.toLowerCase() === s) return nodes[i];
  return null;
}
window.bench = {
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
    CATS.forEach(function(g){ o[g.n] = g.t.map(function(t){ return t + " (" + TYPES[t].n + ")"; }); });
    return o;
  },
  /* bench.tick(n) — step time on n times at once: clocks, capacitors, inductors */
  tick:function(k){
    for (var i = 0; i < (k === undefined ? 1 : k | 0); i++) tickNow();
    return nodes.filter(function(n){ return TYPES[n.t].tm; }).map(function(n){
      return {id:n.id, type:n.t, out:n.v, charge:n.t === "CLOCK" ? undefined : n.m};
    });
  },
  /* bench.add("AND", x, y) → the new part */
  add:function(t, x, y){
    t = String(t || "").toUpperCase();
    if (!TYPES[t]) return "unknown part: " + t + " (" + Object.keys(TYPES).join(", ") + ")";
    var n = addNode(t, x === undefined ? (120 - pan.x) / zoom : x, y === undefined ? (120 - pan.y) / zoom : y);
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
    var before = wires.length, a, b;
    if (to === undefined){
      wires = wires.filter(function(w){ return w.id !== from; });
    } else {
      a = findNode(from); b = findNode(to);
      if (!a || !b) return "no such part";
      wires = wires.filter(function(w){ return !(w.a === a.id && w.b === b.id); });
    }
    commit();
    return (before - wires.length) + " wire(s) cut";
  },
  /* bench.ports() — what is on the sheet, with live values */
  ports:function(){
    return nodes.map(function(n){
      return {id:n.id, type:n.t, label:n.l, out:n.v, outs:(n.ov || []).slice(), ins:nIn(n), x:n.x, y:n.y};
    });
  },
  list:function(){
    return wires.map(function(w){
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
  copy:function(){ copyPick(false); return clip ? clip.nodes.length + " parts on the clipboard" : "nothing copied"; },
  paste:function(x, y){
    if (x !== undefined){ hover = {x:x, y:y}; pasteClip(); hover = null; }
    else pasteClip();
    return pickN.size + " parts pasted";
  },
  /* bench.clean() — cleaner looks; bench.undo() puts it back */
  clean:function(){ cleanUp(); return nodes.length + " parts · " + wires.length + " wires"; },
  /* bench.steps(false) — clean in one jump instead of walking the passes */
  steps:function(on){
    stepPlay = on === undefined ? !stepPlay : !!on;
    if (!stepPlay) playEnd();
    return stepPlay ? "the cleaner shows its passes" : "the cleaner lands in one go";
  },
  undo:function(){ undo(); return nodes.length + " parts · " + wires.length + " wires"; },
  /* bench.save("name") / bench.open("name") / bench.builds() */
  save:function(name){ if (name) docName = String(name); saveBuild(); return docName; },
  open:function(name){
    var d = libRead()[name];
    if (!d) return "no build called " + name;
    load(d); docName = name; docDirty = false; nameChip(); evaluate(); draw(); saveCur();
    return "opened " + name;
  },
  builds:function(){ return Object.keys(libRead()); },
  json:function(){ return snapshot(); },
  load:function(d){ if (load(typeof d === "string" ? JSON.parse(d) : d)){ docDirty = true; commit(); return "loaded"; } return "nothing to load"; },
  /* bench.example() — the half adder; bench.example("counter") — the clocked counter */
  example:function(which){ if (which === "counter") example2(); else example(); return docName; },
  name:function(s){ renameBuild(String(s || "")); return docName; },
  mode:function(on){ setWireMode(on === undefined ? !wireMode : on); return wireMode ? "wire mode on" : "wire mode off"; },
  /* bench.test() / bench.test(true) / bench.test(false) — lock the sheet and drive it */
  test:function(on){
    setTest(on === undefined ? !testMode : on);
    return testMode ? "test mode on — sheet locked, switches live" : "edit mode";
  }
};
