/* Talking while you build together.

   Voice goes straight from browser to browser (WebRTC), so no audio ever passes
   through the server. Everyone in the call holds one link to each other person.
   The server only carries the hellos (offers, answers, network candidates), through
   the same /api/projects function the shared sheet uses: about once a second while
   links are still being made, every few seconds once they are up.

   Of any two people, the one with the greater client id makes the offer, so two
   people never offer at once. A link that fails is made again the same way.
   Nothing is picked up until you press Voice, and Mute turns your microphone off
   at the source. */
import { S, flash, notify } from "./state.js";
import { Collab } from "./collab.js";

export var Voice = (function(){
  var V = null;                         /* the call you are in */
  var FAST = 1000, SLOW = 3500;         /* ms between calls to the server */
  var STALL = 20000;                    /* a link not up by now is made again */
  var LOST = 7000;                      /* so is one that has been "disconnected" this long */
  var SPEAK_ON = 0.035;                 /* mic level that counts as talking */

  function rid(){
    var a = new Uint8Array(6), s = "", i;
    crypto.getRandomValues(a);
    for (i = 0; i < 6; i++) s += (a[i] % 36).toString(36);
    return s;
  }
  function supported(){
    return !!(window.RTCPeerConnection && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  /* ---------- server ---------- */
  function call(body, keepalive){
    return fetch("/api/projects", {method:"POST", credentials:"same-origin", cache:"no-store",
      keepalive:!!keepalive, headers:{"Content-Type":"application/json"}, body:JSON.stringify(body)}).then(function(res){
      return res.json().catch(function(){ return {}; }).then(function(d){
        var e;
        if (res.ok) return d;
        e = new Error(d.error || "The server said no (" + res.status + ")."); e.status = res.status;
        throw e;
      });
    }, function(){ var e = new Error("Could not reach the server."); e.status = 0; throw e; });
  }
  function say(to, o){
    if (!V) return;
    V.out.push({to:to, d:JSON.stringify(o)});
    clearTimeout(V.kick);
    V.kick = setTimeout(function(){ if (V) poll(); }, 120);     /* candidates come in a burst: send them together */
  }

  /* ---------- how loud someone is ---------- */
  function meter(stream){
    var Ctx = window.AudioContext || window.webkitAudioContext, ctx, src, an, buf;
    if (!Ctx) return null;
    try {
      ctx = V.ctx; src = ctx.createMediaStreamSource(stream);
      an = ctx.createAnalyser(); an.fftSize = 512; src.connect(an);
      buf = new Uint8Array(an.fftSize);
    } catch (err) { return null; }
    return {
      level:function(){
        var i, sum = 0, v;
        an.getByteTimeDomainData(buf);
        for (i = 0; i < buf.length; i++){ v = (buf[i] - 128) / 128; sum += v * v; }
        return Math.sqrt(sum / buf.length);
      },
      stop:function(){ try { src.disconnect(); } catch (err) {} }
    };
  }
  function listen(){
    var changed = false;
    if (!V) return;
    var set = function(o, level){
      var on = level > SPEAK_ON;
      /* a short hang time, so the ring does not flicker between words */
      if (on) o.hold = Date.now() + 350;
      var talking = on || Date.now() < (o.hold || 0);
      if (talking !== !!o.speaking){ o.speaking = talking; changed = true; }
    };
    if (V.meter) set(V, V.muted ? 0 : V.meter.level());
    V.peers.forEach(function(p){ if (p.meter) set(p, p.meter.level()); });
    if (changed) notify();
  }

  /* ---------- one link to one person ---------- */
  function drop(p){
    if (!p) return;
    if (p.meter) p.meter.stop();
    if (p.audio){ p.audio.pause(); p.audio.srcObject = null; if (p.audio.parentNode) p.audio.parentNode.removeChild(p.audio); }
    if (p.pc){
      p.pc.onicecandidate = p.pc.ontrack = p.pc.onconnectionstatechange = p.pc.oniceconnectionstatechange = null;
      try { p.pc.close(); } catch (err) {}
    }
  }
  function open(k, info, session){
    var pc, p, was = V.peers.get(k);
    if (was) drop(was);
    pc = new RTCPeerConnection({iceServers:V.ice});
    p = {k:k, pc:pc, s:session, born:Date.now(), up:false, downAt:0, cand:[], remote:false, meter:null, audio:null,
      name:info.name, color:info.color, u:info.u, muted:!!info.m, speaking:false, hold:0};
    V.stream.getTracks().forEach(function(t){ pc.addTrack(t, V.stream); });
    pc.onicecandidate = function(e){
      if (e.candidate && V && V.peers.get(k) === p) say(k, {s:session, c:e.candidate.toJSON()});
    };
    pc.ontrack = function(e){
      var a;
      if (!V || V.peers.get(k) !== p || p.audio) return;
      a = document.createElement("audio");
      a.autoplay = true; a.setAttribute("playsinline", "");
      a.srcObject = e.streams[0] || new MediaStream([e.track]);
      a.style.display = "none";
      document.body.appendChild(a);
      p.audio = a;
      a.play().catch(function(){ /* the page is allowed to play once you have touched it; joining was a touch */ });
      p.meter = meter(a.srcObject);
    };
    pc.onconnectionstatechange = function(){
      var st = pc.connectionState;
      if (!V || V.peers.get(k) !== p) return;
      if (st === "connected"){ p.up = true; p.downAt = 0; }
      else if (st === "disconnected"){ if (!p.downAt) p.downAt = Date.now(); }
      else if (st === "failed" || st === "closed"){ p.up = false; p.downAt = p.downAt || 1; }
      notify();
      poll(true);
    };
    V.peers.set(k, p);
    return p;
  }
  function offerTo(k, info){
    var p = open(k, info, rid());
    p.pc.createOffer().then(function(o){
      return p.pc.setLocalDescription(o);
    }).then(function(){
      say(k, {s:p.s, t:"offer", sdp:p.pc.localDescription.sdp});
    }).catch(function(){ if (V && V.peers.get(k) === p){ drop(p); V.peers.delete(k); } });
  }
  function flushCand(p){
    var list = p.cand; p.cand = [];
    list.forEach(function(c){ p.pc.addIceCandidate(c).catch(function(){}); });
  }
  /* one hello from another person */
  function hear(from, text){
    var o, p, info;
    try { o = JSON.parse(text); } catch (err) { return; }
    if (!o || typeof o.s !== "string") return;
    info = V.roster.get(from);
    if (!info){                                              /* their name has not reached us yet: next time round */
      if (!V.held.some(function(h){ return h.text === text; })) V.held.push({from:from, text:text, at:Date.now()});
      return;
    }
    if (o.t === "offer" && typeof o.sdp === "string"){
      /* the one with the greater id offers; if both did, theirs wins only when they are greater */
      if (V.id > from && V.peers.get(from) && V.peers.get(from).s !== o.s) return;
      p = V.peers.get(from);
      if (!p || p.s !== o.s) p = open(from, info, o.s);
      p.pc.setRemoteDescription({type:"offer", sdp:o.sdp}).then(function(){
        p.remote = true; flushCand(p);
        return p.pc.createAnswer();
      }).then(function(a){
        return p.pc.setLocalDescription(a);
      }).then(function(){
        say(from, {s:p.s, t:"answer", sdp:p.pc.localDescription.sdp});
      }).catch(function(){ if (V && V.peers.get(from) === p){ drop(p); V.peers.delete(from); } });
    } else if (o.t === "answer" && typeof o.sdp === "string"){
      p = V.peers.get(from);
      if (!p || p.s !== o.s || p.remote) return;
      p.remote = true;
      p.pc.setRemoteDescription({type:"answer", sdp:o.sdp}).then(function(){ flushCand(p); }).catch(function(){});
    } else if (o.c){
      p = V.peers.get(from);
      if (!p || p.s !== o.s){ V.early.push({from:from, s:o.s, c:o.c}); if (V.early.length > 200) V.early.shift(); return; }
      if (p.remote) p.pc.addIceCandidate(o.c).catch(function(){}); else p.cand.push(o.c);
    }
  }
  /* network candidates that came before their offer */
  function replayEarly(){
    var keep = [];
    V.early.forEach(function(e){
      var p = V.peers.get(e.from);
      if (p && p.s === e.s){ if (p.remote) p.pc.addIceCandidate(e.c).catch(function(){}); else p.cand.push(e.c); }
      else if (V.roster.has(e.from) && Date.now() - (e.at || (e.at = Date.now())) < 30000) keep.push(e);
    });
    V.early = keep;
  }

  /* ---------- the loop ---------- */
  function roster(list){
    var now = new Map(), changed = false;
    list.forEach(function(r){ now.set(r.k, r); });
    V.roster = now;
    V.peers.forEach(function(p, k){
      var r = now.get(k);
      if (!r){ drop(p); V.peers.delete(k); changed = true; return; }
      if (p.muted !== !!r.m){ p.muted = !!r.m; changed = true; }
      p.name = r.name; p.color = r.color;
    });
    now.forEach(function(r, k){
      var p = V.peers.get(k), stale;
      stale = p && ((!p.up && Date.now() - p.born > STALL) || (p.downAt && Date.now() - p.downAt > LOST));
      if (stale){ drop(p); V.peers.delete(k); p = null; }
      if (!p && V.id > k){ offerTo(k, r); changed = true; }
    });
    if (changed) notify();
  }
  function pace(){
    var wait = false;
    if (document.visibilityState === "hidden") return SLOW;
    V.roster.forEach(function(r, k){ var p = V.peers.get(k); if (!p || !p.up) wait = true; });
    return wait || V.out.length ? FAST : SLOW;
  }
  function poll(soon){
    var me = V, signals;
    if (!me || me.busy) return;
    if (soon) clearTimeout(me.timer);
    signals = me.out.splice(0, 40);
    me.busy = true;
    call({action:"voice", id:me.pid, client:me.id, on:true, m:me.muted, signals:signals}).then(function(d){
      me.busy = false;
      if (V !== me) return;
      me.fails = 0;
      roster(d.peers || []);
      if (d.ice && d.ice.length) me.ice = d.ice;
      var again = me.held.filter(function(h){ return Date.now() - h.at < 30000; });
      me.held = [];
      again.concat((d.signals || []).map(function(s){ return {from:s.f, text:s.d, at:Date.now()}; }))
        .forEach(function(h){ if (V === me) hear(h.from, h.text); });
      if (V === me) replayEarly();
      clearTimeout(me.timer);
      me.timer = setTimeout(function(){ if (V === me) poll(); }, pace());
    }, function(e){
      me.busy = false;
      if (V !== me) return;
      me.out = signals.concat(me.out);                        /* not lost: sent next time */
      if (e.status === 401 || e.status === 404 || (e.status === 400 && /full/.test(e.message))){
        flash(e.status === 400 ? e.message : "Voice stopped — you are signed out, or no longer in this project.");
        leave(true);
        return;
      }
      me.fails = (me.fails || 0) + 1;
      clearTimeout(me.timer);
      me.timer = setTimeout(function(){ if (V === me) poll(); }, Math.min(10000, 1500 * me.fails));
    });
  }

  /* ---------- joining and leaving ---------- */
  function join(){
    var pr = Collab.project();
    if (V) return Promise.resolve();
    watch();
    if (!pr) return Promise.reject(new Error("Voice is for shared projects — open one first."));
    if (!supported()) return Promise.reject(new Error("This browser cannot do voice chat."));
    if (!window.isSecureContext) return Promise.reject(new Error("Voice chat needs the https:// address of the site."));
    V = {pid:pr.id, id:Collab.client, stream:null, muted:false, peers:new Map(), roster:new Map(), early:[], held:[], out:[],
      busy:false, timer:0, kick:0, fails:0, ice:[{urls:"stun:stun.l.google.com:19302"}], ctx:null, meter:null, speaking:false,
      hold:0, listener:0, starting:true};
    var me = V;
    notify();
    return navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true, noiseSuppression:true, autoGainControl:true}, video:false}).then(function(stream){
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (V !== me){ stream.getTracks().forEach(function(t){ t.stop(); }); return; }
      me.stream = stream; me.starting = false;
      try { if (Ctx){ me.ctx = new Ctx(); if (me.ctx.state === "suspended") me.ctx.resume(); me.meter = meter(stream); } } catch (err) {}
      me.listener = setInterval(listen, 120);
      notify();
      poll();
    }, function(e){
      if (V === me){ V = null; notify(); }
      var name = e && e.name;
      throw new Error(name === "NotAllowedError" || name === "SecurityError"
        ? "The microphone is blocked. Allow it for this site in the address bar, then press Voice again."
        : name === "NotFoundError" || name === "OverconstrainedError" ? "No microphone found on this device."
        : "Could not start the microphone.");
    });
  }
  function leave(quiet){
    var me = V;
    if (!me) return;
    V = null;
    clearTimeout(me.timer); clearTimeout(me.kick); clearInterval(me.listener);
    me.peers.forEach(drop);
    if (me.meter) me.meter.stop();
    if (me.stream) me.stream.getTracks().forEach(function(t){ t.stop(); });
    if (me.ctx) try { me.ctx.close(); } catch (err) {}
    call({action:"voice", id:me.pid, client:me.id, on:false}, true).catch(function(){});
    notify();
    if (!quiet) flash("You left the voice chat");
  }
  function setMuted(m){
    if (!V) return;
    V.muted = !!m;
    if (V.stream) V.stream.getAudioTracks().forEach(function(t){ t.enabled = !V.muted; });
    if (V.muted && V.speaking){ V.speaking = false; }
    notify();
    poll(true);                                   /* the others see the change now */
  }

  /* The shared project went away or changed under the call: the call ends.
     (Hooked up on the first join, not when this file loads: Collab is still
     being defined then.) */
  var watching = false;
  function watch(){
    if (watching) return;
    watching = true;
    Collab.onChange(function(){
      var pr = Collab.project();
      if (V && (!Collab.active() || !pr || pr.id !== V.pid || Collab.status() === "gone")){
        leave(true);
        flash("The voice chat ended with the shared sheet");
      }
    });
  }
  window.addEventListener("pagehide", function(){ if (V) leave(true); });
  document.addEventListener("visibilitychange", function(){ if (V && document.visibilityState === "visible") poll(true); });

  return {
    supported:supported,
    active:function(){ return !!V; },
    starting:function(){ return !!V && V.starting; },
    muted:function(){ return !!V && V.muted; },
    speaking:function(){ return !!V && V.speaking && !V.muted; },
    join:join,
    leave:function(){ leave(false); },
    toggleMute:function(){ if (V) setMuted(!V.muted); },
    /* who is in the call, by account: {name, color, muted, speaking, up} */
    people:function(){
      var out = [];
      if (!V) return out;
      V.peers.forEach(function(p){ out.push({u:p.u, name:p.name, color:p.color, muted:p.muted, speaking:p.speaking, up:p.up}); });
      V.roster.forEach(function(r, k){ if (!V.peers.has(k)) out.push({u:r.u, name:r.name, color:r.color, muted:!!r.m, speaking:false, up:false}); });
      return out;
    },
    /* the page is told when a link could not be made, so it can say so */
    trouble:function(){
      var bad = false;
      if (!V) return false;
      V.peers.forEach(function(p){ if (!p.up && Date.now() - p.born > 12000) bad = true; });
      return bad;
    }
  };
})();
