import { memo } from "react";

/* The sign-in screen: nothing opens until someone is signed in. The engine
   (login.js) works the form. */
function Login() {
  return (
    <div id="login" hidden>
      <main className="loginCard">
        <h1>Logic <em>Bench</em></h1>
        <h2 id="loginT">Welcome back</h2>
        <p id="loginS" className="sub"></p>
        <div className="tabs" role="tablist">
          <button className="tab on" id="tabIn" type="button" role="tab" aria-selected="true">Sign in</button>
          <button className="tab" id="tabUp" type="button" role="tab" aria-selected="false">Create account</button>
        </div>
        <form id="loginForm" noValidate autoComplete="on">
          <label className="field"><span>Username</span>
            <input id="luser" name="username" type="text" autoComplete="username" autoCapitalize="none" spellCheck="false" maxLength={20} required />
          </label>
          <label className="field"><span>Password</span>
            <span className="pw">
              <input id="lpw" name="password" type="password" autoComplete="current-password" minLength={6} required />
              <button type="button" id="leye" aria-label="Show password">Show</button>
            </span>
          </label>
          <label className="field" id="pw2Row" hidden><span>Confirm password</span>
            <input id="lpw2" type="password" autoComplete="new-password" minLength={6} />
          </label>
          <p id="loginErr" role="alert"></p>
          <button className="key wide" id="loginGo" type="submit">Sign in</button>
        </form>
        <p className="fine" id="loginFine"></p>
      </main>
    </div>
  );
}

export default memo(Login);
