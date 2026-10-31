/* Accounts: who is at the bench. Ported from the games project (D:\games, js/core.js).
   They live in this browser only — there is no server — and a password is kept as a
   salted PBKDF2 hash. Each account has its own builds; the arena is shared by every
   account on the device. A username is a nickname, not proof of who someone is. */
"use strict";

var Auth = (function(){
  var USERS = "logicbench.users", SESSION = "logicbench.session", CLAIMED = "logicbench.claimed";
  var rawGet = function(k, d){
    try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (err) { return d; }
  };
  var rawSet = function(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (err) { return false; } };
  var hex = function(buf){
    return Array.prototype.map.call(new Uint8Array(buf), function(b){ return ("0" + b.toString(16)).slice(-2); }).join("");
  };
  var norm = function(n){ return String(n || "").trim().toLowerCase(); };

  function hashPw(pw, salt){
    var enc = new TextEncoder();
    if (window.crypto && crypto.subtle){
      return crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]).then(function(key){
        return crypto.subtle.deriveBits({name:"PBKDF2", salt:enc.encode(salt), iterations:150000, hash:"SHA-256"}, key, 256);
      }).then(function(bits){ return "p1:" + hex(bits); });
    }
    /* a plain-http page on a LAN address has no crypto.subtle: fall back to a simple mix */
    var h = 2166136261, str = salt + pw, r, i;
    for (r = 0; r < 2000; r++) for (i = 0; i < str.length; i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return Promise.resolve("f1:" + h.toString(16));
  }
  function newSalt(){
    var a = new Uint8Array(16), i;
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(a);
    else for (i = 0; i < 16; i++) a[i] = Math.random() * 256;
    return hex(a);
  }

  var me = {
    users:function(){ return rawGet(USERS, {}); },
    /* the signed-in account, or null */
    current:function(){
      var id = rawGet(SESSION, null), u = id && me.users()[id];
      return u ? {id:id, name:u.name, color:u.color, created:u.created} : null;
    },
    /* a storage key that belongs to the signed-in account */
    key:function(name){
      var u = me.current();
      return "logicbench.u." + (u ? u.id : "anon") + "." + name;
    },
    register:function(name, pw){
      name = String(name || "").trim();
      if (!/^[\w .-]{3,20}$/.test(name)) return Promise.reject(new Error("Username must be 3–20 letters, numbers, spaces, dots or dashes."));
      if (String(pw || "").length < 6) return Promise.reject(new Error("Password must be at least 6 characters."));
      var users = me.users(), id = norm(name), salt = newSalt();
      if (users[id]) return Promise.reject(new Error("That username is already taken on this device."));
      return hashPw(pw, salt).then(function(hash){
        var legacy;
        users[id] = {name:name, salt:salt, hash:hash, created:Date.now(), color:Math.floor(Math.random() * 360)};
        if (!rawSet(USERS, users)) throw new Error("Could not save the account. Is browser storage blocked?");
        /* builds made before there were accounts go to the first account created */
        try {
          legacy = [["lib", localStorage.getItem("logicbench.lib")], ["cur", localStorage.getItem("logicbench.cur")]];
          if (!localStorage.getItem(CLAIMED) && (legacy[0][1] || legacy[1][1])){
            legacy.forEach(function(p){ if (p[1]) localStorage.setItem("logicbench.u." + id + "." + p[0], p[1]); });
            localStorage.setItem(CLAIMED, id);
          }
        } catch (err) {}
        rawSet(SESSION, id);
        return me.current();
      });
    },
    login:function(name, pw){
      var id = norm(name), u = me.users()[id];
      if (!u) return Promise.reject(new Error("Wrong username or password."));
      return hashPw(pw, u.salt).then(function(hash){
        if (hash !== u.hash) throw new Error("Wrong username or password.");
        rawSet(SESSION, id);
        return me.current();
      });
    },
    logout:function(){ try { localStorage.removeItem(SESSION); } catch (err) {} }
  };
  return me;
})();
