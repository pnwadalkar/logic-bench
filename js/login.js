/* The login screen: nothing opens until someone is signed in. */
"use strict";

/* ---------- login ---------- */
var loginDone = null, loginMode = "in", loginBusy = false;

function loginTab(m){
  var up = m === "up";
  loginMode = m;
  $("#tabIn").classList.toggle("on", !up); $("#tabUp").classList.toggle("on", up);
  $("#tabIn").setAttribute("aria-selected", String(!up)); $("#tabUp").setAttribute("aria-selected", String(up));
  $("#pw2Row").hidden = !up;
  $("#loginT").textContent = up ? "Create your account" : "Welcome back";
  $("#loginS").textContent = up
    ? "Pick a username and password. Your builds are kept under it, and it is the name you carry into the Arena."
    : "Sign in to open your builds and your place in the Arena.";
  $("#loginGo").textContent = up ? "Create account" : "Sign in";
  $("#lpw").autocomplete = up ? "new-password" : "current-password";
  $("#loginErr").textContent = "";
}
/* Show the screen; done() runs once someone has signed in or made an account. */
function loginShow(done){
  loginDone = done;
  loginTab(Object.keys(Auth.users()).length ? "in" : "up");
  $("#lpw").value = $("#lpw2").value = "";
  $("#login").hidden = false;
  $("#luser").focus();
}
$("#tabIn").addEventListener("click", function(){ loginTab("in"); });
$("#tabUp").addEventListener("click", function(){ loginTab("up"); });
$("#leye").addEventListener("click", function(){
  var show = $("#lpw").type === "password";
  $("#lpw").type = $("#lpw2").type = show ? "text" : "password";
  this.setAttribute("aria-label", show ? "Hide password" : "Show password");
});
$("#loginForm").addEventListener("submit", function(e){
  e.preventDefault();
  if (loginBusy) return;
  var name = $("#luser").value, pw = $("#lpw").value, err = $("#loginErr");
  if (!name.trim() || !pw){ err.textContent = "Enter a username and password."; return; }
  if (loginMode === "up" && pw !== $("#lpw2").value){ err.textContent = "Passwords do not match."; return; }
  loginBusy = true; $("#loginGo").disabled = true; err.textContent = "";
  (loginMode === "up" ? Auth.register(name, pw) : Auth.login(name, pw)).then(function(){
    var fn = loginDone;
    loginBusy = false; $("#loginGo").disabled = false;
    $("#login").hidden = true; $("#lpw").value = $("#lpw2").value = "";
    if (fn) fn();
  }, function(ex){
    err.textContent = ex.message;
    loginBusy = false; $("#loginGo").disabled = false;
  });
});
/* a form of its own: typing a name or a password never drives the sheet */
$("#login").addEventListener("keydown", function(e){ e.stopPropagation(); });

/* ---------- who is signed in ---------- */
function userChip(){
  var u = Auth.current(), b = $("#btnUser");
  b.hidden = !u;
  if (!u) return;
  $("#userDot").textContent = u.name.charAt(0).toUpperCase();
  $("#userDot").style.background = "hsl(" + u.color + ",55%,42%)";
  $("#userName").textContent = u.name;
  b.title = "Signed in as " + u.name + " · click to sign out";
  $("#homeWho").textContent = u.name;
}
/* The sheet is kept first, then the page starts over at the login screen. */
function signOut(){
  if (testMode) setTest(false);
  keepBuild();
  try { localStorage.setItem(CURKEY(), JSON.stringify({doc:snapshot(), dirty:docDirty})); } catch (err) {}
  Auth.logout();
  location.reload();
}
$("#btnUser").addEventListener("click", function(){
  var u = Auth.current();
  if (!u) return;
  ask({title:"Sign out", ok:"Sign out", msg:"Signed in as “" + u.name + "”. Your builds are kept on this device and are here when you sign in again.",
    done:signOut});
});
