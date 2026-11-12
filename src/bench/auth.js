/* Accounts: who is at the bench, and where their builds are kept.

   On the website (Vercel) accounts live on the server: /api/auth/* signs in with
   an HttpOnly cookie, and /api/state keeps each account's builds in a private
   Vercel Blob store, so they follow the account to any device. This browser keeps
   a working copy (localStorage) that is saved up to the server a moment after each
   change, and that still works with no connection until it can be sent.

   Opened as the single offline file (file://), or from a plain static server with
   no /api, there is no server to talk to: accounts then live in this browser only,
   with a salted PBKDF2 password hash, as before. */
export var Auth = (function(){
  var USERS = "logicbench.users", SESSION = "logicbench.session", CLAIMED = "logicbench.claimed";
  var CLOUD = "logicbench.cloud.user", SEEN = "logicbench.cloud.seen";
  var rawGet = function(k, d){
    try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (err) { return d; }
  };
  var rawSet = function(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (err) { return false; } };
  var rawDel = function(k){ try { localStorage.removeItem(k); } catch (err) {} };
  var hex = function(buf){
    return Array.prototype.map.call(new Uint8Array(buf), function(b){ return ("0" + b.toString(16)).slice(-2); }).join("");
  };
  var norm = function(n){ return String(n || "").trim().toLowerCase(); };
  var checkName = function(name){
    if (!/^[\w .-]{3,20}$/.test(name)) throw new Error("Username must be 3–20 letters, numbers, spaces, dots or dashes.");
  };

  /* ---------- this browser only ---------- */
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
  var local = {
    users:function(){ return rawGet(USERS, {}); },
    current:function(){
      var id = rawGet(SESSION, null), u = id && local.users()[id];
      return u ? {id:id, name:u.name, color:u.color, created:u.created} : null;
    },
    register:function(name, pw){
      var users = local.users(), id = norm(name), salt = newSalt();
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
        return local.current();
      });
    },
    login:function(name, pw){
      var id = norm(name), u = local.users()[id];
      if (!u) return Promise.reject(new Error("Wrong username or password."));
      return hashPw(pw, u.salt).then(function(hash){
        if (hash !== u.hash) throw new Error("Wrong username or password.");
        rawSet(SESSION, id);
        return local.current();
      });
    }
  };

  /* ---------- the server ---------- */
  var mode = "local", cloudUser = null;
  var sync = {state:"saved", rev:0, gen:0, busy:false, timer:0, retry:0, listeners:[]};

  function api(path, method, body, keepalive){
    var opts = {method:method || "GET", credentials:"same-origin", cache:"no-store", headers:{}};
    if (body !== undefined){ opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
    if (keepalive) opts.keepalive = true;
    return fetch(path, opts).then(function(res){
      return res.json().catch(function(){ return {}; }).then(function(data){
        var e;
        if (res.ok) return data;
        e = new Error(data.error || "The server said no (" + res.status + ").");
        e.status = res.status; e.data = data;
        throw e;
      });
    }, function(){
      var e = new Error("Could not reach the server. Check the connection and try again.");
      e.status = 0;
      throw e;
    });
  }
  function ckey(id, name){ return "logicbench.c." + id + "." + name; }
  function readKey(k, d){ try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (err) { return d; } }

  function setState(s){
    if (sync.state === s) return;
    sync.state = s;
    sync.listeners.forEach(function(fn){ try { fn(s); } catch (err) {} });
  }
  /* Two copies of a build library made one: every name from both, and where both
     have a name, the one saved last. Nothing is lost, though a build deleted on
     one device while another was offline can come back. */
  function mergeLib(a, b, gone){
    var out = {}, k;
    for (k in b) out[k] = b[k];
    for (k in a) if (!out[k] || ((a[k] && a[k].at) || 0) >= ((out[k] && out[k].at) || 0)) out[k] = a[k];
    /* a build deleted (or renamed away) after it was last saved stays gone */
    if (gone) for (k in out) if (gone[k] && gone[k] >= ((out[k] && out[k].at) || 0)) delete out[k];
    return out;
  }
  /* the deletion records of two copies, the later time for each name */
  function mergeGone(a, b){
    var out = {}, k, horizon = Date.now() - 60 * 24 * 60 * 60 * 1000;
    [b || {}, a || {}].forEach(function(m){
      for (k in m) if (m[k] > horizon && !(out[k] >= m[k])) out[k] = m[k];
    });
    return out;
  }
  /* what another device sent: its builds merged into this browser's, deletions included */
  function takeIn(id, data){
    var gone = mergeGone(readKey(ckey(id, "gone"), {}), data.gone);
    rawSet(ckey(id, "gone"), gone);
    rawSet(ckey(id, "lib"), mergeLib(readKey(ckey(id, "lib"), {}), data.lib || {}, gone));
    rawSet(ckey(id, "areas"), mergeLib(readKey(ckey(id, "areas"), {}), data.areas || {}));
    if (!readKey(ckey(id, "cur"), null) && data.cur) rawSet(ckey(id, "cur"), data.cur);
    sync.rev = data.rev || 0; rawSet(ckey(id, "rev"), sync.rev);
  }
  function adopt(id, data){
    rawSet(ckey(id, "lib"), data.lib || {});
    if (data.cur) rawSet(ckey(id, "cur"), data.cur); else rawDel(ckey(id, "cur"));
    rawSet(ckey(id, "areas"), data.areas || {});   /* the account's chip shelf, see edit.js */
    rawSet(ckey(id, "gone"), data.gone || {});
    sync.rev = data.rev || 0;
    rawSet(ckey(id, "rev"), sync.rev);
  }
  /* Builds already on this device go up with a new or first-seen account: the
     browser-only account of the same name if there is one, otherwise builds made
     before there were accounts at all. Each is handed over once. */
  function claimLocal(id){
    var done = rawGet("logicbench.handed", {}), from = null, lib, cur;
    if (local.users()[id] && !done["u." + id]) from = {lib:"logicbench.u." + id + ".lib", cur:"logicbench.u." + id + ".cur", mark:"u." + id};
    else if (!done.legacy && !rawGet(CLAIMED, null) && (localStorage.getItem("logicbench.lib") || localStorage.getItem("logicbench.cur")))
      from = {lib:"logicbench.lib", cur:"logicbench.cur", mark:"legacy"};
    if (!from) return false;
    lib = readKey(from.lib, {}); cur = readKey(from.cur, null);
    done[from.mark] = id; rawSet("logicbench.handed", done);
    if (!Object.keys(lib).length && !(cur && cur.doc)) return false;
    rawSet(ckey(id, "lib"), mergeLib(readKey(ckey(id, "lib"), {}), lib));
    if (cur && cur.doc && !readKey(ckey(id, "cur"), null)) rawSet(ckey(id, "cur"), cur);
    return true;
  }
  /* Fetch the account's builds into this browser. A copy changed here and not yet
     sent is merged with the server's rather than replaced by it. */
  function pull(){
    var id = cloudUser.id;
    return api("/api/state").then(function(data){
      var dirty = rawGet(ckey(id, "dirty"), false), claimed = claimLocal(id);
      if (dirty || claimed){
        takeIn(id, data);
        me.changed();
      } else {
        adopt(id, data);
        setState("saved");
      }
    }, function(e){
      /* offline: carry on with the copy this browser has */
      sync.rev = rawGet(ckey(id, "rev"), 0);
      if (claimLocal(id)) me.changed();
      if (rawGet(ckey(id, "dirty"), false)) setState("waiting");
      if (e.status === 401) throw e;
    });
  }
  function push(keepalive){
    var id = cloudUser && cloudUser.id, gen = sync.gen, body;
    if (!id || sync.busy) return Promise.resolve();
    if (!rawGet(ckey(id, "dirty"), false)) return Promise.resolve();
    body = {lib:readKey(ckey(id, "lib"), {}), cur:readKey(ckey(id, "cur"), null),
      areas:readKey(ckey(id, "areas"), {}), gone:readKey(ckey(id, "gone"), {}), base:sync.rev};
    sync.busy = true; setState("saving");
    return api("/api/state", "POST", body, keepalive && JSON.stringify(body).length < 60000).then(function(out){
      sync.busy = false; sync.retry = 0;
      sync.rev = out.rev; rawSet(ckey(id, "rev"), sync.rev);
      if (gen === sync.gen){ rawDel(ckey(id, "dirty")); setState("saved"); }
      else push();
    }, function(e){
      sync.busy = false;
      if (e.status === 409 && e.data){
        /* another device saved first: take in its builds and send the two together */
        takeIn(id, e.data);
        if (typeof onMerged === "function") onMerged();
        return push();
      }
      setState(e.status === 401 ? "signedout" : "waiting");
      /* try again later, backing off up to a minute */
      sync.retry = Math.min(60000, (sync.retry || 2500) * 2);
      clearTimeout(sync.timer);
      sync.timer = setTimeout(function(){ push(); }, sync.retry);
    });
  }
  var onMerged = null;

  /* Ask the server whether another device has saved since, and if so take its
     builds in. Nothing is asked while this browser has changes of its own still
     to send: those go up first, and a clash is merged then. The open sheet is
     never replaced from here - only the library behind the Home page. */
  function refresh(){
    var id = cloudUser && cloudUser.id;
    if (mode !== "cloud" || !id || sync.busy || sync.polling) return Promise.resolve();
    if (rawGet(ckey(id, "dirty"), false)) return Promise.resolve();
    sync.polling = true;
    return api("/api/state?since=" + sync.rev).then(function(data){
      var before, after;
      sync.polling = false;
      if (data.same || data.rev === sync.rev || !cloudUser || cloudUser.id !== id) return;
      if (rawGet(ckey(id, "dirty"), false) || sync.busy) return;     /* changed here meanwhile: its push will merge */
      before = localStorage.getItem(ckey(id, "lib")) + localStorage.getItem(ckey(id, "areas"));
      rawSet(ckey(id, "lib"), data.lib || {});
      rawSet(ckey(id, "areas"), data.areas || {});
      rawSet(ckey(id, "gone"), data.gone || {});
      sync.rev = data.rev || 0; rawSet(ckey(id, "rev"), sync.rev);
      after = localStorage.getItem(ckey(id, "lib")) + localStorage.getItem(ckey(id, "areas"));
      if (before !== after && typeof onMerged === "function") onMerged();
      if (sync.state !== "saved") setState("saved");
    }, function(e){
      sync.polling = false;
      if (e.status === 401) setState("signedout");
    });
  }
  var POLL_MS = 8000;
  setInterval(function(){ if (document.visibilityState === "visible") refresh(); }, POLL_MS);

  function signedIn(user){
    cloudUser = user;
    rawSet(CLOUD, user); rawSet(SEEN, true);
    return pull().then(function(){ return me.current(); });
  }

  var me = {
    /* Find out whether a server is there and who it says is signed in. */
    init:function(){
      if (!/^https?:$/.test(location.protocol) || !window.fetch) return Promise.resolve();
      return fetch("/api/auth/me", {credentials:"same-origin", cache:"no-store"}).then(function(res){
        var json = /application\/json/.test(res.headers.get("content-type") || "");
        if (!json) return;                        /* a static server with no /api */
        mode = "cloud";
        if (res.ok) return res.json().then(function(b){ return signedIn(b.user); });
        if (res.status === 401){ rawDel(CLOUD); cloudUser = null; return; }
        cloudUser = rawGet(CLOUD, null);          /* the server is having trouble: use the copy here */
        if (cloudUser) sync.rev = rawGet(ckey(cloudUser.id, "rev"), 0);
      }, function(){
        /* no connection: someone who signed in here before can keep working */
        var c = rawGet(CLOUD, null);
        if (c){ mode = "cloud"; cloudUser = c; sync.rev = rawGet(ckey(c.id, "rev"), 0); if (rawGet(ckey(c.id, "dirty"), false)) setState("waiting"); }
      }).catch(function(){});
    },
    cloud:function(){ return mode === "cloud"; },
    /* true when this browser has seen an account, so the login opens on Sign in */
    hasAccounts:function(){ return mode === "cloud" ? !!rawGet(SEEN, false) : !!Object.keys(local.users()).length; },
    users:function(){ return local.users(); },
    current:function(){
      if (mode === "cloud") return cloudUser ? {id:cloudUser.id, name:cloudUser.name, color:cloudUser.color, created:cloudUser.created} : null;
      return local.current();
    },
    /* a storage key that belongs to the signed-in account */
    key:function(name){
      var u = me.current();
      if (mode === "cloud") return ckey(u ? u.id : "anon", name);
      return "logicbench.u." + (u ? u.id : "anon") + "." + name;
    },
    register:function(name, pw){
      name = String(name || "").trim();
      try { checkName(name); } catch (e) { return Promise.reject(e); }
      if (String(pw || "").length < 6) return Promise.reject(new Error("Password must be at least 6 characters."));
      if (mode !== "cloud") return local.register(name, pw);
      return api("/api/auth/register", "POST", {username:name, password:pw}).then(function(b){ return signedIn(b.user); });
    },
    login:function(name, pw){
      if (mode !== "cloud") return local.login(name, pw);
      return api("/api/auth/login", "POST", {username:String(name || "").trim(), password:pw}).then(function(b){ return signedIn(b.user); });
    },
    /* Sign out; resolves once any unsent builds have been given a chance to go up. */
    logout:function(){
      var u = cloudUser;
      if (mode !== "cloud"){ rawDel(SESSION); return Promise.resolve(); }
      clearTimeout(sync.timer); clearTimeout(pushT);
      return push().catch(function(){}).then(function(){
        return api("/api/auth/logout", "POST", {}).catch(function(){});
      }).then(function(){
        /* builds that reached the server leave this browser; unsent ones stay until they can go */
        if (u && !rawGet(ckey(u.id, "dirty"), false)) ["lib", "cur", "rev", "areas", "gone"].forEach(function(n){ rawDel(ckey(u.id, n)); });
        rawDel(CLOUD); cloudUser = null;
      });
    },
    /* Call after the account's builds change in this browser; they go up a moment later. */
    changed:function(){
      if (mode !== "cloud" || !cloudUser) return;
      sync.gen++;
      rawSet(ckey(cloudUser.id, "dirty"), true);
      if (sync.state !== "saving") setState("pending");
      clearTimeout(pushT);
      pushT = setTimeout(function(){ push(); }, 1200);
    },
    /* The library was written: names that went missing are recorded as deleted, so
       no other device brings them back; names that came back are not. */
    noteLib:function(before, after){
      var id = cloudUser && cloudUser.id, gone, k, any = false;
      if (mode !== "cloud" || !id) return;
      gone = rawGet(ckey(id, "gone"), {});
      for (k in before) if (!(k in after)){ gone[k] = Date.now(); any = true; }
      for (k in after) if (!(k in before) && gone[k]){ delete gone[k]; any = true; }
      if (any) rawSet(ckey(id, "gone"), gone);
    },
    refresh:refresh,
    /* "saved" | "pending" | "saving" | "waiting" (no connection) | "signedout" */
    syncState:function(){ return sync.state; },
    onSync:function(fn){ sync.listeners.push(fn); },
    /* runs after builds from another device were merged into this browser's copy */
    onMerged:function(fn){ onMerged = fn; },
    flush:function(keepalive){ clearTimeout(pushT); return push(keepalive); }
  };
  var pushT = 0;

  window.addEventListener("online", function(){ if (mode === "cloud") me.flush().then(refresh); });
  window.addEventListener("focus", function(){ if (mode === "cloud") refresh(); });
  /* leaving the page sends anything still waiting */
  document.addEventListener("visibilitychange", function(){
    if (mode !== "cloud") return;
    if (document.visibilityState === "hidden") me.flush(true);
    else refresh();
  });
  return me;
})();
