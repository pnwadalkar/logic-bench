import { memo } from "react";

/* The home page: every build as a card. The engine (home.js) fills the cards in. */
function Home() {
  return (
    <div id="home" hidden>
      <div className="wrap">
        <div className="homeTop">
          <h1>Logic <em>Bench</em></h1>
          <p>Signed in as <b id="homeWho"></b> · pick a build to work on.</p>
        </div>
        <div className="homeAct">
          <button id="hNew" className="key" type="button" title="Start a new build — classical or quantum">New build</button>
          <button id="hArena" type="button" title="Challenges, rankings and the checker">Arena</button>
          <button id="hEg" type="button">Half adder example</button>
          <button id="hEg2" type="button" title="A clock driving a counter, read out on a hex display">Counter example</button>
          <button id="hEgQ" type="button" title="A quantum build: a Hadamard and a CNOT entangle two qubits, so the meters only ever agree">Bell pair example</button>
          <button id="hSave" type="button" title="Download every build as one file, to keep safe or carry to another device">Back up all</button>
          <button id="hLoad" type="button" title="Bring builds back in from a backup file">Restore</button>
          <input id="hFile" type="file" accept=".json,application/json" hidden />
          <span className="spacer"></span>
          <button id="hBack" type="button" hidden>Back to the sheet</button>
        </div>
        <div id="shBox">
          <p className="sect">Shared projects · build one circuit together, live</p>
          <div className="homeAct">
            <button id="shNew" type="button" title="Start an empty sheet that others can join and build on with you">New shared project</button>
            <button id="shFrom" type="button" title="Turn the sheet you have open into a shared project">Share the sheet I'm on</button>
            <form id="shJoin" className="join" autoComplete="off">
              <input id="shCode" maxLength={8} spellCheck="false" autoCapitalize="characters" placeholder="Invite code" aria-label="Invite code" />
              <button type="submit">Join</button>
            </form>
          </div>
          <div id="shared"></div>
          <p id="shNote" className="note"></p>
        </div>
        <p className="sect">Your builds</p>
        <div id="cards"></div>
        <p id="homeNote"></p>
      </div>
    </div>
  );
}

export default memo(Home);
