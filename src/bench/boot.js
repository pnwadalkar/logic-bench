/* Boot: sign in, and open the last sheet. App.jsx calls start() once the page —
   and with it the sheet's canvas — is on screen. */
import { S, chooseKind, flash, notify } from "./state.js";
import { loginShow } from "./account.js";
import { installApi } from "./api.js";
import { Auth } from "./auth.js";
import { example, libRead, load, suggestName } from "./builds.js";
import { Collab } from "./collab.js";
import { CURKEY, setKind } from "./core.js";
import { enterBench, homeShow, newSheet, onCrewChange } from "./home.js";
import { draw } from "./render.js";
import { evaluate } from "./sim.js";
import { startClock } from "./timing.js";

function boot(){
  var ok = false, cur = null;
  /* nothing opens until someone is signed in; the login screen calls boot again */
  if (!Auth.current()){ loginShow(boot); return; }
  notify();
  try { cur = JSON.parse(localStorage.getItem(CURKEY()) || "null"); } catch (err) { cur = null; }
  if (cur && cur.doc && load(cur.doc)){ S.docName = cur.doc.name || ""; S.docDirty = !!cur.dirty; ok = true; }
  if (!ok && !Object.keys(libRead()).length){
    /* a new account has nothing yet: straight onto a bare sheet, ready to build */
    newSheet("classical"); enterBench();
    flash("Welcome, " + Auth.current().name + " · drag a part in from the console below");
    /* the first build starts with the same question every new build does */
    chooseKind(function(kind){
      if (kind === "quantum"){ newSheet(kind); flash("New quantum sheet · drag a qubit in from the console below"); }
    });
    sharedOnBoot();
    return;
  }
  if (!ok) example();
  else {
    /* a sheet stored before builds had names still gets one */
    if (!S.docName) S.docName = suggestName();
    evaluate(); draw();
  }
  /* A session starts on the home page, with the sheet already standing behind
     it, so the first card and "Back to the sheet" are the same thing. */
  homeShow();
  sharedOnBoot();
}
/* An invite link (?join=CODE) joins straight in; otherwise a shared project that
   was open when the page was last left opens again. */
function sharedOnBoot(){
  var code = null, last = null;
  if (!Auth.cloud()) return;
  try { code = new URLSearchParams(location.search).get("join"); } catch (err) {}
  try { last = localStorage.getItem(Auth.key("project")); } catch (err) {}
  if (code){
    try { history.replaceState(null, "", location.pathname); } catch (err) {}
    Collab.join(code).then(function(p){ enterBench(); flash("Joined “" + p.name + "” · you can build on it together now"); },
      function(e){ flash(e.message); });
  } else if (last){
    Collab.open(last).then(function(){ enterBench(); }, function(){
      try { localStorage.removeItem(Auth.key("project")); } catch (err) {}
    });
  }
}
var started = false;
export function start(){
  if (started) return;
  started = true;
  setKind("classical");
  startClock();
  installApi();
  Collab.onChange(onCrewChange);
  /* builds merged in from another device, and the state of saving, show up straight away */
  Auth.onMerged(notify);
  Auth.onSync(notify);
  Auth.init().then(boot);
}
