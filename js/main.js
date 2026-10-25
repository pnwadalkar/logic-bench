/* Boot: size the sheet, follow the theme, and open the last sheet or the example. */
"use strict";

/* ---------- boot ---------- */
$("#tip").title = TIP_EDIT;
readColors();
sizeCanvas();
if (window.ResizeObserver){
  new ResizeObserver(function(){ sizeCanvas(); render(); }).observe($("#stage"));
} else {
  window.addEventListener("resize", function(){ sizeCanvas(); render(); });
}
var mq = window.matchMedia("(prefers-color-scheme: dark)");
if (mq.addEventListener) mq.addEventListener("change", function(){ readColors(); draw(); });
new MutationObserver(function(){ readColors(); draw(); })
  .observe(document.documentElement, {attributes:true, attributeFilter:["data-theme"]});

function boot(hot){
  var ok = false, cur = null;
  if (hot && hot.doc && load(hot.doc)){ docName = hot.doc.name || ""; docDirty = !!hot.dirty; ok = true; }
  if (!ok){
    try { cur = JSON.parse(localStorage.getItem(CURKEY) || "null"); } catch (err) { cur = null; }
    if (cur && cur.doc && load(cur.doc)){ docName = cur.doc.name || ""; docDirty = !!cur.dirty; ok = true; }
  }
  if (!ok) example();
  else {
    /* a sheet stored before builds had names still gets one */
    if (!docName) docName = suggestName();
    evaluate(); draw();
  }
  /* A session starts on the home page, with the sheet already standing behind
     it, so the first card and "Back to the sheet" are the same thing. A hot
     reload goes straight to the sheet instead, so the edit loop is unbroken. */
  if (hot && hot.doc) enterBench(); else homeShow();
}
if (window.claude && window.claude.hot && window.claude.hot.snapshot){
  window.claude.hot.snapshot(function(){ return {doc:snapshot(), dirty:docDirty}; });
}
if (window.claude && window.claude.hot && window.claude.hot.ready) window.claude.hot.ready(boot);
else boot((window.claude && window.claude.hot && window.claude.hot.data) || null);
