/* Shared projects: several people on one bench at once.

   The sheet is kept in step part by part and wire by wire. Each part or wire is
   written down as one line of text (canonN/canonW); "base" is the text the server
   last confirmed for each id. About once a second, everything on this sheet whose
   text differs from base goes up, and every change set others made comes back, in
   the server's order. A remote change is applied here unless the same part has a
   change of ours that the server places after it, or one still on its way — so
   whoever changed a part last wins, and nobody's drag is yanked from under them.

   What each person's simulation is doing (flip-flops, RAM, a clock's phase)
   stays on their own screen; the circuit, labels, switches and ROMs are shared.
   Needs the website: the offline single file has no server to share through. */
import { S, flash, notify } from "./state.js";
import { Auth } from "./auth.js";
import { graphOf, snapshot } from "./builds.js";
import { setTest } from "./cleaner.js";
import { TYPES, box, byId, nOut, pickN, pickW, setKind } from "./core.js";
import { keepMem } from "./edit.js";
import { zoomFit } from "./input.js";
import { draw, sizeCanvas } from "./render.js";
import { roundRect } from "./shapes.js";
import { clearPick, evaluate, reindex } from "./sim.js";

export var Collab = (function(){
  var CLIENT = (function(){
    var a = new Uint8Array(6), s = "", i;
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(a);
    else for (i = 0; i < 6; i++) a[i] = Math.random() * 256;
    for (i = 0; i < 6; i++) s += (a[i] % 36).toString(36);
    return "k" + s;
  })();
  var P = null;                 /* the open project */
  var listeners = [];
  var NOSYNC_S = {CLOCK:1, BUTTON:1};    /* a clock's phase and a held button are one person's */

  /* ---------- one part or wire as text ---------- */
  function canonN(n){
    var o = {id:n.id, t:n.t, x:n.x, y:n.y}, m;
    if (n.l) o.l = n.l;
    if (n.c !== undefined) o.c = n.c;
    if (!NOSYNC_S[n.t] && (n.s | 0)) o.s = n.s | 0;
    if (n.t === "ROM" && (m = keepMem(n.m)) !== undefined) o.m = m;
    return JSON.stringify(o);
  }
  function canonW(w){
    return JSON.stringify({id:w.id, a:w.a || null, q:w.q | 0, b:w.b || null, p:w.p | 0,
      fa:w.fa ? {x:w.fa.x, y:w.fa.y} : null, fb:w.fb ? {x:w.fb.x, y:w.fb.y} : null});
  }
  function here(){
    var n = new Map(), w = new Map(), i;
    for (i = 0; i < S.nodes.length; i++) n.set(S.nodes[i].id, canonN(S.nodes[i]));
    for (i = 0; i < S.wires.length; i++) w.set(S.wires[i].id, canonW(S.wires[i]));
    return {n:n, w:w};
  }
  function toMap(o){ var m = new Map(); Object.keys(o || {}).forEach(function(k){ m.set(k, o[k]); }); return m; }

  /* ---------- putting others' changes on this sheet ---------- */
  function putN(id, text){
    var o, n, i;
    if (text == null){
      for (i = 0; i < S.nodes.length; i++) if (S.nodes[i].id === id){ S.nodes.splice(i, 1); break; }
      byId.delete(id); pickN.delete(id);
      return;
    }
    try { o = JSON.parse(text); } catch (err) { return; }
    if (!TYPES[o.t]) return;
    n = byId.get(id);
    if (!n || n.t !== o.t){
      if (n) putN(id, null);
      n = {id:id, t:o.t, x:0, y:0, v:0, s:0, l:"", iv:[]};
      S.nodes.push(n); byId.set(id, n);
    }
    n.x = +o.x || 0; n.y = +o.y || 0; n.l = o.l || "";
    if (typeof o.c === "number") n.c = o.c; else delete n.c;
    if (!NOSYNC_S[o.t]) n.s = (o.s | 0) & 15;
    if (o.t === "ROM" && o.m !== undefined) n.m = keepMem(o.m);
  }
  function putW(id, text){
    var o, i, w;
    for (i = 0; i < S.wires.length; i++) if (S.wires[i].id === id) break;
    if (text == null){ if (i < S.wires.length) S.wires.splice(i, 1); pickW.delete(id); return; }
    try { o = JSON.parse(text); } catch (err) { return; }
    w = {id:id, a:o.a || null, q:o.a ? o.q | 0 : 0, b:o.b || null, p:o.p | 0,
      fa:o.a ? null : (o.fa ? {x:+o.fa.x, y:+o.fa.y} : null), fb:o.b ? null : (o.fb ? {x:+o.fb.x, y:+o.fb.y} : null)};
    if (i < S.wires.length) S.wires[i] = w; else S.wires.push(w);
  }
  /* a wire whose part was deleted by someone else goes too (and that goes up as a change) */
  function prune(){
    S.wires = S.wires.filter(function(w){
      var a = w.a ? byId.get(w.a) : null, b = w.b ? byId.get(w.b) : null;
      return (w.a ? a && nOut(a) > (w.q | 0) : !!w.fa) && (w.b ? !!b : !!w.fb);
    });
  }

  /* ---------- the server ---------- */
  function api(body){
    var opts = {method:body ? "POST" : "GET", credentials:"same-origin", cache:"no-store", headers:{}};
    if (body){ opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
    return fetch("/api/projects", opts).then(function(res){
      return res.json().catch(function(){ return {}; }).then(function(d){
        var e;
        if (res.ok) return d;
        e = new Error(d.error || "The server said no (" + res.status + ")."); e.status = res.status;
        throw e;
      });
    }, function(){ var e = new Error("Could not reach the server."); e.status = 0; throw e; });
  }
  function tell(){ listeners.forEach(function(fn){ try { fn(); } catch (err) {} }); }

  /* ---------- the loop ---------- */
  function diff(L, cap){
    var out = {n:{}, w:{}}, count = 0;
    ["n", "w"].forEach(function(k){
      L[k].forEach(function(v, id){ if (count < cap && P.base[k].get(id) !== v){ out[k][id] = v; count++; } });
      P.base[k].forEach(function(v, id){ if (count < cap && !L[k].has(id)){ out[k][id] = null; count++; } });
    });
    out.count = count;
    return out;
  }
  function schedule(ms){
    clearTimeout(P.timer);
    var me = P;
    P.timer = setTimeout(function(){ if (P === me) step(); }, ms);
  }
  function pace(){
    var now = Date.now(), others = P.peers.length > 0;
    if (document.visibilityState === "hidden") return 6000;
    if (others || now - P.lastLocal < 4000 || now - P.lastRemote < 4000) return 900;
    return 2500;
  }
  function step(keepalive){
    var me = P, L, sent, body, sel;
    if (!me || me.busy) return Promise.resolve();
    L = here();
    sent = diff(L, 2500);
    if (sent.count) me.lastLocal = Date.now();
    sel = []; pickN.forEach(function(id){ if (sel.length < 80) sel.push(id); });
    body = {action:"sync", id:me.id, since:me.rev, client:CLIENT, patch:{n:sent.n, w:sent.w},
      here:{x:S.hover ? S.hover.x : null, y:S.hover ? S.hover.y : null,
        on:!!S.hover && document.visibilityState !== "hidden" && !S.homeOpen && !S.arenaOpen, sel:sel}};
    me.busy = true;
    return fetch("/api/projects", {method:"POST", credentials:"same-origin", cache:"no-store", keepalive:!!keepalive && JSON.stringify(body).length < 60000,
      headers:{"Content-Type":"application/json"}, body:JSON.stringify(body)}).then(function(res){
      return res.json().catch(function(){ return {}; }).then(function(d){ if (!res.ok){ var e = new Error(d.error || "sync failed"); e.status = res.status; throw e; } return d; });
    }).then(function(res){
      me.busy = false;
      if (P !== me) return;
      me.fails = 0; me.status = "live";
      take(res, sent);
      schedule(pace());
      tell();
    }, function(e){
      me.busy = false;
      if (P !== me) return;
      if (e.status === 404 || e.status === 401){
        me.status = "gone"; tell();
        flash(e.status === 401 ? "Signed out on the server — sign in again to keep working together." : "This shared project is gone, or you were taken out of it.");
        return;
      }
      me.fails = (me.fails || 0) + 1; me.status = "offline"; tell();
      schedule(Math.min(15000, 1500 * me.fails));
    });
  }
  /* A reply from the server: others' changes onto this sheet, and base brought up to date. */
  function take(res, sent){
    var L = here(), touched = false, me = P, put = {n:new Map(), w:new Map()};
    /* Changed here since the request went out, so neither base nor the server has
       seen it. What this sheet should hold for an id, if nothing was changed here,
       is what was put on it in this reply, else what was sent, else base. */
    var pending = function(k, id){
      var expect = put[k].has(id) ? put[k].get(id)
        : Object.prototype.hasOwnProperty.call(sent[k], id) ? sent[k][id]
        : (me.base[k].has(id) ? me.base[k].get(id) : null);
      var now = L[k].has(id) ? L[k].get(id) : null;
      return now !== expect;
    };
    var apply = function(k, id, v){
      if (k === "n") putN(id, v); else putW(id, v);
      put[k].set(id, v);
      if (v == null) L[k].delete(id); else L[k].set(id, v);
      me.marks.set(id, ++me.clock); touched = true;
    };
    if (res.full){
      var nb = {n:toMap(res.full.n), w:toMap(res.full.w)};
      ["n", "w"].forEach(function(k){
        var ids = new Set(); nb[k].forEach(function(v, id){ ids.add(id); }); L[k].forEach(function(v, id){ ids.add(id); });
        ids.forEach(function(id){
          var v = nb[k].has(id) ? nb[k].get(id) : null, cur = L[k].has(id) ? L[k].get(id) : null;
          if (v !== cur && !pending(k, id)) apply(k, id, v);
        });
      });
      me.base = nb;
    } else if (res.log){
      res.log.forEach(function(e){
        ["n", "w"].forEach(function(k){
          Object.keys(e[k] || {}).forEach(function(id){
            var v = e[k][id], skip;
            /* decide against base as it stood before this change set, then move base on */
            skip = e.c === CLIENT ||
              (Object.prototype.hasOwnProperty.call(sent[k], id) && res.mine > e.r) ||
              pending(k, id);
            if (v == null) me.base[k].delete(id); else me.base[k].set(id, v);
            if (!skip) apply(k, id, v);
          });
        });
      });
    }
    me.rev = res.rev;
    refreshMeta(me);
    me.peers = (res.here || []).filter(function(h){ return h.k !== CLIENT && res.now - h.t < 15000; });
    me.peers.forEach(function(h){
      var was = me.seen[h.k];
      h.dx = was ? was.dx : h.x; h.dy = was ? was.dy : h.y;
      me.seen[h.k] = h;
    });
    if (touched){
      me.lastRemote = Date.now();
      reindex(); prune(); reindex();
      evaluate();
    }
    S.docDirty = diff(here(), 1).count > 0; notify();
    draw();
  }

  /* The project's name and members can change under you (someone renames it, or
     joins). Every 15 s or so the list is asked for, and the open project's card
     is taken from it. */
  function refreshMeta(me){
    var now = Date.now();
    if (me.metaBusy || now - (me.metaAt || 0) < 15000) return;
    me.metaBusy = true; me.metaAt = now;
    api(null).then(function(d){
      var p = (d.projects || []).filter(function(x){ return x.id === me.id; })[0];
      me.metaBusy = false;
      if (!p || P !== me) return;
      if (p.name !== me.project.name) S.docName = p.name;
      me.project = p;
      notify(); tell();
    }, function(){ me.metaBusy = false; });
  }

  /* ---------- opening and leaving ---------- */
  function begin(project, rev, n, w, keepSheet){
    var parse = function(m){ var a = []; m.forEach(function(v){ try { a.push(JSON.parse(v)); } catch (err) {} }); return a; };
    var base = {n:toMap(n), w:toMap(w)}, g;
    if (P) stop(true);
    if (S.testMode) setTest(false);
    P = {id:project.id, project:project, rev:rev, base:base, busy:false, timer:0, peers:[], seen:{},
      marks:new Map(), clock:0, lastLocal:0, lastRemote:0, status:"live"};
    S.IDTAG = "." + CLIENT;
    S.undoStack = [];
    if (!keepSheet){
      setKind(project.kind);
      g = graphOf({nodes:parse(base.n), wires:parse(base.w)});
      S.nodes = g.nodes; S.wires = g.wires;
      clearPick(); S.pend = null; S.wiring = null; S.marq = null; S.cascade = 0;
      reindex();
      sizeCanvas(); zoomFit();
    }
    S.seq = Math.max(S.seq, 1);
    S.docName = project.name; S.docDirty = false;
    try { localStorage.setItem(Auth.key("project"), project.id); } catch (err) {}
    notify(); evaluate(); draw();
    tell();
    step();
  }
  /* Stop sharing this sheet: what is not sent yet goes now. */
  function stop(quiet){
    var me = P;
    if (!me) return;
    clearTimeout(me.timer);
    me.busy = false;
    var flush = step(true);
    P = null; S.IDTAG = ""; S.undoStack = [];
    try { localStorage.removeItem(Auth.key("project")); } catch (err) {}
    if (!quiet) tell();
    return flush;
  }

  /* ---------- drawing the others ---------- */
  function hue(c){ return "hsl(" + (c | 0) + ",70%,48%)"; }
  function drawPeers(c){
    var moving = false;
    if (!P) return;
    P.peers.forEach(function(h){
      var col = hue(h.color), i, n, b;
      c.save();
      c.strokeStyle = col; c.lineWidth = 2 / S.zoom; c.setLineDash([5 / S.zoom, 3 / S.zoom]);
      for (i = 0; i < (h.sel || []).length; i++){
        n = byId.get(h.sel[i]);
        if (!n) continue;
        b = box(n);
        roundRect(c, b.x - 5, b.y - 5, b.w + 10, b.h + 10, 6); c.stroke();
      }
      c.restore();
      if (!h.on || h.x == null) return;
      /* ease toward where they are, so a once-a-second update glides */
      h.dx += (h.x - h.dx) * 0.25; h.dy += (h.y - h.dy) * 0.25;
      if (Math.abs(h.x - h.dx) + Math.abs(h.y - h.dy) > 0.5) moving = true; else { h.dx = h.x; h.dy = h.y; }
      c.save();
      c.translate(h.dx, h.dy); c.scale(1 / S.zoom, 1 / S.zoom);
      c.fillStyle = col; c.strokeStyle = "#fff"; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(0, 0); c.lineTo(0, 15); c.lineTo(4, 11); c.lineTo(8, 18); c.lineTo(10.5, 17); c.lineTo(6.5, 10); c.lineTo(12, 10); c.closePath();
      c.stroke(); c.fill();
      c.font = '600 11px "IBM Plex Sans", system-ui, sans-serif';
      c.textAlign = "left"; c.textBaseline = "alphabetic";
      var tw = c.measureText(h.name).width;
      roundRect(c, 12, 16, tw + 12, 18, 4); c.fill();
      c.fillStyle = "#fff"; c.fillText(h.name, 18, 29);
      c.restore();
    });
    if (moving) draw();
  }

  var me = {
    client:CLIENT,
    active:function(){ return !!P; },
    project:function(){ return P ? P.project : null; },
    status:function(){ return P ? P.status : ""; },
    peers:function(){ return P ? P.peers.slice() : []; },
    onChange:function(fn){ listeners.push(fn); },
    clock:function(){ return P ? P.clock : 0; },
    list:function(){ return api(null).then(function(d){ return d.projects || []; }); },
    /* A new project. With fromSheet, what is on the sheet now becomes its start. */
    create:function(name, fromSheet, kind){
      return api({action:"create", name:name, kind:fromSheet ? S.docKind : kind}).then(function(d){
        begin(d.project, 0, {}, {}, !!fromSheet);
        return d.project;
      });
    },
    join:function(code){
      return api({action:"join", code:code}).then(function(d){ return me.open(d.project.id); });
    },
    open:function(id){
      return api({action:"open", id:id}).then(function(d){
        begin(d.project, d.rev, d.n, d.w, false);
        return d.project;
      });
    },
    stop:stop,
    rename:function(name){
      if (!P) return Promise.resolve();
      var id = P.id;
      return api({action:"rename", id:id, name:name}).then(function(d){
        if (P && P.id === id){ P.project = d.project; S.docName = d.project.name; notify(); tell(); }
        return d.project;
      });
    },
    leave:function(id){ if (P && P.id === id) stop(); return api({action:"leave", id:id}); },
    remove:function(id){ if (P && P.id === id) stop(); return api({action:"delete", id:id}); },
    /* Undo in a shared project puts back only what nobody else has touched since:
       a part someone else changed after the undo point stays as they left it. */
    mergeUndo:function(d){
      if (!P || !d) return d;
      var at = d.rc || 0, marks = P.marks, out = {v:1, name:d.name, seq:d.seq, pan:d.pan, zoom:d.zoom, nodes:[], wires:[]};
      var snapN = new Map(), snapW = new Map();
      d.nodes.forEach(function(n){ snapN.set(n.id, n); });
      (d.wires || []).forEach(function(w){ snapW.set(w.id, w); });
      var now = snapshot();
      var nowN = new Map(), nowW = new Map();
      now.nodes.forEach(function(n){ nowN.set(n.id, n); });
      now.wires.forEach(function(w){ nowW.set(w.id, w); });
      var pick = function(snap, cur, add){
        var ids = new Set(); snap.forEach(function(v, id){ ids.add(id); }); cur.forEach(function(v, id){ ids.add(id); });
        ids.forEach(function(id){
          var keepNow = (marks.get(id) || 0) > at, v = keepNow ? cur.get(id) : snap.get(id);
          if (v) add(v);
        });
      };
      pick(snapN, nowN, function(v){ out.nodes.push(v); });
      pick(snapW, nowW, function(v){ out.wires.push(v); });
      return out;
    },
    drawPeers:drawPeers,
    hue:hue
  };

  document.addEventListener("visibilitychange", function(){
    if (!P) return;
    if (document.visibilityState === "hidden") step(true);
    else schedule(0);
  });
  window.addEventListener("online", function(){ if (P) schedule(0); });
  return me;
})();
