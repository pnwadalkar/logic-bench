/* Keeps Logic Bench working with no connection. Every file of the build is kept
   on the device, served from there straight away and refreshed from the network
   behind it, so a deploy reaches the device on the next visit.
   vite.config.mjs fills in the version and the file list at build time. */
"use strict";

var VERSION = "__VERSION__";
var FILES = __FILES__;

self.addEventListener("install", function(e){
  e.waitUntil(caches.open(VERSION).then(function(c){ return c.addAll(FILES); }).then(function(){ return self.skipWaiting(); }));
});

self.addEventListener("activate", function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){ return k !== VERSION; }).map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});

self.addEventListener("fetch", function(e){
  var req = e.request;
  var url = new URL(req.url);
  /* accounts and saved builds always come from the server, never from the cache */
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.indexOf("/api/") === 0) return;
  e.respondWith(caches.open(VERSION).then(function(c){
    return c.match(req, {ignoreSearch:true}).then(function(hit){
      var net = fetch(req).then(function(res){
        if (res && res.ok) c.put(req, res.clone());
        return res;
      }).catch(function(){ return hit; });
      return hit || net;
    });
  }));
});
