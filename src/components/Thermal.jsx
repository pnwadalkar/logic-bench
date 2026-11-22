import { S } from "../bench/state.js";
import { AMBIENT, CRIT, HIST, HOT, WARM, heatLevel } from "../bench/cooling.js";
import { useBench } from "../hooks.js";

/* The graph's axis runs from a little under ambient to a little over critical */
const LO = 20, HI = 120, W = 176, H = 54;
const yOf = (t) => H - ((Math.max(LO, Math.min(HI, t)) - LO) / (HI - LO)) * H;

const VERDICT = {
  ok: "Cool — every part is comfortable.",
  warm: "Warming up — a fan nearby would help.",
  hot: "Hot — put a fan close to it, or cut its work.",
  crit: "Overheating! Cool it now, or it would fail."
};

/* The temperature monitor, over the sheet's top-right corner while Test mode is on.
   It reads the hottest part now, graphs it over the last minute, and says how many
   fans are running to cool the sheet. cooling.js keeps the numbers (S.th). */
export default function Thermal() {
  useBench();
  const th = S.th;
  if (!S.testMode || S.docKind === "quantum" || !th) return null;
  const lvl = th.parts ? heatLevel(th.max) : "ok";
  const pts = th.hist.map((t, i) => (W - (th.hist.length - 1 - i) * (W / (HIST - 1))).toFixed(1) + "," + yOf(t).toFixed(1));
  return (
    <div id="therm" className={lvl} role="status" aria-label="Temperature monitor">
      <div className="thHead"><b>Temperature</b><span>test mode</span></div>
      <div className="thRead">
        <strong>{th.parts ? th.max.toFixed(1) : "—"}</strong><small>°C</small>
        <span className="thName">{th.parts ? "hottest: " + th.name : "no heat yet"}</span>
      </div>
      <svg viewBox={"0 0 " + W + " " + H} className="thGraph" aria-hidden="true" preserveAspectRatio="none">
        <line x1="0" x2={W} y1={yOf(HOT)} y2={yOf(HOT)} className="thHot" />
        <line x1="0" x2={W} y1={yOf(CRIT)} y2={yOf(CRIT)} className="thCrit" />
        <line x1="0" x2={W} y1={yOf(AMBIENT)} y2={yOf(AMBIENT)} className="thAmb" />
        {pts.length > 1 && <polyline points={pts.join(" ")} className="thLine" />}
      </svg>
      <dl className="thStats">
        <div><dt>Avg</dt><dd>{th.parts ? th.avg.toFixed(1) : "—"} °C</dd></div>
        <div><dt>Room</dt><dd>{AMBIENT} °C</dd></div>
        <div><dt>Fans</dt><dd>{th.fans ? th.fans + (th.fans === 1 ? " running · " : " running · avg ") + th.rpm + " rpm" : "none running"}</dd></div>
        <div><dt>&gt;{HOT} °C</dt><dd>{th.over}</dd></div>
      </dl>
      <p className="thNote">{th.parts ? VERDICT[lvl] : "Parts that draw power warm up here — an ALU, a counter, RAM. Fans from the Cooling tab take the heat away."}</p>
      <p className="thKey" aria-hidden="true">warm {WARM} · hot {HOT} · fail {CRIT} °C</p>
    </div>
  );
}
