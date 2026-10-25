/* Full screen, turned sideways — asked for by the first touch on a tablet. */
"use strict";

/* ---------- full screen, sideways ---------- */
/* The bench wants the whole tablet, turned sideways. Full screen is what lets a
   page lock the orientation, so the two go together - and the first touch asks
   for both, so the bench turns sideways by itself. */
function isFull(){ return !!(document.fullscreenElement || document.webkitFullscreenElement); }
function goFull(){
  var el = document.documentElement, req = el.requestFullscreen || el.webkitRequestFullscreen, p;
  var lock = function(){
    if (screen.orientation && screen.orientation.lock) screen.orientation.lock("landscape").catch(function(){});
  };
  if (!req) return;
  try {
    p = req.call(el, {navigationUI:"hide"});
    if (p && p.then) p.then(lock).catch(function(){}); else lock();
  } catch (err) {}
}
function leaveFull(){
  var ex = document.exitFullscreen || document.webkitExitFullscreen, p;
  if (!ex) return;
  try { p = ex.call(document); if (p && p.catch) p.catch(function(){}); } catch (err) {}
}
function fullLabel(){ $("#btnFull").textContent = isFull() ? "Exit full" : "Full screen"; }
$("#btnFull").hidden = !(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
$("#btnFull").addEventListener("click", function(){ if (isFull()) leaveFull(); else goFull(); });
document.addEventListener("fullscreenchange", fullLabel);
document.addEventListener("webkitfullscreenchange", fullLabel);
/* only in the tablet layout - a touchscreen laptop keeps its window */
var autoFull = LAYOUT === "tablet";
window.addEventListener("pointerdown", function(e){
  if (!autoFull || e.pointerType !== "touch") return;
  autoFull = false;
  if (!isFull() && e.target !== $("#btnFull")) goFull();
}, true);
