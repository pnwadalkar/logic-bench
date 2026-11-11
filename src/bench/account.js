/* Who is signed in: asking for the sign-in screen, and signing out. The Login
   component is the screen itself. */
import { S, ask, flash, notify } from "./state.js";
import { Auth } from "./auth.js";
import { keepBuild, snapshot } from "./builds.js";
import { setTest } from "./cleaner.js";
import { Collab } from "./collab.js";
import { CURKEY } from "./core.js";

export var SYNC_TEXT = {saved:"builds saved to your account", pending:"saving soon", saving:"saving…",
  waiting:"not saved yet — no connection, it will retry", signedout:"signed out on the server — sign in again to save"};

/* Put the sign-in screen up; done() runs once someone has signed in or made an account. */
export function loginShow(done){
  S.login = {done:done};
  notify();
}
/* The sheet is kept first, then the page starts over at the login screen. */
export function signOut(){
  if (S.testMode) setTest(false);
  if (Collab.active()) Collab.stop();
  else {
    keepBuild();
    try { localStorage.setItem(CURKEY(), JSON.stringify({doc:snapshot(), dirty:S.docDirty})); Auth.changed(); } catch (err) {}
  }
  flash("Signing out…");
  Auth.logout().then(function(){ location.reload(); });
}
export function askSignOut(){
  var u = Auth.current();
  if (!u) return;
  var where = !Auth.cloud() ? "Your builds are kept on this device and are here when you sign in again."
    : Auth.syncState() === "waiting" ? "Some changes have not reached the server yet. They stay in this browser and are sent the next time you sign in here."
    : "Your builds are saved to your account and are there when you sign in again, on this or any device.";
  ask({title:"Sign out", ok:"Sign out", msg:"Signed in as “" + u.name + "”. " + where,
    done:signOut});
}
