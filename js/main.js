/* Boot: size the sheet, follow the theme, sign in, and open the last sheet. */
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
  /* nothing opens until someone is signed in; the login screen calls boot again */
  if (!Auth.current()){ loginShow(function(){ boot(null); }); return; }
  userChip();
  if (hot && hot.doc && load(hot.doc)){ docName = hot.doc.name || ""; docDirty = !!hot.dirty; ok = true; }
  if (!ok){
    try { cur = JSON.parse(localStorage.getItem(CURKEY()) || "null"); } catch (err) { cur = null; }
    if (cur && cur.doc && load(cur.doc)){ docName = cur.doc.name || ""; docDirty = !!cur.dirty; ok = true; }
  }
  if (!ok && !Object.keys(libRead()).length){
    /* a new account has nothing yet: straight onto a bare sheet, ready to build */
    newSheet(); enterBench();
    flash("Welcome, " + Auth.current().name + " · drag a part in from the rail");
    sharedOnBoot();
    return;
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
if (window.claude && window.claude.hot && window.claude.hot.snapshot){
  window.claude.hot.snapshot(function(){ return {doc:snapshot(), dirty:docDirty}; });
}
/* builds merged in from another device show up on the home page straight away */
Auth.onMerged(function(){ if (!$("#home").hidden && typeof renderHome === "function") renderHome(); });
Auth.onSync(userChip);
function start(hot){ Auth.init().then(function(){ boot(hot); }); }
if (window.claude && window.claude.hot && window.claude.hot.ready) window.claude.hot.ready(start);
else start((window.claude && window.claude.hot && window.claude.hot.data) || null);
