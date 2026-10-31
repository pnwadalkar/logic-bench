# Logic Bench

Build and test circuits in the browser, from single transistors up to the parts a computer is
built from — gates, adders, an ALU, decoders, flip-flops, registers, counters, RAM and ROM — wired
up on an endless sheet. No install, and it keeps working offline. You sign in once with a username and
password, build, and then send your builds into the **Arena** to see how they rank.

## One app, two layouts

The layout is chosen by the device, once, before the page paints (`js/layout.js`):

| Device | Layout |
| --- | --- |
| Laptop / desktop (mouse or trackpad) | Parts **rail down the left**, normal size |
| Tablet / phone (touch) | Parts **console along the bottom**, everything a size up, full screen on first touch |

To force one, add `?layout=desktop` or `?layout=tablet` to the URL — it's remembered on that
device. `?layout=auto` goes back to automatic.

## Parts

The rail groups them in six families, a tab each:

| Family | Parts |
| --- | --- |
| Signals | Switch, Button, Clock, Hex input · Lamp, Hex display, 7-segment display |
| Gates | AND, OR, NOT, NAND, NOR, XOR, XNOR, Buffer, Tri-state buffer |
| Electronic | Power (VCC), Ground, Resistor, Diode, Capacitor, Inductor, NMOS, PMOS, NPN, PNP |
| Arithmetic | Half adder, Full adder, 4-bit adder, 4-bit comparator, 4-bit ALU (ADD SUB AND OR XOR NOT INC SHL) |
| Routing | MUX 2:1, MUX 4:1, DEMUX 1:4, Decoder 2:4, Decoder 3:8, Priority encoder 4:2 |
| Memory | SR latch, D latch, D / JK / T flip-flops, 4-bit register, shift register, counter, RAM 16×4, ROM 16×4 |

Hover a part in the rail for what it does and which pin is which.

**Signals have a strength.** An output drives strong (a gate, a switch, the power rails), weak
(through a resistor) or not at all (an off transistor, a disabled tri-state). Where wires meet,
the strongest drive wins and a 1 wins between equals. So a pull-up resistor fighting an NMOS
transistor works as it does on a board, CMOS gates can be built from PMOS and NMOS pairs, and
tri-state buffers can share one bus. A wire nothing is driving is drawn broken.

**Time.** Clocks tick by themselves (click one to change its speed: 1, 2, 5, 10, ½ Hz or stopped).
Capacitors charge and drain over time, more slowly through a resistor, and hold their charge
(slowly leaking) while their input floats, which is how a DRAM bit works. Inductors lag behind
their input. Flip-flops, registers, counters and RAM act on the rising edge of their clock.

**Chips** have named pins. A pin name ending in `=0` or `=1` in `js/core.js` may be left open
and reads as that value; EN pins left open count as on. Double-click a RAM or ROM to read or
program its sixteen words as hex digits. Click a Hex input to count it on.

## Features

- Drag parts from the rail; click a port, then click anywhere to drop a wire
- Half adder and clocked counter examples on the Home page
- Region select, copy / cut / paste / duplicate, undo
- **Cleaner** squares the whole circuit up into tidy columns, step by step
- **Test** mode locks the sheet so you can drive it with the switches
- Zoom (buttons, wheel, pinch), Fit
- Builds saved on the device, with a Home page to open, rename, copy and delete them
- Back up all builds to one JSON file and restore them on another device
- Light and dark themes; installable as an app, and works offline after the first visit

## Accounts

Nothing opens until you are signed in (`js/auth.js`, `js/login.js`). Create an account the first time,
sign in after that, and the session is remembered, so you can carry on building offline.

- **On the website** accounts live on the server (`api/`, Vercel Functions). Passwords are kept as
  salted scrypt hashes; the session is an HttpOnly cookie that lasts 30 days. Each account's builds are
  stored in a **private Vercel Blob store**, so signing in on any device brings them back.
- The browser keeps a working copy and sends it up about a second after each change. The avatar in the
  header shows a grey dot while saving and an orange one when it can't reach the server (it retries,
  and anything unsent stays in the browser). If two devices save at once, the server refuses the stale
  one and the device merges the two libraries (newest copy of each build wins) before saving again.
- Builds already made in this browser under a browser-only account of the same name — or before
  accounts existed — are handed over to the server account the first time it signs in here.
- **The one-file offline copy** (`file://`), or a static server with no `/api`, has no server to talk
  to, so there accounts live in that browser only (salted PBKDF2), with no password reset.
- There is no password reset yet. A username is a nickname, not proof of who someone is.
- A new account opens straight onto an empty sheet; a returning one lands on its Home page.
- The name in the header's top-right signs you out. Your sheet is kept first.

## Arena

Open **Arena** from the header or Home. Each challenge is a small circuit with a known right answer
(half adder, 2:1 multiplexer, majority vote, binary to Gray code, 2-to-4 decoder, full adder, 2-bit
comparator, 2-bit adder). Build it on the sheet, name your switches and lamps as the brief says (or keep
them in that order, top to bottom), and **Check** or **Submit** it.

The checker (`js/checker.js`) runs the build on its own, apart from the sheet:

1. **Rules** — gates and electronic parts only, or chips too (minus the ones that would just be the
   answer). No clocks, memory, capacitors or inductors, no feedback loops, no spare switches (they'd be a
   free constant) and no open input pins (they'd be a free 0).
2. **Does it work** — every input pattern is tried. One wrong and it isn't entered.
3. **Size** — transistors: a NAND is 4, a NOT 2, an XOR 8, a full-adder chip 28, and so on.
4. **Speed** — the longest run of gate delays from any switch to a lamp.
5. **Wiring** — the number of wires.

Score = transistors + 4 × gate delays + ½ × wires, lower is better. Points are `1000 × benchmark / score`,
so 1000 matches the best reference build and a leaner one earns more. Each player keeps their best build
per challenge; a tie goes to whoever got there first. The Rankings tab adds up everyone's points.
Each leaderboard starts with three reference builds by bot players (Ada, Boole and Hopper).

The Arena is shared by every account **on this device**. To compete across devices, **Share my entries**
downloads your entries as a file and **Import entries** on the other device merges them in. Every
imported build is run through the checker again, so a score in a file can't be forged, and a build that
no longer passes is dropped. Entries are also re-checked each time a board is drawn.

## Project layout

```
index.html            page markup
css/
  fonts.css           IBM Plex, served locally
  base.css            colours, header, sheet, home page, dialogs — shared
  desktop.css         rail on the left
  tablet.css          console along the bottom, touch sizes
js/
  layout.js           picks the layout (runs first, in <head>)
  auth.js             accounts (server or browser-only), per-account storage, syncing builds up
  core.js             constants, the part catalogue, state, colours, geometry
  shapes.js           drawing gates, switches, buttons and lamps
  symbols.js          drawing components, chips and displays
  sim.js              signal drive, every part's logic, clock edges, selection
  render.js           painting the sheet, hit tests
  edit.js             adding, wiring, deleting, undo, copy & paste
  cleaner.js          the Cleaner layout passes
  input.js            pointer, touch, zoom, keyboard
  rail.js             the parts rail / console
  builds.js           saving, the dialog, the toolbar, the examples
  timing.js           clocks, capacitors and inductors over time
  api.js              window.bench console API
  home.js             home page, backup and restore
  login.js            the login screen, the header account chip, sign out
  checker.js          the Arena checker: rules, every input pattern, size, speed, wiring
  arena.js            challenges, reference builds, standings, import/export, the Arena screens
  fullscreen.js       full screen + landscape lock
  main.js             boot
  offline.js          registers the service worker
sw.js                 offline cache
assets/               icon and fonts
api/                  Vercel Functions: auth/{register,login,logout,me}, state (an account's builds)
  _lib/               accounts, cookies and request helpers, the Blob (or local .data/) store
tools/bundle.mjs      packs everything into one offline HTML file
tools/dev-server.mjs  serves the site and the api/ routes together, for local use
```

The scripts are plain classic scripts that share one scope, loaded in order — no build step.

## Run it

```sh
npm install
npm run dev           # http://localhost:3000, with the /api routes
```

Locally, with no Blob token set, accounts and builds are kept as files in `.data/` (git-ignored).
Opening `index.html` straight from disk works too, with browser-only accounts.

## Deploy (Vercel)

Import this repo in Vercel with the framework preset **Other** and no build command. The pages
are static; the `api/` folder is deployed as Node functions. Every push to `main` redeploys.

Accounts need storage, once: in the Vercel project open **Storage → Create → Blob**, choose
**Private** access, and connect it to the project (this sets `BLOB_READ_WRITE_TOKEN`). Then redeploy.
Until a store is connected, creating an account shows a message saying so — nothing is silently lost.

## One-file offline copy

```sh
npm run bundle        # → dist/logic-bench.html
```

A single self-contained HTML file (fonts and all) to copy onto a tablet by USB and open with
no internet. Builds made there live in that browser; use Back up all / Restore to move them.

## Console API

From devtools: `bench.add("NAND", 300, 120)`, `bench.wire("A", "Sum")`, `bench.test()`,
`bench.example()`, `bench.example("counter")`, `bench.parts()`.
`bench.wire(from, to, input, output)` picks one of a chip's outputs, `bench.mem(id, "0123456789ABCDEF")`
loads a RAM or ROM, and `bench.tick(n)` steps time on n ticks of 50 ms.
