import { memo } from "react";
import { useStore } from "../store.js";
import QuantumPanel from "./QuantumPanel.jsx";

/* Which kind of build is on the sheet, beside its name. */
function KindBadge() {
  const kind = useStore((s) => s.kind);
  return (
    <span id="kind" className={kind} title={kind === "quantum"
      ? "A quantum build: qubits, quantum gates and meters"
      : "A classical build: switches, logic gates, chips and memory"}>
      {kind === "quantum" ? "Quantum" : "Classical"}
    </span>
  );
}

/* The bench itself: the bar, the sheet and the parts console. The engine fills in
   and works everything with an id here, so this never renders twice — the pieces
   that follow React state (the badge, the quantum panel) are components of their own. */
function Bench() {
  return (
    <div id="app">
      <header>
        <div className="bar">
          <h1>Logic <em>Bench</em></h1>
          <input id="docname" maxLength={40} spellCheck="false" placeholder="Untitled"
            aria-label="Build name" title="The build's name — type over it to rename" />
          <span id="dot" aria-hidden="true" title="Unsaved changes">•</span>
          <KindBadge />
          <span id="crew" hidden>
            <span id="crewLive" className="live" title="Shared project"></span>
            <span id="crewPpl" aria-label="Who is here"></span>
            <button id="btnInvite" type="button" title="Invite people to build on this sheet with you">Invite</button>
          </span>
          <span id="tip"></span>
          <span className="spacer"></span>
          <span id="count"></span>
          <button id="btnFull" type="button" title="Full screen, turned sideways">Full screen</button>
          <button id="btnArena" type="button" title="Send a build in against a challenge and see where it ranks">Arena</button>
          <button id="btnHome" type="button" title="All your builds, as cards to pick from">Home</button>
          <button id="btnSave" type="button" title="Name this build and save it (Ctrl+S)">Save</button>
          <button id="btnNew" type="button" title="Start a fresh sheet, classical or quantum — the one you are on is kept">New</button>
          <button id="btnEg" type="button">Example</button>
          <button id="btnClean" type="button" title="Cleaner looks: lay the circuit out in columns, keep the inputs in the order you drew them, gather the lamps in one column down the right-hand edge, straighten every wire, square the corners and squeeze out the dead space (C)">Cleaner</button>
          <button id="btnDel" type="button">Delete</button>
          <button id="btnTest" type="button" title="Lock the sheet and drive it with the switches (T)">Test</button>
          <button id="btnUser" className="user" type="button" hidden><i id="userDot" aria-hidden="true"></i><span id="userName"></span></button>
        </div>
      </header>
      <div id="main">
        <aside id="rail">
          <div className="gp"><p className="grp">Tools</p>
            <div className="set" id="setT"></div></div>
          <div className="gp" id="gpParts"><p className="grp">Parts</p>
            <div className="cats" id="cats" role="tablist" aria-label="Part families"></div>
            <div className="set" id="setP" role="tabpanel"></div></div>
        </aside>
        <div id="stage">
          <canvas id="cv"></canvas>
          <input id="ren" hidden maxLength={8} spellCheck="false" aria-label="Rename part" />
          <div id="steps" role="status" aria-live="polite" hidden></div>
          <div id="toast" role="status" aria-live="polite"></div>
          <QuantumPanel />
          <div id="zoom" role="group" aria-label="Zoom">
            <button type="button" id="zOut" title="Zoom out (-)" aria-label="Zoom out">−</button>
            <button type="button" id="zPct" title="Back to the normal size (0)">100%</button>
            <button type="button" id="zIn" title="Zoom in (+)" aria-label="Zoom in">+</button>
            <button type="button" id="zFit" title="Fit the whole circuit on the screen">Fit</button>
          </div>
          <div id="pick" hidden role="toolbar" aria-label="Picked area">
            <span id="pickWhat"></span>
            <button type="button" data-a="save" title="Turn this circuit into a black chip: its switches become the inputs, its lamps the outputs. It goes on the Electronics tab, to drag out whenever you like">Save as chip</button>
            <button type="button" data-a="copy" title="Copy the boxed-in area (Ctrl+C)">Copy</button>
            <button type="button" data-a="cut" title="Cut the boxed-in area (Ctrl+X)">Cut</button>
            <button type="button" data-a="dup" title="Drop a copy beside it">Duplicate</button>
            <button type="button" data-a="del" title="Delete the boxed-in area (Del)">Delete</button>
            <button type="button" data-a="off" className="x" title="Let the area go (Esc)" aria-label="Let the area go">✕</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(Bench);
