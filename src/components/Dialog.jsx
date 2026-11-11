import { memo } from "react";

/* The one small dialog the engine asks its questions with: a name to save under,
   or a yes before a delete (see ask() in builds.js). */
function Dialog() {
  return (
    <div id="dlg" hidden role="dialog" aria-modal="true" aria-labelledby="dlgT">
      <form id="dlgBox" autoComplete="off">
        <p id="dlgT"></p>
        <p id="dlgM"></p>
        <input id="dlgIn" maxLength={40} spellCheck="false" aria-labelledby="dlgT" />
        <p id="dlgErr" role="alert"></p>
        <div className="dlgAct"><button type="button" id="dlgNo">Cancel</button><button type="submit" id="dlgOk" className="key">OK</button></div>
      </form>
    </div>
  );
}

export default memo(Dialog);
