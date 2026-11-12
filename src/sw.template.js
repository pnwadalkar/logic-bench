/* Keeps Logic Bench working with no connection, without ever holding on to an old
   version. The pages (and anything else that is not a hashed file) come from the
   network whenever there is one, and from the device copy only when there is not
   or the network is slow; the hashed files under /assets never change, so those
   are served from the device at once. A new deploy is therefore seen on the very
   next load, and the page is told when it has been replaced (see main.jsx).
   vite.config.mjs fills in the version and the file list at build time. */
"use strict";

var VERSION = "__VERSION__";
var FILES = __FILES__;
var SLOW = 4000;     /* ms to wait for the network before the device copy is used */

self.addEventListener("install", function(e){
  e.waitUntil(caches.open(VERSION).then(function(c){
    return Promise.all(FILES.map(function(f){
      return fetch(new Request(f, {cache:"reload"})).then(function(res){ if (res.ok) return c.put(f, res); });
    }));
  }).then(function(){ return self.skipWaiting(); }));
});

self.addEventListener("activate", function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){ return k !== VERSION; }).map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});

self.addEventListener("message", function(e){
  if (e.data === "skip") self.skipWaiting();
});

self.addEventListener("fetch", function(e){
  var req = e.request;
  var url = new URL(req.url);
  /* accounts and saved builds always come from the server, never from the cache */
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.indexOf("/api/") === 0) return;
  if (url.pathname.indexOf("/assets/") === 0) {
    e.respondWith(caches.open(VERSION).then(function(c){
      return c.match(req).then(function(hit){
        return hit || fetch(req).then(function(res){ if (res && res.ok) c.put(req, res.clone()); return res; });
      });
    }));
    return;
  }
  e.respondWith(caches.open(VERSION).then(function(c){
    var key = req.mode === "navigate" ? "./" : req;
    var later = function(){ return c.match(key, {ignoreSearch:true}); };
    return new Promise(function(resolve){
      var done = false;
      var timer = setTimeout(function(){
        later().then(function(hit){ if (hit && !done) { done = true; resolve(hit); } });
      }, SLOW);
      fetch(req, {cache:"no-cache"}).then(function(res){
        clearTimeout(timer);
        if (res && res.ok) {
          c.put(key, res.clone());
          if (!done) { done = true; resolve(res); }
        } else if (!done) {
          later().then(function(hit){ done = true; resolve(hit || res); });
        }
      }, function(){
        clearTimeout(timer);
        later().then(function(hit){ if (!done) { done = true; resolve(hit || Response.error()); } });
      });
    });
  }));
});
