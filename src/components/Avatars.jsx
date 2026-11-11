import { Collab } from "../bench/collab.js";

/* A row of round initials, one per person, with "+3" for the ones that do not fit. */
export default function Avatars({ people, max = 6 }) {
  return (
    <span className="ppl">
      {people.slice(0, max).map((p, i) => (
        <i key={i} style={{ background: Collab.hue(p.color) }} title={p.name + (p.note || "")}>
          {String(p.name || "?").charAt(0).toUpperCase()}
        </i>
      ))}
      {people.length > max && <i className="more">+{people.length - max}</i>}
    </span>
  );
}
