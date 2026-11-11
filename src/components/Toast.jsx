import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { S } from "../bench/state.js";
import { useBench } from "../hooks.js";

const STAY = 2600;   /* ms a message stays up */

/* A short confirmation: over the sheet, or — with float — over the whole screen,
   for when the home page or the Arena is in front. */
export default function Toast({ float }) {
  useBench();
  const t = S.toast;
  const [, tick] = useState(0);
  const left = t ? STAY - (Date.now() - t.at) : 0;
  useEffect(() => {
    if (left <= 0) return undefined;
    const id = setTimeout(() => tick((n) => n + 1), left + 20);
    return () => clearTimeout(id);
  }, [t && t.n]);   // eslint-disable-line react-hooks/exhaustive-deps
  const el = <div id="toast" className={left > 0 ? "show" : ""} role="status" aria-live="polite">{t ? t.msg : ""}</div>;
  return float ? createPortal(el, document.body) : el;
}
