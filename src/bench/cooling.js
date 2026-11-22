/* Fans, and the heat they take away.

   A fan (see FAN80 … FAN140P in core.js) is a timed part like the clock: its speed
   builds up and dies away rather than jumping, and its TACH output ticks by itself.
   Everything here is in slow motion so the eye, and a 20 Hz timer, can follow it: the
   blades turn, and TACH pulses, SLOMO times slower than the RPM on the label says.

   Test mode adds a thermal model. Every part that draws power turns it into heat, and
   settles at AMBIENT + watts × RTH — less where a running fan blows over it. The
   hottest part is what the temperature monitor reports. None of this is saved with a
   build: the fields it puts on a part (fs, fa, tp, ta, tc, pk, hs) are only the
   running state, and a reload starts every fan stopped and every part cold. */
import { S } from "./state.js";
import { TYPES } from "./core.js";

export var SLOMO = 40;            /* real speed ÷ this = the speed shown, blades and tach alike */
export var FAN_UP = 0.06;         /* how far a fan gets to its target speed each 50 ms step while spinning up */
export var FAN_DOWN = 0.03;       /* … and while coasting down: a fan keeps turning for a while */
export var PWM_MIN = 0.2;         /* a 4-pin fan with PWM held low idles at this share of full speed */

export var AMBIENT = 25;          /* °C of the room */
export var WARM = 60, HOT = 85, CRIT = 105;
export var RTH = 40;              /* °C per watt for a part with no air on it */
export var TAU = 5000;            /* ms a part takes to get 63% of the way to its temperature: time-lapse */
export var HIST = 120;            /* readings the monitor's graph keeps, half a second apart */

S.th = null;                      /* the monitor's numbers while Test mode is on: see heatStep */

export function isFan(n){ return !!(TYPES[n.t] && TYPES[n.t].fan); }
export function fanRpm(n){ return Math.round((n.fs || 0) * TYPES[n.t].fan.rpm); }

/* One 50 ms step of a fan: its speed, its blades, its tach. dt is the step in ms.
   Returns whether the TACH output changed (the sheet must settle again) and whether
   the fan is turning, or has just stopped (the sheet only needs painting). */
export function fanStep(n, dt){
  var f = TYPES[n.t].fan, a = n.ia || [], was = n.fs || 0, target, k, hz, half, logic = false;
  /* +12V high and it runs: flat out, or on PWM's say — high is full speed, low only idles */
  target = a[0] ? (f.pwm ? (a[1] ? 1 : PWM_MIN) : 1) : 0;
  k = target > was ? FAN_UP : FAN_DOWN;
  n.fs = was + (target - was) * k;
  if (Math.abs(n.fs - target) < 0.002) n.fs = target;
  n.fa = ((n.fa || 0) + n.fs * f.rpm / 60 / SLOMO * 2 * Math.PI * dt / 1000) % (2 * Math.PI);
  /* two pulses a turn: a square wave of rpm/30 Hz, shown SLOMO times slower */
  hz = n.fs * f.rpm / 30 / SLOMO;
  if (hz > 0.02){
    half = 500 / hz; n.ta = (n.ta || 0) + dt;
    while (n.ta >= half){ n.ta -= half; n.tp = n.tp ? 0 : 1; logic = true; }
  } else {
    n.ta = 0;
    if (n.tp){ n.tp = 0; logic = true; }
  }
  return {logic:logic, spin:n.fs > 0 || was > 0};
}

/* ---------- heat ---------- */
/* What each part gives off when it is working, in watts. Parts not listed — the
   switches, power rails, clock, points — give off none, and take no temperature. */
export var WATTS = {
  NOT:0.08, AND:0.1, OR:0.1, NAND:0.1, NOR:0.1, BUF:0.1, XOR:0.12, XNOR:0.12, TRI:0.12,
  LAMP:0.3, RES:0.25, DIODE:0.1, CAP:0.05, IND:0.1, NMOS:0.15, PMOS:0.15, NPN:0.2, PNP:0.2,
  HEXD:0.3, SEG7:0.6, HADD:0.3, FADD:0.4, ADD4:0.8, CMP4:0.6, ALU:2,
  MUX2:0.3, MUX4:0.4, DEMUX4:0.4, DEC24:0.4, DEC38:0.6, ENC42:0.3,
  SRL:0.2, DL:0.2, DFF:0.3, JKFF:0.3, TFF:0.3, REG4:0.6, SHR4:0.6, CNT4:0.8, RAM:1, ROM:0.8
};
export function watts(n){
  var t = TYPES[n.t];
  if (!t || t.fan) return 0;
  if (t.user) return Math.min(4, 0.3 + 0.1 * t.clip.nodes.length);     /* a chip you made: it is as big as what is inside */
  return WATTS[n.t] || 0;
}
/* How hard a part is working: full while a pin is high, more while its outputs are
   changing, and nearly nothing while it sits with everything low. */
function busy(n){
  var i, idle = TYPES[n.t].outs === 0 ? 0.1 : 0.35;
  if (n.hs > 0) return 1.5;
  for (i = 0; n.iv && i < n.iv.length; i++) if (n.iv[i]) return 1;
  for (i = 0; n.ov && i < n.ov.length; i++) if (n.ov[i]) return 1;
  return idle;
}
/* The air a part gets from the fans that are running: each fan's airflow (its share
   of full speed times its CFM) thinned out over its reach, summed. 1 is the same
   again as no air at all, so it halves the part's thermal resistance. */
function airflow(n, fans){
  var d = TYPES[n.t], cx = n.x + d.w / 2, cy = n.y + d.h / 2, i, f, dist, sum = 0;
  for (i = 0; i < fans.length; i++){
    f = fans[i]; dist = Math.hypot(cx - f.x, cy - f.y);
    if (dist < f.reach) sum += f.k * (1 - dist / f.reach);
  }
  return sum;
}
/* A part's name on the monitor: what you called it, or what it is */
export function partName(n){ return n.l || TYPES[n.t].n; }

/* Everything starts cold when Test mode begins, and is forgotten when it ends. */
export function resetHeat(on){
  var i, n;
  for (i = 0; i < S.nodes.length; i++){
    n = S.nodes[i];
    delete n.tc; delete n.pk; delete n.hs;
  }
  S.th = on ? {max:AMBIENT, avg:AMBIENT, name:"", parts:0, over:0, fans:0, rpm:0, hist:[], acc:0} : null;
}
/* One 50 ms step of the heat: each part moves towards the temperature its power and
   its air give it. Returns whether anything moved enough to be worth painting. */
export function heatStep(dt){
  var fans = [], i, n, d, w, key, target, k, was, sum = 0, parts = 0, over = 0, hot = null, rpm = 0, run = 0, moved = false, th = S.th;
  if (!th) return false;
  for (i = 0; i < S.nodes.length; i++){
    n = S.nodes[i];
    if (!isFan(n) || !(n.fs > 0.02)) continue;
    d = TYPES[n.t];
    fans.push({x:n.x + d.w / 2, y:n.y + d.h / 2, reach:d.fan.reach, k:n.fs * d.fan.cfm / 31});
    run++; rpm += fanRpm(n);
  }
  k = 1 - Math.exp(-dt / TAU);
  for (i = 0; i < S.nodes.length; i++){
    n = S.nodes[i];
    w = watts(n);
    if (!w) continue;
    /* a change at an output keeps a part at full tilt for a second */
    key = (n.ov || []).join("");
    if (n.pk !== undefined && key !== n.pk) n.hs = 20; else if (n.hs > 0) n.hs--;
    n.pk = key;
    was = n.tc === undefined ? AMBIENT : n.tc;
    target = AMBIENT + w * busy(n) * RTH / (1 + airflow(n, fans));
    n.tc = was + (target - was) * k;
    if (Math.abs(n.tc - was) > 0.005) moved = true;
    parts++; sum += n.tc;
    if (n.tc >= HOT) over++;
    if (!hot || n.tc > hot.tc) hot = n;
  }
  th.parts = parts; th.over = over; th.fans = run; th.rpm = run ? Math.round(rpm / run) : 0;
  th.max = hot ? hot.tc : AMBIENT; th.avg = parts ? sum / parts : AMBIENT; th.name = hot ? partName(hot) : "";
  th.acc += dt;
  if (th.acc >= 500){
    th.acc = 0; th.hist.push(th.max);
    if (th.hist.length > HIST) th.hist.shift();
  }
  return moved;
}
/* the glow a hot part gets on the sheet: none while it is cool, amber, then red */
export function heatColor(tc){
  var t = Math.max(0, Math.min(1, (tc - 40) / (CRIT - 40)));
  if (tc < 40) return null;
  return "hsla(" + Math.round(45 - 45 * t) + ",95%,52%," + (0.1 + 0.4 * t).toFixed(2) + ")";
}
/* which band a temperature is in, for the monitor's colours and its verdict */
export function heatLevel(tc){ return tc >= CRIT ? "crit" : tc >= HOT ? "hot" : tc >= WARM ? "warm" : "ok"; }
