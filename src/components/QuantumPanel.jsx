import { useState } from "react";
import { useStore } from "../store.js";

function pct(p) {
  const v = p * 100;
  return (Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1)) + "%";
}

/* What the meters on a quantum sheet read, taken together: every outcome that can
   happen and how likely it is. Two qubits that are entangled show here as outcomes
   that only come in matching pairs, which no single meter can show. */
export default function QuantumPanel() {
  const kind = useStore((s) => s.kind);
  const q = useStore((s) => s.quantum);
  const [open, setOpen] = useState(true);
  if (kind !== "quantum" || !q) return null;
  return (
    <section id="qpanel" className={open ? "" : "shut"} aria-label="Measured outcomes">
      <button type="button" className="qhead" aria-expanded={open} onClick={() => setOpen(!open)}
        title={open ? "Fold this panel away" : "Show what the meters read"}>
        <b>Outcomes</b>
        <span>{q.n} qubit{q.n === 1 ? "" : "s"}{q.meters.length ? " · " + q.meters.length + " measured" : ""}</span>
        <i aria-hidden="true">{open ? "–" : "+"}</i>
      </button>
      {open && (
        <div className="qbody">
          {q.note && <p className="qnote">{q.note}</p>}
          {q.rows.length > 0 && (
            <>
              <p className="qorder" title="The order of the bits in each outcome: the meters, top to bottom">
                {q.meters.join(" ")}
              </p>
              <ul>
                {q.rows.map((r) => (
                  <li key={r.b}>
                    <code>|{r.b}⟩</code>
                    <span className="qbar"><span style={{ width: Math.max(1.5, r.p * 100) + "%" }}></span></span>
                    <em>{pct(r.p)}</em>
                  </li>
                ))}
              </ul>
              {q.more > 0 && <p className="qnote">…and {q.more} less likely outcome{q.more === 1 ? "" : "s"}.</p>}
            </>
          )}
        </div>
      )}
    </section>
  );
}
