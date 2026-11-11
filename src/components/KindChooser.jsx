import { useEffect, useRef } from "react";
import { store, useStore } from "../store.js";

const KINDS = [
  {
    id: "classical",
    name: "Classical",
    line: "Bits are 0 or 1.",
    parts: "Switches, logic gates, adders, chips, memory and lamps — up to the parts of a CPU.",
    art: (
      <svg viewBox="0 0 120 64" aria-hidden="true">
        <path className="w" d="M8 22h30M8 42h30M82 32h30" />
        <path className="b" d="M38 12h22a20 20 0 0 1 0 40H38z" />
        <circle className="hot" cx="112" cy="32" r="5" />
      </svg>
    )
  },
  {
    id: "quantum",
    name: "Quantum",
    line: "Qubits can be 0 and 1 at once.",
    parts: "Qubits, Hadamard and Pauli gates, CNOT, Toffoli and meters, with a live read-out of the outcomes.",
    art: (
      <svg viewBox="0 0 120 64" aria-hidden="true">
        <path className="w" d="M8 20h104M8 46h104" />
        <rect className="b" x="26" y="8" width="24" height="24" rx="4" />
        <text x="38" y="25" textAnchor="middle">H</text>
        <path className="l" d="M78 20v26" />
        <circle className="dot" cx="78" cy="20" r="4" />
        <circle className="b" cx="78" cy="46" r="8" />
        <path className="l" d="M70 46h16M78 38v16" />
      </svg>
    )
  }
];

/* Every new build starts here: classical or quantum? The parts console then
   offers the parts of that kind. Closing it without picking starts nothing. */
export default function KindChooser() {
  const chooser = useStore((s) => s.chooser);
  const first = useRef(null);
  useEffect(() => { if (chooser && first.current) first.current.focus(); }, [chooser]);
  if (!chooser) return null;
  const close = () => store.set({ chooser: null });
  const pick = (kind) => { close(); chooser.done(kind); };
  return (
    <div id="kindDlg" role="dialog" aria-modal="true" aria-labelledby="kindT"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      onKeyDown={(e) => { if (e.key === "Escape") close(); e.stopPropagation(); }}>
      <div className="kindBox">
        <p id="kindT">New build</p>
        <p className="kindM">Is this a classical project or a quantum project? You get the parts for the one you pick.</p>
        <div className="kinds">
          {KINDS.map((k, i) => (
            <button key={k.id} type="button" className={"kindCard " + k.id} ref={i === 0 ? first : null}
              onClick={() => pick(k.id)}>
              {k.art}
              <b>{k.name}</b>
              <span className="kindLine">{k.line}</span>
              <span className="kindParts">{k.parts}</span>
            </button>
          ))}
        </div>
        <div className="dlgAct"><button type="button" onClick={close}>Cancel</button></div>
      </div>
    </div>
  );
}
