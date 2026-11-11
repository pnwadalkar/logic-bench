/* Full screen, turned sideways — asked for by the first touch on a tablet. */
/* ---------- full screen, sideways ---------- */
/* The bench wants the whole tablet, turned sideways. Full screen is what lets a
   page lock the orientation, so the two go together - and the first touch asks
   for both, so the bench turns sideways by itself. */
export function isFull(){ return !!(document.fullscreenElement || document.webkitFullscreenElement); }
export function goFull(){
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
export function leaveFull(){
  var ex = document.exitFullscreen || document.webkitExitFullscreen, p;
  if (!ex) return;
  try { p = ex.call(document); if (p && p.catch) p.catch(function(){}); } catch (err) {}
}
export function canFull(){
  var el = document.documentElement;
  return !!(el.requestFullscreen || el.webkitRequestFullscreen);
}
