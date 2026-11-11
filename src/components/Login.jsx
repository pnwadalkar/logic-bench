import { useState } from "react";
import { S, notify } from "../bench/state.js";
import { Auth } from "../bench/auth.js";

/* The sign-in screen: nothing opens until someone is signed in. When they are,
   whoever asked for the screen (loginShow in account.js) is told. */
export default function Login() {
  const cloud = Auth.cloud();
  const [mode, setMode] = useState(Auth.hasAccounts() ? "in" : "up");
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const up = mode === "up";
  const tab = (m) => { setMode(m); setErr(""); };
  const submit = (e) => {
    e.preventDefault();
    if (busy) return;
    if (!name.trim() || !pw) { setErr("Enter a username and password."); return; }
    if (up && pw !== pw2) { setErr("Passwords do not match."); return; }
    setBusy(true); setErr("");
    (up ? Auth.register(name, pw) : Auth.login(name, pw)).then(() => {
      const done = S.login && S.login.done;
      S.login = null; notify();
      if (done) done();
    }, (ex) => { setErr(ex.message); setBusy(false); });
  };
  return (
    /* a form of its own: typing a name or a password never drives the sheet */
    <div id="login" onKeyDown={(e) => e.stopPropagation()}>
      <main className="loginCard">
        <h1>Logic <em>Bench</em></h1>
        <h2 id="loginT">{up ? "Create your account" : "Welcome back"}</h2>
        <p id="loginS" className="sub">{up
          ? "Pick a username and password. Your builds are " + (cloud ? "saved to it" : "kept under it") + ", and it is the name you carry into the Arena."
          : "Sign in to open your builds and your place in the Arena."}</p>
        <div className="tabs" role="tablist">
          <button className={"tab" + (up ? "" : " on")} id="tabIn" type="button" role="tab" aria-selected={!up} onClick={() => tab("in")}>Sign in</button>
          <button className={"tab" + (up ? " on" : "")} id="tabUp" type="button" role="tab" aria-selected={up} onClick={() => tab("up")}>Create account</button>
        </div>
        <form id="loginForm" noValidate autoComplete="on" onSubmit={submit}>
          <label className="field"><span>Username</span>
            <input id="luser" name="username" type="text" autoComplete="username" autoCapitalize="none" spellCheck="false"
              maxLength={20} required autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field"><span>Password</span>
            <span className="pw">
              <input id="lpw" name="password" type={show ? "text" : "password"} autoComplete={up ? "new-password" : "current-password"}
                minLength={6} required value={pw} onChange={(e) => setPw(e.target.value)} />
              <button type="button" id="leye" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow(!show)}>Show</button>
            </span>
          </label>
          {up && (
            <label className="field" id="pw2Row"><span>Confirm password</span>
              <input id="lpw2" type={show ? "text" : "password"} autoComplete="new-password" minLength={6}
                value={pw2} onChange={(e) => setPw2(e.target.value)} />
            </label>
          )}
          <p id="loginErr" role="alert">{err}</p>
          <button className="key wide" id="loginGo" type="submit" disabled={busy}>{up ? "Create account" : "Sign in"}</button>
        </form>
        <p className="fine" id="loginFine">{cloud
          ? "Your account and builds are saved on the Logic Bench server, so you can sign in from any device. There is no password reset yet, so keep your password safe."
          : "This copy is offline, so accounts are kept in this browser on this device only — nothing is sent to a server, and there is no password reset. Use the website to keep builds in an account you can open anywhere."}</p>
      </main>
    </div>
  );
}
