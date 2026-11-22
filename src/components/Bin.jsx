import { S, flash } from "../bench/state.js";
import { removeSel } from "../bench/edit.js";
import { picked } from "../bench/sim.js";
import { useBench } from "../hooks.js";

/* The industrial dustbin, fixed in the bottom-right corner of the screen. Carry a
   part, a boxed-in region or a loose wire end over it and let go, and it is deleted —
   input.js watches the pointer and keeps S.binHot; this only shows it. The lid lifts a
   little while anything is being carried, and flips right open with a red glow when
   the pointer is over it. Clicking it deletes whatever is picked, for the keyboard. */
export default function Bin() {
  useBench();
  const carrying = !S.testMode && !!((S.drag && !S.drag.lock && S.drag.moved) || S.wend);
  const hot = carrying && S.binHot;
  const cls = "bin" + (S.testMode ? " lock" : "") + (carrying ? " armed" : "") + (hot ? " hot" : "");
  const act = () => {
    if (S.testMode) { flash("The sheet is locked in Test mode — press T to edit it"); return; }
    if (picked()) removeSel(); else flash("Drag a part onto the bin to delete it");
  };
  return (
    <div id="bin" className={cls} role="button" tabIndex={0}
      aria-label="Dustbin: drag parts onto it to delete them, or click it to delete what is picked"
      title="Dustbin — drag a part, or a boxed-in region, onto it to delete it. Click it to delete what is picked."
      onClick={act}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); act(); } }}>
      <svg viewBox="0 0 80 96" aria-hidden="true" focusable="false">
        <defs>
          <pattern id="binHaz" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="9" height="9" fill="#f0b90b" />
            <rect width="4.5" height="9" fill="#1c2227" />
          </pattern>
        </defs>
        <ellipse cx="40" cy="91" rx="31" ry="3.2" className="binShadow" />
        {/* the wheels */}
        <circle cx="21" cy="87" r="5" className="binWheel" />
        <circle cx="59" cy="87" r="5" className="binWheel" />
        <circle cx="21" cy="87" r="1.6" className="binHub" />
        <circle cx="59" cy="87" r="1.6" className="binHub" />
        {/* the body: wider at the top, ribbed, with a hazard band across it */}
        <path d="M9 31 H71 L65 83 H15 Z" className="binBody" />
        <path d="M24 33 L25.5 82 M40 33 V82 M56 33 L54.5 82" className="binRib" />
        <path d="M11.6 53 H68.4 L67.4 63 H12.6 Z" fill="url(#binHaz)" className="binBand" />
        <rect x="31" y="68" width="18" height="8" rx="1.5" className="binPlate" />
        <path d="M34.5 72 H45.5" className="binPlateLine" />
        {/* the lid, hinged at its left end */}
        <g className="binLid">
          <path d="M5 21 H75 Q77 21 77 23.5 V30 H3 V23.5 Q3 21 5 21 Z" className="binLidTop" />
          <rect x="30" y="24" width="20" height="3.2" rx="1.6" className="binHandle" />
        </g>
      </svg>
      <span className="binLabel">{hot ? "Let go" : carrying ? "Drop here" : "Bin"}</span>
    </div>
  );
}
