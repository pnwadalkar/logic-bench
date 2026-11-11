/* Which layout the bench opens in, decided before the page paints.
   Both layouts dock the parts console along the bottom; a laptop or desktop is
   sized for a mouse, a tablet or phone gets the bigger touch layout.
   ?layout=desktop or ?layout=tablet forces one and is remembered on this device;
   ?layout=auto goes back to deciding by itself. */
"use strict";

(function(){
  var KEY = "logicbench.layout", root = document.documentElement, want = null, pick;
  var mq = function(q){ return !!(window.matchMedia && window.matchMedia(q).matches); };
  try { want = new URLSearchParams(location.search).get("layout"); } catch (err) {}
  try {
    if (want === "desktop" || want === "tablet") localStorage.setItem(KEY, want);
    else if (want === "auto") localStorage.removeItem(KEY);
    want = localStorage.getItem(KEY);
  } catch (err) {}

  /* A finger as the main pointer is the surest sign of a tablet or phone: an
     Android tablet that asks for the desktop site still reports it, and a
     touchscreen laptop still has a mouse or trackpad as its main pointer. The
     user agent catches the rest, including an iPad that calls itself a Mac. */
  function touchDevice(){
    var ua = navigator.userAgent || "";
    if (navigator.userAgentData && navigator.userAgentData.mobile) return true;
    if (/Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(ua)) return true;
    if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return true;
    return mq("(pointer: coarse)") && !mq("(any-pointer: fine)");
  }

  pick = want === "desktop" || want === "tablet" ? want : (touchDevice() ? "tablet" : "desktop");
  root.setAttribute("data-layout", pick);
})();
