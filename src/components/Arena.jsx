import { memo } from "react";

/* The Arena: challenges and rankings. The engine (arena.js) fills the body in. */
function Arena() {
  return (
    <div id="arena" hidden>
      <div className="wrap">
        <div className="homeTop">
          <h1>Logic <em>Arena</em></h1>
          <p>Playing as <b id="arenaWho"></b> · <span id="aRate"></span></p>
        </div>
        <div className="homeAct">
          <button id="aBack" className="key" type="button">Back</button>
          <button id="aTabC" className="tab on" type="button">Challenges</button>
          <button id="aTabR" className="tab" type="button">Rankings</button>
          <span className="spacer"></span>
          <button id="aExp" type="button" title="Download your entries as one file to hand to someone on another device">Share my entries</button>
          <button id="aImp" type="button" title="Bring in someone else's entries. Each one is run through the checker again">Import entries</button>
          <input id="aFile" type="file" accept=".json,application/json" hidden />
        </div>
        <div id="aBody"></div>
      </div>
    </div>
  );
}

export default memo(Arena);
