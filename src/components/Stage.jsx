import { useEffect, useLayoutEffect, useRef } from "react";
import { S } from "../bench/state.js";
import { readColors } from "../bench/core.js";
import { draw, render, sizeCanvas } from "../bench/render.js";
import { attachInput, renameDone, zoomAt, zoomFit, zoomPct } from "../bench/input.js";
import { setCursor } from "../bench/cleaner.js";
import { pickAction, pickBarSpot } from "../bench/edit.js";
import { pickN, pickW } from "../bench/core.js";
import { useBench } from "../hooks.js";
import QuantumPanel from "./QuantumPanel.jsx";
import Toast from "./Toast.jsx";

/* The little box a part is renamed in, put over the part that was double-clicked. */
function RenameBox() {
  const r = S.rename;
  if (!r) return null;
  return (
    <input id="ren" key={r.id} maxLength={8} spellCheck="false" aria-label="Rename part"
      defaultValue={r.value} autoFocus style={{ left: r.left, top: r.top }}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={(e) => renameDone(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") renameDone(e.currentTarget.value);
        else if (e.key === "Escape") renameDone(null);
        e.stopPropagation();
      }} />
  );
}

/* The Cleaner's passes, the one running now lit. */
function Steps() {
  const s = S.steps;
  if (!s) return null;
  return (
    <div id="steps" className="show" role="status" aria-live="polite">
      <b>Cleaner · step {s.at} of {s.names.length}</b>
      <ol>
        {s.names.map((name, i) => {
          const k = i + 1;
          return <li key={k} className={k < s.at ? "done" : k === s.at ? "now" : ""}><i>{k < s.at ? "✓" : k}</i>{name}</li>;
        })}
      </ol>
    </div>
  );
}

function Zoom() {
  return (
    <div id="zoom" role="group" aria-label="Zoom">
      <button type="button" id="zOut" title="Zoom out (-)" aria-label="Zoom out" onClick={() => zoomAt(S.zoom / 1.25)}>−</button>
      <button type="button" id="zPct" title="Back to the normal size (0)" onClick={() => zoomAt(S.ZDEF)}>{zoomPct()}</button>
      <button type="button" id="zIn" title="Zoom in (+)" aria-label="Zoom in" onClick={() => zoomAt(S.zoom * 1.25)}>+</button>
      <button type="button" id="zFit" title="Fit the whole circuit on the screen" onClick={zoomFit}>Fit</button>
    </div>
  );
}

/* The bar that rides over a picked area. What it says is React's; where it sits
   follows the sheet frame by frame as the area is dragged or the view moves, so
   the sheet's painter places it (S.onFrame) rather than a render. */
function PickBar() {
  const ref = useRef(null);
  const place = () => {
    const el = ref.current;
    if (!el) return;
    const spot = pickBarSpot(el.offsetWidth, el.offsetHeight);
    el.style.visibility = spot ? "visible" : "hidden";
    if (spot) { el.style.left = spot.x + "px"; el.style.top = spot.y + "px"; }
  };
  useEffect(() => {
    S.onFrame = place;
    return () => { S.onFrame = null; };
  });
  useLayoutEffect(place);
  const np = pickN.size, nw = pickW.size;
  const act = (a) => () => pickAction(a);
  return (
    <div id="pick" ref={ref} role="toolbar" aria-label="Picked area">
      <span id="pickWhat">{np} part{np === 1 ? "" : "s"}{nw ? " · " + nw + " wire" + (nw === 1 ? "" : "s") : ""}</span>
      {S.docKind !== "quantum" && (
        <button type="button" onClick={act("save")} title="Turn this circuit into a black chip: its switches become the inputs, its lamps the outputs. It goes on the Electronics tab, to drag out whenever you like">Save as chip</button>
      )}
      <button type="button" onClick={act("copy")} title="Copy the boxed-in area (Ctrl+C)">Copy</button>
      <button type="button" onClick={act("cut")} title="Cut the boxed-in area (Ctrl+X)">Cut</button>
      <button type="button" onClick={act("dup")} title="Drop a copy beside it">Duplicate</button>
      <button type="button" onClick={act("del")} title="Delete the boxed-in area (Del)">Delete</button>
      <button type="button" onClick={act("off")} className="x" title="Let the area go (Esc)" aria-label="Let the area go">✕</button>
    </div>
  );
}

/* The sheet. The circuit is painted on one canvas by render.js — thousands of
   parts would be too many elements — and this component owns that canvas: it
   hands it to the bench, hangs the pointer and key listeners on it, and keeps
   it the right size and in the right colours. */
export default function Stage({ toast }) {
  useBench();
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    S.cv = cv; S.ctx = cv.getContext("2d");
    readColors(); sizeCanvas(); setCursor();
    const detach = attachInput(cv);
    const resized = () => { sizeCanvas(); render(); };
    const ro = window.ResizeObserver ? new ResizeObserver(resized) : null;
    if (ro) ro.observe(cv.parentNode); else window.addEventListener("resize", resized);
    /* follow the theme, the system's or one set on <html data-theme> */
    const themed = () => { readColors(); draw(); };
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    if (mq.addEventListener) mq.addEventListener("change", themed);
    const mo = new MutationObserver(themed);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    /* labels are drawn in the bench's own font: once it has loaded, draw again */
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
    draw();
    return () => {
      detach();
      if (ro) ro.disconnect(); else window.removeEventListener("resize", resized);
      if (mq.removeEventListener) mq.removeEventListener("change", themed);
      mo.disconnect();
      S.cv = null; S.ctx = null;
    };
  }, []);
  return (
    <div id="stage">
      <canvas id="cv" ref={ref}></canvas>
      <RenameBox />
      <Steps />
      {toast && <Toast />}
      <QuantumPanel />
      <Zoom />
      <PickBar />
    </div>
  );
}
