import { S } from "../bench/state.js";
import { Collab } from "../bench/collab.js";
import { acceptInvite, declineInvite } from "../bench/invites.js";
import { useBench } from "../hooks.js";

/* "Alex invited you to build “Adder” together": over everything, until it is answered. */
export default function InvitePopup() {
  useBench();
  const inv = S.invites[0];
  if (!inv) return null;
  const more = S.invites.length - 1;
  return (
    <div id="invPop" role="alertdialog" aria-labelledby="invPopT" aria-live="assertive">
      <div className="top">
        <i style={{ background: Collab.hue(inv.color) }} aria-hidden="true">{String(inv.from || "?").charAt(0).toUpperCase()}</i>
        <p id="invPopT"><b>{inv.from}</b> invited you to build <b>“{inv.project}”</b> together{inv.kind === "quantum" ? " (quantum)" : ""}.</p>
      </div>
      {more > 0 && <p className="more">+{more} more waiting</p>}
      <div className="act">
        <button type="button" onClick={() => declineInvite(inv)}>Decline</button>
        <button type="button" className="key" autoFocus onClick={() => acceptInvite(inv)}>Join</button>
      </div>
    </div>
  );
}
