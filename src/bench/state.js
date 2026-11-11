/* The bench's one store. S holds everything that changes: the sheet (parts, wires,
   pan, zoom), the tool in hand, and what is on screen (which page, the dialog,
   the toast). The modules beside this one fill in and change its fields; the React
   components read them, and draw again whenever notify() says something moved. */
export const S = {
  /* which page is up, and the small things over the sheet */
  homeOpen: false,      /* the home page, over the bench */
  arenaOpen: false,     /* the Arena, over both */
  login: null,          /* {done} while the sign-in screen is up */
  dialog: null,         /* the question being asked: see ask() */
  chooser: null,        /* {done} while "classical or quantum?" is up */
  toast: null,          /* {msg, n, at}: the last short message, n counting them, at when it was said */
  rename: null,         /* {id, left, top, value} while a part is being renamed */
  steps: null,          /* {at, names} while the Cleaner shows its passes */
  open: 0,              /* inputs left open on the sheet, from the last settle */
  colorsRev: 0,         /* counts changes of theme, so drawn icons know to redraw */
  shared: { list: [], loaded: false, error: "" },   /* the shared projects you are in */
  onFrame: null         /* called after each paint of the sheet (the bar over a picked area) */
};

const subs = new Set();
let version = 0, pending = false;

/* Tell React something changed. Any number of calls in one go make one redraw. */
export function notify() {
  if (pending) return;
  pending = true;
  queueMicrotask(function () {
    pending = false;
    version++;
    subs.forEach(function (fn) { fn(); });
  });
}
export function subscribe(fn) {
  subs.add(fn);
  return function () { subs.delete(fn); };
}
export function getVersion() { return version; }

/* A short confirmation over the sheet. */
export function flash(msg) {
  S.toast = { msg: msg, n: (S.toast ? S.toast.n : 0) + 1, at: Date.now() };
  notify();
}
/* One small dialog for the questions the bench needs answered: a name to save or
   rename under, or a yes before something is deleted.
   o = {title, msg, ok, danger, value, check, done}. With a value there is a text
   box; check(v) returns an error to show, with the dialog left open, or nothing,
   and then done(v) runs. */
let asked = 0;
export function ask(o) {
  S.dialog = Object.assign({}, o, { n: ++asked });
  notify();
}
/* Every new build starts with this question; done(kind) runs only if one is picked. */
export function chooseKind(done) {
  S.chooser = { done: done };
  notify();
}
