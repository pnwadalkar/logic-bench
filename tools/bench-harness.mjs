/* What the headless tests stand on: a stub browser, and the bench's own modules
   (src/bench/*.js) imported as they are. Every export is then reachable by its
   bare name from the snippets the tests run, and reads live — a module that
   reassigns one of its exports is seen doing so. What changes as you build (the
   parts, the wires, the next id, the clipboard…) is on S, as in the app.
   Usage:  import { loadBench } from "./bench-harness.mjs";  const run = await loadBench(); */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/* a canvas context that takes any call and draws nothing */
const g2d = new Proxy({}, {
  get: (t, k) => (k === "measureText" ? () => ({ width: 0 }) : k === "createPattern" || k === "createLinearGradient" ? () => ({ addColorStop(){} }) : () => {}),
  set: () => true
});
function element() {
  return {
    textContent: "", style: {}, dataset: {}, children: [], hidden: false, clientWidth: 1000, clientHeight: 700,
    classList: { add(){}, remove(){}, toggle(){}, contains: () => false },
    appendChild(){}, removeChild(){}, setAttribute(){}, getAttribute: () => null, addEventListener(){}, removeEventListener(){},
    getContext: () => g2d, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 700 })
  };
}

export async function loadBench() {
  const els = {}, store = {};
  const stubs = {
    document: {
      documentElement: Object.assign(element(), { getAttribute: () => "desktop" }),
      querySelector: (s) => els[s] || (els[s] = element()), querySelectorAll: () => [], getElementById: (s) => els["#" + s] || (els["#" + s] = element()),
      createElement: element, addEventListener(){}, removeEventListener(){}, body: element()
    },
    window: globalThis,
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; }, key: (i) => Object.keys(store)[i] ?? null, get length() { return Object.keys(store).length; }
    },
    location: { protocol: "file:", search: "", pathname: "/", href: "file:///" },
    history: { replaceState(){} },
    requestAnimationFrame: () => 0, cancelAnimationFrame(){},
    getComputedStyle: () => ({ getPropertyValue: () => "#000" }),
    /* nothing waits: a save that would go out in 400 ms simply never does */
    setTimeout: () => 0, clearTimeout(){}, setInterval: () => 0, clearInterval(){},
    addEventListener(){}, removeEventListener(){}, devicePixelRatio: 1, innerWidth: 1000, innerHeight: 700
  };
  for (const [k, v] of Object.entries(stubs)) Object.defineProperty(globalThis, k, { value: v, writable: true, configurable: true });
  if (!globalThis.navigator) globalThis.navigator = { userAgent: "" };

  /* the modules carry no package.json of their own; Node tells they are modules by their syntax, and says so once */
  process.removeAllListeners("warning");
  const dir = path.join(root, "src", "bench");
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".js")).sort()) {
    const m = await import(pathToFileURL(path.join(dir, f)).href);
    for (const k of Object.keys(m)) Object.defineProperty(globalThis, k, { get: () => m[k], configurable: true });
  }
  return (code) => vm.runInThisContext(code);
}
