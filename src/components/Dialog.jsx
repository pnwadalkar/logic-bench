import { useEffect, useRef, useState } from "react";
import { S, notify } from "../bench/state.js";

/* The one small dialog the bench asks its questions with (ask() in state.js): a
   name to save or rename under, or a yes before a delete. With a value there is
   a text box; check() can refuse what was typed, and the dialog stays open. */
export default function Dialog({ ask }) {
  const hasInput = ask.value !== undefined;
  const [value, setValue] = useState(ask.value || "");
  const [err, setErr] = useState("");
  const input = useRef(null), ok = useRef(null);
  useEffect(() => {
    if (hasInput) { input.current.focus(); input.current.select(); } else ok.current.focus();
  }, [hasInput]);
  const close = () => { if (S.dialog === ask) { S.dialog = null; notify(); } };
  const submit = (e) => {
    e.preventDefault();
    const v = hasInput ? value.trim().slice(0, 40) : null;
    const problem = ask.check ? ask.check(v) : "";
    if (problem) { setErr(problem); return; }
    close();
    if (ask.done) ask.done(v);
  };
  return (
    <div id="dlg" role="dialog" aria-modal="true" aria-labelledby="dlgT"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      /* the dialog keeps its keys to itself, so typing a name never drives the sheet */
      onKeyDown={(e) => { if (e.key === "Escape") close(); e.stopPropagation(); }}>
      <form id="dlgBox" autoComplete="off" onSubmit={submit}>
        <p id="dlgT">{ask.title}</p>
        <p id="dlgM">{ask.msg || ""}</p>
        {hasInput && (
          <input id="dlgIn" ref={input} spellCheck="false" aria-labelledby="dlgT"
            value={value} onChange={(e) => setValue(e.target.value)} />
        )}
        <p id="dlgErr" role="alert">{err}</p>
        <div className="dlgAct">
          <button type="button" id="dlgNo" onClick={close}>Cancel</button>
          <button type="submit" id="dlgOk" ref={ok} className={ask.danger ? "danger" : "key"}>{ask.ok || "OK"}</button>
        </div>
      </form>
    </div>
  );
}
