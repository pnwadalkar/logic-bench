/* Offline: once the bench has been opened from the web, sw.js keeps a copy of
   every file on the device, so it opens again with no connection - and can be
   installed to the home screen. Opened straight from a file, there is nothing to do. */
"use strict";

if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
  window.addEventListener("load", function(){
    navigator.serviceWorker.register("sw.js").catch(function(){});
  });
}
