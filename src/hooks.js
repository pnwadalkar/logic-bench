import { useEffect, useSyncExternalStore } from "react";
import { getVersion, subscribe } from "./bench/state.js";

/* Draw this component again whenever the bench says something changed. The
   component then reads what it shows straight from S. */
export function useBench() {
  return useSyncExternalStore(subscribe, getVersion);
}

/* Keep the page exactly as tall as what can be seen. On a tablet the browser bar
   comes and goes mid-drag; the visual viewport is the one height that always
   tells the truth, and the page is scrolled back to the top whenever the browser
   tries to nudge it, so the console along the bottom is never left half off screen. */
export function useViewportHeight() {
  useEffect(() => {
    const vv = window.visualViewport, root = document.documentElement;
    const fit = () => {
      const h = vv ? vv.height : window.innerHeight;
      if (h > 0) root.style.setProperty("--app-h", Math.round(h) + "px");
      if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
    };
    const turned = () => setTimeout(fit, 250);
    fit();
    if (vv) { vv.addEventListener("resize", fit); vv.addEventListener("scroll", fit); }
    window.addEventListener("resize", fit);
    window.addEventListener("orientationchange", turned);
    window.addEventListener("scroll", fit, { passive: true });
    return () => {
      if (vv) { vv.removeEventListener("resize", fit); vv.removeEventListener("scroll", fit); }
      window.removeEventListener("resize", fit);
      window.removeEventListener("orientationchange", turned);
      window.removeEventListener("scroll", fit);
    };
  }, []);
}
