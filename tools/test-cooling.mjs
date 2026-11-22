/* Headless checks for the fans, the temperature model and the dustbin's delete.
   Usage: node tools/test-cooling.mjs
   Loads the bench's own modules with a stub DOM (tools/bench-harness.mjs), builds
   small circuits, steps the 50 ms timer by hand and reads what the fans and the
   monitor would show. */
import { loadBench } from "./bench-harness.mjs";

const run = await loadBench();

run(`
var C = {};
C.reset = function(){ setKind("classical"); setTest(false); S.nodes = []; S.wires = []; S.seq = 1; S.undoStack = []; byId.clear(); clearPick(); };
C.add = function(t, x, y){ return addNode(t, x || 0, y || 0); };
C.wire = function(a, q, b, p){ return connect({kind:"out", id:a.id, p:q}, {kind:"in", id:b.id, p:p}); };
C.steps = function(k){ for (var i = 0; i < k; i++) tickNow(); };
/* count the changes of a part's first output over k steps */
C.toggles = function(n, k){ var last = n.ov ? n.ov[0] : 0, c = 0; for (var i = 0; i < k; i++){ tickNow(); if (n.ov[0] !== last){ c++; last = n.ov[0]; } } return c; };
`);

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) pass++; else { fail++; console.log("FAIL " + name + (detail !== undefined ? "\n  got " + detail : "")); }
}
const R = (code) => run(code);
const approx = (a, b, tol) => Math.abs(a - b) <= tol;

/* ---- the parts are what they say ---- */
check("six fans on the Cooling tab", R(`S.CATS.find(function(c){ return c.n === "Cooling"; }).t.length`) === 6);
check("a 3-pin fan has +12V in and TACH out", R(`var d = TYPES.FAN120; d.ins === 1 && d.outs === 1 && d.pn[0] === "+12V" && d.po[0] === "TACH"`));
check("a 4-pin fan adds PWM, which reads high when left open", R(`var d = TYPES.FAN120P; d.ins === 2 && d.pn[1] === "PWM" && d.pd[1] === 1 && d.pd[0] === undefined`));
check("bigger fans are bigger parts", R(`TYPES.FAN80.h < TYPES.FAN120.h && TYPES.FAN120.h < TYPES.FAN140.h && TYPES.FAN80.w < TYPES.FAN140.w`));
check("pins stay inside a tall part", R(`var n = {t:"FAN140", x:0, y:0}; inPort(n, 0).y > TITLE && outPort(n, 0).y < TYPES.FAN140.h`));

/* ---- a powered fan spins up, ticks its TACH, and coasts down ---- */
R(`C.reset(); C.v = C.add("VCC", -100, 0); C.f = C.add("FAN120", 0, 0); C.wire(C.v, 0, C.f, 0); evaluate();`);
check("a fan starts stopped", R(`fanRpm(C.f)`) === 0);
R(`C.steps(200)`);
check("12 V spins a 120 mm fan up to 1500 RPM", R(`fanRpm(C.f)`) === 1500, R(`fanRpm(C.f)`));
const t = R(`C.toggles(C.f, 200)`);   /* 10 s: 1500 rpm = 25 rev/s real, /40 = 0.625 rev/s shown = 1.25 tach Hz = 25 level changes */
check("TACH ticks two pulses a turn, in slow motion", t >= 24 && t <= 26, t);
R(`C.wire.call(null, C.v, 0, C.f, 0); S.wires = []; evaluate();`);
R(`C.steps(10)`);
const coast = R(`fanRpm(C.f)`);
check("with the power gone it coasts, not stops", coast > 0 && coast < 1500, coast);
R(`C.steps(400)`);
check("and then stops, TACH low", R(`fanRpm(C.f) === 0 && C.f.ov[0] === 0`));

/* ---- no power, no spin; an unwired +12V reads 0 ---- */
R(`C.reset(); C.f = C.add("FAN80", 0, 0); evaluate(); C.steps(100)`);
check("an unpowered fan stays still", R(`fanRpm(C.f)`) === 0);

/* ---- PWM: open is full, low idles, a clock gives something between ---- */
R(`C.reset(); C.v = C.add("VCC", -100, 0); C.f = C.add("FAN140P", 0, 0); C.wire(C.v, 0, C.f, 0); evaluate(); C.steps(300)`);
check("PWM left open runs flat out (1200 RPM)", R(`fanRpm(C.f)`) === 1200, R(`fanRpm(C.f)`));
R(`C.g = C.add("GND", -100, 80); C.wire(C.g, 0, C.f, 1); evaluate(); C.steps(400)`);
check("PWM held low idles at 20% (240 RPM)", R(`fanRpm(C.f)`) === 240, R(`fanRpm(C.f)`));
R(`S.wires = S.wires.filter(function(w){ return w.p !== 1; }); C.k = C.add("CLOCK", -100, 160); C.k.c = 10; C.wire(C.k, 0, C.f, 1); evaluate(); C.steps(400)`);
const mid = R(`fanRpm(C.f)`);
check("a clock on PWM gives a speed between idle and full", mid > 400 && mid < 1100, mid);

/* ---- heat ---- */
R(`C.reset(); setTest(true);`);
check("Test mode opens the monitor, cold", R(`S.th !== null && S.th.parts === 0 && S.th.max === AMBIENT`));
/* an ALU with an input high works at 2 W: 25 + 2 x 40 = 105 °C with no air */
R(`C.alu = C.add("ALU", 0, 0); C.sw = C.add("SWITCH", -120, 0); C.sw.s = 1; C.wire(C.sw, 0, C.alu, 0); evaluate(); C.steps(1500)`);
const bare = R(`S.th.max`);
check("an ALU with no fan runs up to its limit (about 105 °C)", approx(bare, 105, 3), bare);
check("the monitor names the hottest part", R(`S.th.name`) === "ALU");
check("a part that is cold has no glow, a hot one does", R(`heatColor(30)`) === null && /^hsla/.test(R(`heatColor(100)`)));
check("levels", R(`heatLevel(30) === "ok" && heatLevel(70) === "warm" && heatLevel(90) === "hot" && heatLevel(110) === "crit"`));

/* the same ALU with a 120 mm fan beside it, powered */
R(`C.reset(); setTest(true); C.alu = C.add("ALU", 0, 0); C.sw = C.add("SWITCH", -120, 0); C.sw.s = 1; C.wire(C.sw, 0, C.alu, 0);
   C.v = C.add("VCC", 120, -100); C.f = C.add("FAN120", 120, 0); C.wire(C.v, 0, C.f, 0); evaluate(); C.steps(1500)`);
const cooled = R(`S.th.max`);
check("a running fan beside it keeps it far cooler", cooled < bare - 25, cooled + " vs " + bare);
check("the monitor counts the fan", R(`S.th.fans === 1 && S.th.rpm === 1500`));
/* the same fan too far away does nothing */
R(`C.reset(); setTest(true); C.alu = C.add("ALU", 0, 0); C.sw = C.add("SWITCH", -120, 0); C.sw.s = 1; C.wire(C.sw, 0, C.alu, 0);
   C.v = C.add("VCC", 1900, -100); C.f = C.add("FAN120", 2000, 0); C.wire(C.v, 0, C.f, 0); evaluate(); C.steps(1500)`);
check("a fan out of reach does nothing", approx(R(`S.th.max`), bare, 1), R(`S.th.max`));
/* an unpowered fan does not cool */
R(`C.reset(); setTest(true); C.alu = C.add("ALU", 0, 0); C.sw = C.add("SWITCH", -120, 0); C.sw.s = 1; C.wire(C.sw, 0, C.alu, 0);
   C.f = C.add("FAN120", 200, 0); evaluate(); C.steps(1500)`);
check("a fan with no power does not cool", approx(R(`S.th.max`), bare, 1), R(`S.th.max`));
/* leaving Test mode forgets the temperatures */
R(`setTest(false)`);
check("leaving Test mode puts the monitor away and clears the heat", R(`S.th === null && S.nodes.every(function(n){ return n.tc === undefined; })`));
/* nothing saved: running state stays out of the build */
const keys = R(`Array.from(new Set(snapshot().nodes.flatMap(function(n){ return Object.keys(n); })))`);
check("fan and heat state are not saved with the build", keys.every((k) => ["id","t","x","y","s","l","c","m"].includes(k)), keys.join());

/* ---- the dustbin ---- */
R(`S.cv = {style:{}, clientWidth:1000, clientHeight:700, getBoundingClientRect:function(){ return {left:0, top:0, right:1000, bottom:700}; }}`);
R(`C.reset(); C.a = C.add("AND", 96, 96); C.b = C.add("OR", 240, 96); C.wire(C.a, 0, C.b, 0); evaluate();
   pickOne("n", C.a.id); S.drag = {id:C.a.id, off:[{o:C.a, dx:5, dy:5, x0:96, y0:96}], moved:true}; C.a.x = 600; C.a.y = 400;`);
R(`dropInBin(); S.drag = null;`);
check("a part let go in the bin is deleted, with its wires", R(`S.nodes.length === 1 && S.wires.length === 0 && !byId.has(C.a.id)`));
R(`undo()`);
check("Ctrl+Z puts it back where it was picked up", R(`S.nodes.length === 2 && S.wires.length === 1 && byId.get(C.a.id).x === 96 && byId.get(C.a.id).y === 96`));
/* a boxed-in region goes in one go */
R(`clearPick(); pickN.add(C.a.id); pickN.add(C.b.id); pickSpread(); S.drag = {id:C.a.id, off:[{o:C.a, dx:0, dy:0, x0:96, y0:96}, {o:C.b, dx:0, dy:0, x0:240, y0:96}], moved:true}; dropInBin(); S.drag = null;`);
check("a region goes in the bin together", R(`S.nodes.length === 0 && S.wires.length === 0`));
/* a part taken straight off the console and into the bin leaves nothing behind, not even an undo */
R(`C.reset(); C.a = C.add("AND", 96, 96); evaluate(); spawnPart("NOR", {clientX:300, clientY:200}); var n0 = S.nodes.length;`);
R(`dropInBin(); S.drag = null;`);
check("a new part dropped in the bin is simply gone", R(`n0 === 2 && S.nodes.length === 1 && S.undoStack.length === 0`));
/* a loose wire end */
R(`C.reset(); C.a = C.add("AND", 96, 96); C.w = loose({kind:"out", id:C.a.id, p:0}, {x:300, y:300}); pickOne("w", C.w.id); S.wend = {w:C.w, e:"b"}; removeSel(); S.wend = null;`);
check("a wire end let go in the bin takes the wire", R(`S.wires.length === 0 && S.nodes.length === 1`));

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
