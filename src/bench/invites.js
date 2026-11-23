/* Invitations: someone in a shared project names you, and a popup asks you.

   There is no push channel on the website's host, so while you are signed in
   this asks the server for waiting invitations every few seconds (and straight
   away when you come back to the tab). Taking one adds you to the project and
   opens it; turning it down just clears it. */
import { S, flash, notify } from "./state.js";
import { Auth } from "./auth.js";
import { keepBuild } from "./builds.js";
import { setTest } from "./cleaner.js";
import { Collab } from "./collab.js";
import { enterBench, loadShared } from "./home.js";

var timer = 0, busy = false, watching = false;
var answered = new Set();            /* ones just taken or declined, so a slow reply does not bring them back */

function same(a, b){
  var i;
  if (a.length !== b.length) return false;
  for (i = 0; i < a.length; i++) if (a[i].pid !== b[i].pid || a[i].at !== b[i].at) return false;
  return true;
}
function next(){
  clearTimeout(timer);
  timer = setTimeout(poll, document.visibilityState === "hidden" ? 30000 : 5000);
}
function poll(){
  var open;
  if (busy) return;
  if (!Auth.cloud() || !Auth.current()){
    if (S.invites.length){ S.invites = []; notify(); }
    next(); return;
  }
  busy = true;
  Collab.invites().then(function(list){
    busy = false;
    open = Collab.project();
    list = list.filter(function(v){ return !answered.has(v.pid + ":" + v.at) && !(open && open.id === v.pid); });
    if (!same(list, S.invites)){ S.invites = list; notify(); }
    next();
  }, function(){ busy = false; next(); });
}
export function watchInvites(){
  if (watching) return;
  watching = true;
  document.addEventListener("visibilitychange", function(){ if (document.visibilityState === "visible") poll(); });
  window.addEventListener("focus", poll);
  poll();
}

function gone(inv){
  answered.add(inv.pid + ":" + inv.at);
  S.invites = S.invites.filter(function(v){ return v.pid !== inv.pid; });
  notify();
}
/* "Join": become a member and open the project. */
export function acceptInvite(inv){
  gone(inv);
  if (S.testMode) setTest(false);
  keepBuild();
  flash("Joining “" + inv.project + "”…");
  Collab.accept(inv.pid).then(function(p){ enterBench(); loadShared(); flash("Joined “" + p.name + "” · you can build on it together now"); },
    function(e){ flash(e.message); poll(); });
}
export function declineInvite(inv){
  gone(inv);
  Collab.decline(inv.pid).then(function(){}, function(e){ flash(e.message); });
}
/* The inviting side: ask someone by username. Settles with who was asked. */
export function sendInvite(project, name){
  return Collab.invite(project.id, name);
}
