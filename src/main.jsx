import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { ask } from "./bench/state.js";
import { Auth } from "./bench/auth.js";
import { keepBuild } from "./bench/builds.js";
import "./styles/fonts.css";
import "./styles/base.css";
import "./styles/desktop.css";
import "./styles/tablet.css";
import "./styles/quantum.css";

createRoot(document.getElementById("root")).render(<App />);

/* Offline: once the bench has been opened from the web, the service worker keeps
   a copy of every file on the device. The one-file build needs none of that.
   The worker always prefers the network, so a deploy shows on the next load; and
   a page that is already open is asked to reload as soon as a new version is in. */
if (!__SINGLE_FILE__ && import.meta.env.PROD && "serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
  const sw = navigator.serviceWorker;
  let reloading = false;
  const reload = () => {
    if (reloading) return;
    reloading = true;
    keepBuild();
    /* the sheet and any unsent builds are written a moment after a change: give them that moment */
    Auth.flush(true).catch(() => {}).then(() => setTimeout(() => location.reload(), 700));
  };
  const hadWorker = !!sw.controller;
  sw.addEventListener("controllerchange", () => {
    if (!hadWorker) return;               /* the very first install is not an update */
    if (document.visibilityState === "hidden") { reload(); return; }
    ask({ title: "New version ready", ok: "Reload now",
      msg: "Logic Bench has been updated. Reload to switch to the new version — your sheet and builds are kept.",
      done: reload });
  });
  window.addEventListener("load", () => {
    sw.register("/sw.js").then((reg) => {
      const check = () => { if (document.visibilityState === "visible") reg.update().catch(() => {}); };
      document.addEventListener("visibilitychange", check);
      setInterval(check, 10 * 60 * 1000);
    }).catch(() => {});
  });
}
