import { useEffect, useRef, useState } from "react";
import { S, flash } from "../bench/state.js";
import { Auth } from "../bench/auth.js";
import { Collab } from "../bench/collab.js";
import { askDelete, askNew, askRename, copyBuild, example, example2, libRead, snapshot, when } from "../bench/builds.js";
import { exampleQ } from "../bench/quantum.js";
import { arenaShow } from "../bench/arena.js";
import {
  askDeleteShared, askQuitShared, backupAll, enterBench, inviteAsk, joinShared, loadShared, newShared, openBuild, openShared,
  readFile, restoreText, shareSheet, thumb
} from "../bench/home.js";
import { useBench } from "../hooks.js";
import Avatars from "./Avatars.jsx";

/* A card's picture: the build drawn small, with the same part drawings the sheet uses. */
function Thumb({ doc, colors }) {
  const ref = useRef(null);
  useEffect(() => { thumb(ref.current, doc); });
  return <canvas ref={ref} data-colors={colors} />;
}

/* One build. The sheet already in hand gets the live card: it opens straight back
   into what is on screen, and carries the tag that says whether it is saved. */
function Card({ name, doc, live }) {
  const open = () => { if (live) enterBench(); else openBuild(name); };
  const quantum = doc.kind === "quantum";
  const parts = doc.nodes ? doc.nodes.length : 0, wires = doc.wires ? doc.wires.length : 0;
  return (
    <div className={"card" + (live ? " now" : "") + (quantum ? " quantum" : "")}>
      <button type="button" className="go" onClick={open}>
        <Thumb doc={doc} colors={S.colorsRev} />
        <b>{name}{quantum && <span className="kindTag">Quantum</span>}</b>
        <small>
          {parts} parts · {wires} wires{!live && doc.at ? " · " + when(doc.at) : ""}
          {live && <i> · {S.docDirty ? "unsaved" : "open"}</i>}
        </small>
      </button>
      <div className="acts">
        <button type="button" className="key" title={"Open “" + name + "”"} onClick={open}>Open</button>
        <button type="button" title={"Rename “" + name + "”"} onClick={() => askRename(name, live)}>Rename</button>
        <button type="button" title={"Copy “" + name + "”"} onClick={() => copyBuild(name, live)}>Copy</button>
        <button type="button" className="danger" title={"Delete “" + name + "”"} onClick={() => askDelete(name, live)}>Delete</button>
      </div>
    </div>
  );
}

/* One shared project: who is in it, and the way in. */
function SharedCard({ p }) {
  const open = Collab.project(), me = Auth.current();
  const live = !!open && open.id === p.id, owner = !!me && p.owner === me.id;
  return (
    <div className={"card shared" + (live ? " now" : "") + (p.kind === "quantum" ? " quantum" : "")}>
      <button type="button" className="go" onClick={() => openShared(p.id)}>
        <Avatars max={8} people={p.members.map((m) => ({ name: m.name, color: m.color, note: m.id === p.owner ? " · owner" : "" }))} />
        <b>{p.name}{p.kind === "quantum" && <span className="kindTag">Quantum</span>}</b>
        <small>
          {p.parts} part{p.parts === 1 ? "" : "s"} · {p.members.length} {p.members.length === 1 ? "person" : "people"} · code {p.code}
          {live && <i> · open</i>}
        </small>
      </button>
      <div className="acts">
        <button type="button" className="key" title="Open" onClick={() => openShared(p.id)}>Open</button>
        <button type="button" title="Get the invite link and code" onClick={() => inviteAsk(p)}>Invite</button>
        {owner
          ? <button type="button" className="danger" title="Delete this project for everyone" onClick={() => askDeleteShared(p)}>Delete</button>
          : <button type="button" className="danger" title="Take this project off your list" onClick={() => askQuitShared(p)}>Leave</button>}
      </div>
    </div>
  );
}

/* Projects you build with other people, live. They need the website: the offline
   copy has no server to share through. */
function Shared() {
  const cloud = Auth.cloud(), sh = S.shared;
  const [code, setCode] = useState("");
  const join = (e) => {
    e.preventDefault();
    if (!code.trim()) return;
    joinShared(code.trim()).then((ok) => { if (ok) setCode(""); });
  };
  return (
    <div id="shBox">
      <p className="sect">Shared projects · build one circuit together, live</p>
      {cloud && (
        <div className="homeAct">
          <button id="shNew" type="button" title="Start an empty sheet that others can join and build on with you" onClick={newShared}>New shared project</button>
          <button id="shFrom" type="button" title="Turn the sheet you have open into a shared project"
            disabled={!S.nodes.length || Collab.active()} onClick={shareSheet}>Share the sheet I'm on</button>
          <form id="shJoin" className="join" autoComplete="off" onSubmit={join}>
            <input id="shCode" maxLength={8} spellCheck="false" autoCapitalize="characters" placeholder="Invite code"
              aria-label="Invite code" value={code} onChange={(e) => setCode(e.target.value)} />
            <button type="submit">Join</button>
          </form>
        </div>
      )}
      <div id="shared" data-empty={!cloud || sh.list.length ? "" : sh.loaded ? "none" : "loading"}>
        {cloud && sh.list.map((p) => <SharedCard key={p.id} p={p} />)}
      </div>
      <p id="shNote" className="note">{!cloud
        ? "Shared projects need the Logic Bench website — this offline copy has no server to share through."
        : sh.error || "Everyone in a project can change every part of it, and sees the others' changes and pointers within a second or two. Undo only takes back your own changes."}</p>
    </div>
  );
}

/* The home page: every build as a card, so a session starts by picking one rather
   than by remembering what was on the sheet last time. */
export default function Home() {
  useBench();
  const file = useRef(null);
  /* While the home page is up, other people's changes arrive on it: new members,
     new projects you were invited to, builds saved on your other devices. */
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      loadShared();
      Auth.refresh();
    };
    const id = setInterval(tick, 6000);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    tick();
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", tick); window.removeEventListener("focus", tick); };
  }, []);
  const me = Auth.current(), lib = libRead();
  const onSheet = S.nodes.length > 0 && !Collab.active();
  /* the open sheet is the first card — it is not listed twice */
  const names = Object.keys(lib).filter((n) => !(onSheet && n === S.docName))
    .sort((a, b) => (lib[b].at || 0) - (lib[a].at || 0));
  const started = (kind) => { enterBench(); flash("New " + kind + " sheet · drag a part in from the console below"); };
  return (
    <div id="home">
      <div className="wrap">
        <div className="homeTop">
          <h1>Logic <em>Bench</em></h1>
          <p>Signed in as <b id="homeWho">{me ? me.name : ""}</b> · pick a build to work on.</p>
        </div>
        <div className="homeAct">
          <button id="hNew" className="key" type="button" title="Start a new build — classical or quantum" onClick={() => askNew(started)}>New build</button>
          <button id="hArena" type="button" title="Challenges, rankings and the checker" onClick={arenaShow}>Arena</button>
          <button id="hEg" type="button" onClick={() => { example(); enterBench(); }}>Half adder example</button>
          <button id="hEg2" type="button" title="A clock driving a counter, read out on a hex display" onClick={() => { example2(); enterBench(); }}>Counter example</button>
          <button id="hEgQ" type="button" title="A quantum build: a Hadamard and a CNOT entangle two qubits, so the meters only ever agree" onClick={() => { exampleQ(); enterBench(); }}>Bell pair example</button>
          <button id="hSave" type="button" title="Download every build as one file, to keep safe or carry to another device" onClick={backupAll}>Back up all</button>
          <button id="hLoad" type="button" title="Bring builds back in from a backup file" onClick={() => file.current.click()}>Restore</button>
          <input id="hFile" ref={file} type="file" accept=".json,application/json" hidden
            onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ""; if (f) readFile(f, restoreText); }} />
          <span className="spacer"></span>
          {(S.nodes.length > 0 || Collab.active()) && <button id="hBack" type="button" onClick={enterBench}>Back to the sheet</button>}
        </div>
        <Shared />
        <p className="sect">Your builds</p>
        <div id="cards">
          {onSheet && <Card key="\u0001live" name={S.docName || "Untitled sheet"} doc={snapshot()} live />}
          {names.map((n) => <Card key={n} name={n} doc={lib[n]} />)}
        </div>
        <p id="homeNote">
          {Auth.cloud()
            ? "Your builds are saved to your account, so they are here on any device you sign in on."
            : "Your builds are kept on this device and need no internet."}
          {" Save asks for a name · tap a card to open it · Back up all downloads every build as one file you can Restore here or on another device."}
        </p>
      </div>
    </div>
  );
}
