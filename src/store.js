/* What the circuit engine tells the React shell: which kind of build is open, what
   the quantum simulator found, and whether the "classical or quantum?" question
   is on screen. The engine writes through HOST; components read with useStore. */
import { useSyncExternalStore } from "react";

let state = { kind: "classical", quantum: null, chooser: null };
const subs = new Set();

export const store = {
  get: () => state,
  set(patch) {
    state = { ...state, ...patch };
    subs.forEach((fn) => fn());
  },
  subscribe(fn) {
    subs.add(fn);
    return () => subs.delete(fn);
  }
};

export function useStore(pick) {
  return useSyncExternalStore(store.subscribe, () => pick(state));
}

/* handed to the engine as HOST */
export const host = {
  kind(k) { if (k !== state.kind) store.set({ kind: k }); },
  quantum(result) { store.set({ quantum: result }); },
  /* ask which kind of build to start; done(kind) runs only if one is picked */
  chooseKind(done) { store.set({ chooser: { done } }); }
};
