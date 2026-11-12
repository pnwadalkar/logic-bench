import { useEffect } from "react";
import { S } from "./bench/state.js";
import { start } from "./bench/boot.js";
import { goFull, isFull } from "./bench/fullscreen.js";
import { useBench, useViewportHeight } from "./hooks.js";
import Header from "./components/Header.jsx";
import Rail from "./components/Rail.jsx";
import Stage from "./components/Stage.jsx";
import Home from "./components/Home.jsx";
import Arena from "./components/Arena.jsx";
import Login from "./components/Login.jsx";
import Dialog from "./components/Dialog.jsx";
import KindChooser from "./components/KindChooser.jsx";
import Toast from "./components/Toast.jsx";

export default function App() {
  useBench();
  useViewportHeight();
  /* the sheet's canvas is on the page by now (Stage mounts first): sign in and open the last sheet */
  useEffect(() => { start(); }, []);
  /* A mouse wheel only turns up and down: over the header or the parts console, which
     slide sideways when the window is narrower than they are, it slides them instead. */
  useEffect(() => {
    const wheel = (e) => {
      if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const el = e.target.closest && e.target.closest("#rail, .bar");
      if (!el || el.scrollWidth <= el.clientWidth + 1) return;
      const left = el.scrollLeft, max = el.scrollWidth - el.clientWidth;
      if ((e.deltaY < 0 && left <= 0) || (e.deltaY > 0 && left >= max)) return;
      el.scrollLeft = left + e.deltaY;
      e.preventDefault();
    };
    document.addEventListener("wheel", wheel, { passive: false });
    return () => document.removeEventListener("wheel", wheel);
  }, []);
  /* the stylesheet hides what a quantum build has no use for */
  const kind = S.docKind;
  useEffect(() => { document.documentElement.setAttribute("data-kind", kind); }, [kind]);
  /* The bench wants the whole tablet, turned sideways, and full screen is what lets
     a page lock the orientation: the first touch asks for both. Only in the tablet
     layout — a touchscreen laptop keeps its window. */
  useEffect(() => {
    if (S.LAYOUT !== "tablet") return undefined;
    const first = (e) => {
      if (e.pointerType !== "touch") return;
      window.removeEventListener("pointerdown", first, true);
      if (!isFull() && !(e.target && e.target.id === "btnFull")) goFull();
    };
    window.addEventListener("pointerdown", first, true);
    return () => window.removeEventListener("pointerdown", first, true);
  }, []);

  const over = S.homeOpen || S.arenaOpen;
  return (
    <>
      <div id="app">
        <Header />
        <div id="main">
          <Rail />
          <Stage toast={!over} />
        </div>
      </div>
      {S.homeOpen && <Home />}
      {S.arenaOpen && <Arena />}
      {S.login && <Login />}
      {S.dialog && <Dialog key={S.dialog.n} ask={S.dialog} />}
      {S.chooser && <KindChooser />}
      {/* over the home page or the Arena the toast floats on the whole screen */}
      {over && <Toast float />}
    </>
  );
}
