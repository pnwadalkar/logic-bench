import { useEffect, useRef } from "react";
import { S } from "../bench/state.js";
import { TYPES } from "../bench/core.js";
import { cleanIcon, cursorIcon, pasteIcon, pointIcon, railIcon, regionIcon, wireIcon } from "../bench/icons.js";
import { cleanUp, setRegionMode, setSelectMode, setWireMode } from "../bench/cleaner.js";
import { areaKey, areaNames, areaScope, askDeleteArea, setAreaScope, setCat, setPasteMode, spawnArea, spawnPart } from "../bench/edit.js";
import { useBench } from "../hooks.js";

/* The picture on a tile: drawn on a canvas by the bench's own part drawings, and
   drawn again when the theme changes the colours. */
function Icon({ draw, what, colors }) {
  const ref = useRef(null);
  useEffect(() => { draw(ref.current); }, [what, colors]);   // eslint-disable-line react-hooks/exhaustive-deps
  return <canvas ref={ref} style={{ width: 50, height: 34 }} />;
}

/* A mouse takes a tile at once. A finger could be after either of two things: to
   slide the console sideways (its tiles run past the screen edge) or to pull a part
   off it. So a touch waits to see which way the finger goes: up or down, it takes the
   part; sideways, the browser scrolls the console and the tile is left alone; no move
   at all is a tap. */
function press(e, onDown) {
  if (e.pointerType !== "touch") { onDown(e); return; }
  const x0 = e.clientX, y0 = e.clientY, id = e.pointerId;
  const done = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", done);
  };
  const move = (m) => {
    if (m.pointerId !== id) return;
    const dx = m.clientX - x0, dy = m.clientY - y0;
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
    done();
    if (Math.abs(dy) > Math.abs(dx)) onDown(m);
  };
  const up = (u) => { if (u.pointerId !== id) return; done(); onDown(u); };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", done);
}

/* One tile of the console. It answers the press, not the click: a part is taken
   hold of the moment it is touched and rides out onto the sheet under the pointer. */
function Tile({ t, label, tip, draw, what, on, off, onDown, children }) {
  return (
    <div className={"part" + (on ? " on" : "") + (off ? " off" : "")} data-t={t} title={tip || label}
      onPointerDown={(e) => { e.preventDefault(); press(e, onDown); }}>
      <Icon draw={draw} what={what || t} colors={S.colorsRev} />
      <span>{label}</span>
      {children}
    </div>
  );
}

/* The chips you saved, oldest first — each a small black chip with its name on it. */
function Shelf() {
  const names = areaNames();
  if (!names.length) {
    return <p className="empty">Empty. Box in a circuit with Region, then press Save on the bar over it — it becomes a black chip here, its switches the inputs and its lamps the outputs.</p>;
  }
  return names.map((name) => {
    const key = areaKey(name);
    if (!key) return null;
    const scope = areaScope(name);
    const scopeTip = scope === "project"
      ? "Kept with this build only — click to put it on your account's shelf instead, for every project"
      : "On your account's shelf — every project can use it — click to keep it with this build only";
    return (
      <Tile key={name} t="AREA" label={name} what={key} tip={TYPES[key].tip + " — drag it onto the sheet"}
        draw={(c) => railIcon(c, key)} onDown={(e) => spawnArea(name, e)}>
        <button type="button" className={"scope" + (scope === "project" ? " on" : "")} title={scopeTip}
          aria-label={(scope === "project" ? "This build only: " : "Every project: ") + name}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); setAreaScope(name, scope === "project" ? "global" : "project"); }}>
          {scope === "project" ? "1" : "∀"}
        </button>
        <button type="button" className="x" title={"Delete “" + name + "”"} aria-label={"Delete the saved chip " + name}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); askDeleteArea(name); }}>✕</button>
      </Tile>
    );
  });
}

/* The parts console: the tools, then the parts of the kind of build that is open,
   a tab per family so it stays short enough to take in at a glance. */
export default function Rail() {
  useBench();
  const quantum = S.docKind === "quantum", test = S.testMode;
  const cats = S.CATS, at = S.railCat >= 0 && S.railCat < cats.length ? S.railCat : 0, cat = cats[at];
  const plain = !S.wireMode && !S.regionMode && !S.pasteMode;
  return (
    <aside id="rail" className={test ? "lock" : ""}>
      <div className="gp"><p className="grp">Tools</p>
        <div className="set" id="setT">
          <Tile t="SELECT" label="Cursor" draw={cursorIcon} on={plain} onDown={setSelectMode}
            tip="Click a part to pick it up, drag the bare sheet to move the sheet — a circuit can run well past the edge of the window" />
          <Tile t="WIRE" label="Wire" draw={wireIcon} on={S.wireMode}
            tip="Join two ports with a wire (W): click one port, then the other"
            onDown={() => { if (!test) setWireMode(!S.wireMode); }} />
          {!quantum && <Tile t="POINT" label="Point" draw={pointIcon} onDown={(e) => spawnPart("POINT", e)}
            tip="A junction: one wire in, any number on — the way a branch or a right-angle turn is made" />}
          {/* a mode, so a finger can box in a region too — a finger otherwise pans */}
          <Tile t="REGION" label="Region" draw={regionIcon} on={S.regionMode}
            tip="Drag a box round part of the circuit to pick it up (R), then Ctrl+C and Ctrl+V — Shift and drag does this without leaving the cursor"
            onDown={() => { if (!test) setRegionMode(!S.regionMode); }} />
          {/* Copy and cut are on the bar that rides over the picked area; Paste is a
              tool, because a copy has to be put somewhere and the pointer says where. */}
          <Tile t="PASTE" label="Paste" draw={pasteIcon} on={S.pasteMode} off={!S.clip}
            tip="Put the copied area down where you click (P) — Ctrl+V drops it under the pointer instead"
            onDown={() => { if (!test) setPasteMode(!S.pasteMode); }} />
          {!quantum && <Tile t="CLEAN" label="Cleaner" draw={cleanIcon} onDown={() => cleanUp()}
            tip="Cleaner looks: lay the circuit out in columns, keep the inputs in the order you drew them, gather the lamps in one column down the right-hand edge, straighten every wire, square the corners and squeeze out the dead space (C)" />}
        </div>
      </div>
      <div className="gp" id="gpParts"><p className="grp">Parts</p>
        <div className="cats" id="cats" role="tablist" aria-label="Part families">
          {cats.map((g, i) => (
            <button key={g.n} type="button" role="tab" className={"cat" + (i === at ? " on" : "")}
              aria-selected={i === at} onClick={() => setCat(i)}>{g.n}</button>
          ))}
        </div>
        <div className="set" id="setP" role="tabpanel">
          {cat.u ? <Shelf /> : cat.t.map((t) => (
            <Tile key={t} t={t} label={TYPES[t].n} tip={TYPES[t].tip} draw={(c) => railIcon(c, t)}
              onDown={(e) => spawnPart(t, e)} />
          ))}
        </div>
      </div>
    </aside>
  );
}
