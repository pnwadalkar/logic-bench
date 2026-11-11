import { useEffect, useRef, useState } from "react";
import { S, notify } from "../bench/state.js";
import { Auth } from "../bench/auth.js";
import {
  CHALLENGES, arenaBuilds, arenaClose, arenaRun, chalById, exportEntries, importEntries, leaders, ruleText, standings
} from "../bench/arena.js";
import { readFile } from "../bench/home.js";
import { useBench } from "../hooks.js";

/* a player: a round initial, the name, and whether it is a bot or you */
function Who({ r, me }) {
  return (
    <span className="who">
      <i className="pdot" style={{ background: r.bot ? "var(--muted)" : "hsl(" + r.color + ",55%,42%)" }}>
        {(r.name || "?").charAt(0).toUpperCase()}
      </i>
      <b>{r.name}</b>
      {r.bot ? <small className="tag">bot</small> : me && r.id === me.id ? <small className="tag you">you</small> : null}
    </span>
  );
}
/* head: [{t: title, c: class}], rows: [{cls, cells}] */
function Table({ head, rows, mini }) {
  return (
    <table className={"tbl" + (mini ? " mini" : "")}>
      <tbody>
        <tr>{head.map((h, i) => <th key={i} className={h.c}>{h.t}</th>)}</tr>
        {rows.map((r, k) => (
          <tr key={k} className={r.cls}>{r.cells.map((c, i) => <td key={i} className={head[i].c}>{c}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}
function Level({ ch }) { return <span className={"tg lv" + ch.level.charAt(0)}>{ch.level}</span>; }

/* every challenge, and how you stand in each */
function List({ me, pick }) {
  return (
    <>
      <p className="sect">Challenges</p>
      <div className="chals">
        {CHALLENGES.map((ch) => {
          const rows = standings(ch), mine = rows.filter((r) => me && r.id === me.id)[0], top = rows[0];
          return (
            <button key={ch.id} type="button" className="chal" onClick={() => pick(ch.id)}>
              <b>{ch.name}</b>
              <p>{ch.blurb}</p>
              <div className="tags">
                <Level ch={ch} />
                <span className="tg">{ch.ins.length} in → {ch.outs.length} out</span>
                <span className="tg">{ch.use === "chips" ? "chips allowed" : "gates only"}</span>
              </div>
              <small className={mine ? "mine" : ""}>{mine
                ? "You: #" + mine.rank + " of " + rows.length + " · " + mine.pts + " pts"
                : "Not entered · " + rows.length + " entr" + (rows.length === 1 ? "y" : "ies") + (top ? " · best: " + top.name : "")}</small>
            </button>
          );
        })}
      </div>
      <p className="note">Pick a challenge, build it on the sheet, and send it in. The checker runs every input pattern, then measures the size and the speed. Your best build for each challenge counts toward your rating.</p>
    </>
  );
}

function Rankings({ me }) {
  return (
    <>
      <p className="sect">Players · points from the best build in each challenge</p>
      <Table head={[{ t: "#", c: "n" }, { t: "Player" }, { t: "Solved", c: "n" }, { t: "First places", c: "n opt" }, { t: "Points", c: "n" }]}
        rows={leaders().map((p) => ({
          cls: me && p.id === me.id ? "me" : "",
          cells: [p.rank, <Who r={p} me={me} />, p.solved + " / " + CHALLENGES.length, p.golds, p.pts]
        }))} />
      <p className="note">A challenge's benchmark build is worth 1000 points; a leaner build is worth more, a heavier one less.</p>
    </>
  );
}

/* what the checker found, in plain words */
function Report({ ch, res }) {
  const r = res.r, rep = r.rep;
  const list = (a) => a.slice(0, 4).map((x) => x.name).join(", ") + (a.length > 4 ? " and " + (a.length - 4) + " more" : "");
  if (!rep.ok) {
    return (
      <div className="report bad">
        <b>“{res.build}” — doesn't pass</b>
        <ul>{rep.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
        {rep.miss.length > 0 && (
          <Table mini head={[{ t: ch.ins.join(" ") }, { t: "Wanted " + ch.outs.join(" ") }, { t: "Got" }]}
            rows={rep.miss.map((m) => ({ cells: [m.ins.join(" "), m.want.join(" "), m.got.join(" ")] }))} />
        )}
      </div>
    );
  }
  return (
    <div className="report good">
      <b>“{res.build}” — works on all {rep.total} input patterns</b>
      <Table head={[{ t: "Size" }, { t: "Speed" }, { t: "Wires" }, { t: "Score" }, { t: "Points" }]}
        rows={[{ cells: [rep.size + " transistors", rep.depth + " gate delays", rep.wires, rep.cost.toFixed(1), r.pts] }]} />
      {r.kept
        ? <p>Not entered: your best here, #{r.prev.rank} ({r.prev.pts} pts), is as good or better.</p>
        : <p>{res.save ? "Entered — you are " : "Would take "}#{r.rank} of {r.of}.</p>}
      {r.beat.length > 0 && <p>Ahead of {list(r.beat)}.</p>}
      {r.lost.length > 0 && <p>Behind {list(r.lost)}.</p>}
      {!res.save && <p className="note">This was only a check. Submit to the Arena to enter it.</p>}
    </div>
  );
}

/* pick a build, check it, send it in */
function Submit({ ch }) {
  const builds = arenaBuilds();
  const [pick, setPick] = useState("");
  const [res, setRes] = useState(null);
  const value = builds.some((b) => b.v === pick) ? pick : builds.length ? builds[0].v : "";
  const run = (save) => { const r = arenaRun(ch, value, save); if (r) { setPick(value); setRes(r); notify(); } };   /* the board beside this is read again */
  return (
    <div className="submit">
      <select aria-label="Build to send in" value={value} onChange={(e) => setPick(e.target.value)}>
        {builds.length
          ? builds.map((b) => <option key={b.v} value={b.v}>{b.t}</option>)
          : <option value="">No builds yet — make one on the sheet first</option>}
      </select>
      <div className="acts">
        <button type="button" title="Run the checker and see how this build would do — nothing is entered" onClick={() => run(false)}>Check</button>
        <button type="button" className="key" onClick={() => run(true)}>Submit to the Arena</button>
      </div>
      <div className="rep">{res && res.ch === ch.id && <Report ch={ch} res={res} />}</div>
    </div>
  );
}

function Challenge({ ch, me, back }) {
  return (
    <>
      <div className="chTop">
        <button type="button" onClick={back}>← All challenges</button>
        <h2>{ch.name}</h2>
        <Level ch={ch} />
      </div>
      <div className="cols">
        <div className="col">
          <p className="sect">The brief</p>
          <p className="blurb">{ch.blurb}</p>
          <div className="io">
            <span className="k">Switches</span><span className="v">{ch.ins.join("  ")}</span>
            <span className="k">Lamps</span><span className="v">{ch.outs.join("  ")}</span>
            <span className="k">Parts</span><span className="v">{ruleText(ch)}</span>
          </div>
          <p className="note">Name your switches and lamps as above (double-click a part to rename it), or just keep them in that order from top to bottom. Score = transistors + 4 × gate delays + ½ × wires; lower is better.</p>
          <p className="sect">Send a build in</p>
          <Submit ch={ch} />
        </div>
        <div className="col">
          <p className="sect">Leaderboard</p>
          <Table head={[{ t: "#", c: "n" }, { t: "Player" }, { t: "Size", c: "n" }, { t: "Speed", c: "n" }, { t: "Wires", c: "n opt" }, { t: "Points", c: "n" }]}
            rows={standings(ch).map((r) => ({
              cls: me && r.id === me.id ? "me" : "",
              cells: [r.rank, <Who r={r} me={me} />, r.rep.size + " T", r.rep.depth + " gd", r.rep.wires, r.pts]
            }))} />
          <p className="note">Size is in transistors, speed in gate delays (the longest path from a switch to a lamp). Entries are re-checked every time this board is drawn.</p>
        </div>
      </div>
    </>
  );
}

/* The Arena: challenges, the people who have entered them, and the ranking. */
export default function Arena() {
  useBench();
  const [tab, setTab] = useState("c");
  const [chal, setChal] = useState(null);
  const page = useRef(null), file = useRef(null);
  const me = Auth.current();
  useEffect(() => {
    const key = (e) => { if (e.key === "Escape" && !S.dialog) arenaClose(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => { if (page.current) page.current.scrollTop = 0; }, [chal, tab]);
  const all = leaders(), mine = all.filter((p) => me && p.id === me.id)[0];
  return (
    <div id="arena" ref={page}>
      <div className="wrap">
        <div className="homeTop">
          <h1>Logic <em>Arena</em></h1>
          <p>Playing as <b id="arenaWho">{me ? me.name : ""}</b> · <span id="aRate">{mine ? mine.pts + " pts · #" + mine.rank + " of " + all.length : "No entries yet"}</span></p>
        </div>
        <div className="homeAct">
          <button id="aBack" className="key" type="button" onClick={arenaClose}>Back</button>
          <button id="aTabC" className={"tab" + (tab === "c" ? " on" : "")} type="button" onClick={() => { setTab("c"); setChal(null); }}>Challenges</button>
          <button id="aTabR" className={"tab" + (tab === "r" ? " on" : "")} type="button" onClick={() => { setTab("r"); setChal(null); }}>Rankings</button>
          <span className="spacer"></span>
          <button id="aExp" type="button" title="Download your entries as one file to hand to someone on another device" onClick={exportEntries}>Share my entries</button>
          <button id="aImp" type="button" title="Bring in someone else's entries. Each one is run through the checker again" onClick={() => file.current.click()}>Import entries</button>
          <input id="aFile" ref={file} type="file" accept=".json,application/json" hidden
            onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ""; if (f) readFile(f, importEntries); }} />
        </div>
        <div id="aBody">
          {tab === "r" ? <Rankings me={me} />
            : chal ? <Challenge key={chal} ch={chalById(chal)} me={me} back={() => setChal(null)} />
            : <List me={me} pick={setChal} />}
        </div>
      </div>
    </div>
  );
}
