/* Keeps Logic Bench working with no connection. Every file is served from the
   cache straight away and refreshed from the network behind it, so a deploy
   reaches the device on the next visit. Bump VERSION when files are added or removed. */
"use strict";

var VERSION = "logic-bench-v3";
var FILES = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "assets/icon.svg",
  "assets/fonts/ibm-plex-mono-400.woff2",
  "assets/fonts/ibm-plex-mono-500.woff2",
  "assets/fonts/ibm-plex-mono-600.woff2",
  "assets/fonts/ibm-plex-sans.woff2",
  "css/fonts.css",
  "css/base.css",
  "css/desktop.css",
  "css/tablet.css",
  "js/layout.js",
  "js/auth.js",
  "js/core.js",
  "js/shapes.js",
  "js/symbols.js",
  "js/sim.js",
  "js/render.js",
  "js/edit.js",
  "js/cleaner.js",
  "js/input.js",
  "js/rail.js",
  "js/builds.js",
  "js/timing.js",
  "js/api.js",
  "js/home.js",
  "js/login.js",
  "js/checker.js",
  "js/arena.js",
  "js/fullscreen.js",
  "js/main.js",
  "js/offline.js"
];

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
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
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
