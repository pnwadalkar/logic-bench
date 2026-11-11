import { useEffect, useState } from "react";
import { S, flash } from "../bench/state.js";
import { Auth } from "../bench/auth.js";
import { Collab } from "../bench/collab.js";
import { tipText } from "../bench/core.js";
import { countText, picked } from "../bench/sim.js";
import { askNew, exampleHere, renameBuild, saveBuild } from "../bench/builds.js";
import { cleanUp, setTest } from "../bench/cleaner.js";
import { removeSel } from "../bench/edit.js";
import { crewList, homeShow, inviteAsk } from "../bench/home.js";
import { arenaShow } from "../bench/arena.js";
import { SYNC_TEXT, askSignOut } from "../bench/account.js";
import { canFull, goFull, isFull, leaveFull } from "../bench/fullscreen.js";
import { useBench } from "../hooks.js";
import Avatars from "./Avatars.jsx";

/* The build's name. Type over it to rename the build; while it is being typed
   the bench never yanks the text out from under you. */
function DocName() {
  const [draft, setDraft] = useState(null);
  return (
    <input id="docname" maxLength={40} spellCheck="false" placeholder="Untitled"
      aria-label="Build name" title="The build's name — type over it to rename"
      value={draft === null ? S.docName : draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { if (draft !== null) { renameBuild(draft); setDraft(null); } }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        else if (e.key === "Escape") { setDraft(null); const el = e.currentTarget; setTimeout(() => el.blur(), 0); }
      }} />
  );
}

/* Full screen, turned sideways — the button only where the browser can do it. */
function FullButton() {
  const [full, setFull] = useState(isFull());
  useEffect(() => {
    const on = () => setFull(isFull());
    document.addEventListener("fullscreenchange", on);
    document.addEventListener("webkitfullscreenchange", on);
    return () => {
      document.removeEventListener("fullscreenchange", on);
      document.removeEventListener("webkitfullscreenchange", on);
    };
  }, []);
  if (!canFull()) return null;
  return (
    <button id="btnFull" type="button" title="Full screen, turned sideways"
      onClick={() => { if (isFull()) leaveFull(); else goFull(); }}>
      {full ? "Exit full" : "Full screen"}
    </button>
  );
}

/* Who is on a shared sheet with you, and whether it is live. */
function Crew() {
  if (!Collab.active()) return null;
  const st = Collab.status();
  return (
    <span id="crew">
      <span id="crewLive" className={"live " + st}
        title={st === "offline" ? "Can't reach the server — your changes go up when it is back" : "Shared project · live"}></span>
      <span id="crewPpl" aria-label="Who is here"><Avatars people={crewList()} max={5} /></span>
      <button id="btnInvite" type="button" title="Invite people to build on this sheet with you"
        onClick={() => inviteAsk(Collab.project())}>Invite</button>
    </span>
  );
}

function UserChip() {
  const u = Auth.current();
  if (!u) return null;
  const cloud = Auth.cloud(), sync = cloud ? Auth.syncState() : "";
  return (
    <button id="btnUser" className="user" type="button" data-sync={sync} onClick={askSignOut}
      title={"Signed in as " + u.name + (cloud ? " · " + SYNC_TEXT[sync] : "") + " · click to sign out"}>
      <i id="userDot" aria-hidden="true" style={{ background: "hsl(" + u.color + ",55%,42%)" }}>{u.name.charAt(0).toUpperCase()}</i>
      <span id="userName">{u.name}</span>
    </button>
  );
}

/* The bar across the top: the build's name and kind, what is on the sheet, and
   everything that is done to a whole build. */
export default function Header() {
  useBench();
  const quantum = S.docKind === "quantum", test = S.testMode, tip = tipText();
  return (
    <header>
      <div className="bar">
        <h1>Logic <em>Bench</em></h1>
        <DocName />
        <span id="dot" className={S.docDirty ? "on" : ""} aria-hidden="true" title="Unsaved changes">•</span>
        <span id="kind" className={S.docKind} title={quantum
          ? "A quantum build: qubits, quantum gates and meters"
          : "A classical build: switches, logic gates, chips and memory"}>
          {quantum ? "Quantum" : "Classical"}
        </span>
        <Crew />
        <span id="tip" title={tip}>{tip}</span>
        <span className="spacer"></span>
        <span id="count" className={S.open > 0 ? "warn" : ""}>{countText()}</span>
        <FullButton />
        <button id="btnArena" type="button" title="Send a build in against a challenge and see where it ranks" onClick={arenaShow}>Arena</button>
        <button id="btnHome" type="button" title="All your builds, as cards to pick from" onClick={homeShow}>Home</button>
        <button id="btnSave" type="button" title="Name this build and save it (Ctrl+S)" onClick={saveBuild}>Save</button>
        <button id="btnNew" type="button" title="Start a fresh sheet, classical or quantum — the one you are on is kept"
          onClick={() => askNew((kind) => flash("New " + kind + " sheet — “" + S.docName + "”"))}>New</button>
        <button id="btnEg" type="button" onClick={exampleHere}>Example</button>
        {!quantum && (
          <button id="btnClean" type="button" disabled={test} onClick={() => cleanUp()}
            title="Cleaner looks: lay the circuit out in columns, keep the inputs in the order you drew them, gather the lamps in one column down the right-hand edge, straighten every wire, square the corners and squeeze out the dead space (C)">Cleaner</button>
        )}
        <button id="btnDel" type="button" disabled={test || !picked()} onClick={removeSel}>Delete</button>
        <button id="btnTest" type="button" className={test ? "armed" : ""}
          title="Lock the sheet and drive it with the switches (T)" onClick={() => setTest(!S.testMode)}>
          {test ? "Test · on" : "Test"}
        </button>
        <UserChip />
      </div>
    </header>
  );
}
