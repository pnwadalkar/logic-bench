# Logic Bench

Build and test circuits in the browser, from single transistors up to the parts a computer is
built from — gates, adders, an ALU, decoders, flip-flops, registers, counters, RAM and ROM — wired
up on an endless sheet. No install, no account, and it keeps working offline.

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
  fullscreen.js       full screen + landscape lock
  main.js             boot
  offline.js          registers the service worker
sw.js                 offline cache
assets/               icon and fonts
tools/bundle.mjs      packs everything into one offline HTML file
```

The scripts are plain classic scripts that share one scope, loaded in order — no build step.

## Run it

```sh
npm run dev           # http://localhost:3000
```

Or open `index.html` straight from disk.

## Deploy (Vercel)

Import this repo in Vercel with the framework preset **Other** and no build command — it's a
static site. Every push to `main` redeploys.

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
