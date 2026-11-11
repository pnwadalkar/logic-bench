import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles/fonts.css";
import "./styles/base.css";
import "./styles/desktop.css";
import "./styles/tablet.css";
import "./styles/quantum.css";

createRoot(document.getElementById("root")).render(<App />);

/* Offline: once the bench has been opened from the web, the service worker keeps
   a copy of every file on the device. The one-file build needs none of that. */
if (!__SINGLE_FILE__ && import.meta.env.PROD && "serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
