import { useEffect, useRef, useState } from "react";
import { S, notify } from "../bench/state.js";
import { Auth } from "../bench/auth.js";
import { Collab } from "../bench/collab.js";
import { sendInvite } from "../bench/invites.js";
import { useBench } from "../hooks.js";

/* Invite someone to a shared project by username. People you have built with
   before are one tap away. The person asked sees a popup on their own page. */
export default function InviteDialog({ project }) {
  useBench();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);                 // {text, good}
  const [sent, setSent] = useState([]);                 // names asked in this dialog
  const input = useRef(null);
  useEffect(() => { input.current.focus(); }, []);

  const open = Collab.project();
  const live = open && open.id === project.id ? open : project;      // the open project's list is kept fresh
  const me = Auth.current();
  const inside = new Set((live.members || []).map((m) => m.id));
  const asked = new Set(sent.map((s) => s.toLowerCase()));
  /* everyone from your other projects who is not in this one */
  const known = new Map();
  S.shared.list.forEach((p) => (p.members || []).forEach((m) => {
    if (m.id !== (me && me.id) && !inside.has(m.id) && !asked.has(m.name.toLowerCase())) known.set(m.id, m);
  }));

  const close = () => { S.invitePicker = null; notify(); };
  const ask = (who) => {
    who = String(who || "").trim();
    if (!who || busy) return;
    setBusy(true); setMsg(null);
    sendInvite(project, who).then((to) => {
      setBusy(false); setName(""); setSent((l) => l.concat(to.name));
      setMsg({ good: true, text: "Invitation sent to " + to.name + ". It pops up on their screen — you will see them here once they join." });
      input.current.focus();
    }, (e) => { setBusy(false); setMsg({ good: false, text: e.message }); });
  };
  return (
    <div id="invDlg" role="dialog" aria-modal="true" aria-labelledby="invT"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      onKeyDown={(e) => { if (e.key === "Escape") close(); e.stopPropagation(); }}>
      <form id="invBox" autoComplete="off" onSubmit={(e) => { e.preventDefault(); ask(name); }}>
        <h2 id="invT">Invite to “{live.name}”</h2>
        <p>Type their Logic Bench username. They get a popup asking if they want to join — nothing to copy or send.</p>
        <div id="invRow">
          <input id="invName" ref={input} spellCheck="false" maxLength={20} placeholder="Username" aria-label="Username to invite"
            value={name} onChange={(e) => setName(e.target.value)} />
          <button type="submit" className="key" disabled={busy || !name.trim()}>{busy ? "Sending…" : "Invite"}</button>
        </div>
        <p id="invMsg" className={msg ? (msg.good ? "good" : "bad") : ""} role="status">{msg ? msg.text : ""}</p>
        {known.size > 0 && (
          <>
            <div className="invSect">People you have built with</div>
            <div id="invChips">
              {Array.from(known.values()).slice(0, 12).map((m) => (
                <button type="button" key={m.id} disabled={busy} onClick={() => ask(m.name)} title={"Invite " + m.name}>
                  <i style={{ background: Collab.hue(m.color) }}>{m.name.charAt(0).toUpperCase()}</i>{m.name}
                </button>
              ))}
            </div>
          </>
        )}
        <div className="invSect">In this project</div>
        <div className="invWho">
          {(live.members || []).map((m) => (
            <span key={m.id}><i style={{ background: Collab.hue(m.color) }}>{m.name.charAt(0).toUpperCase()}</i>{m.name}{me && m.id === me.id ? " (you)" : ""}</span>
          ))}
        </div>
        <div className="dlgAct">
          <button type="button" onClick={close}>Done</button>
        </div>
      </form>
    </div>
  );
}
