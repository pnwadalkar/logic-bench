# Logic Bench

Build and test logic circuits in the browser — switches, buttons, lamps and the seven
basic gates, wired up on an endless sheet. No install, no account, and it keeps working offline.

## One app, two layouts

The layout is chosen by the device, once, before the page paints (`js/layout.js`):

| Device | Layout |
| --- | --- |
| Laptop / desktop (mouse or trackpad) | Parts **rail down the left**, normal size |
| Tablet / phone (touch) | Parts **console along the bottom**, everything a size up, full screen on first touch |

To force one, add `?layout=desktop` or `?layout=tablet` to the URL — it's remembered on that
device. `?layout=auto` goes back to automatic.

## Features

- Drag parts from the rail; click a port, then click anywhere to drop a wire
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
  core.js             constants, part types, state, colours, geometry
  shapes.js           drawing gates and parts
  sim.js              logic evaluation and selection
  render.js           painting the sheet, hit tests
  edit.js             adding, wiring, deleting, undo, copy & paste
  cleaner.js          the Cleaner layout passes
  input.js            pointer, touch, zoom, keyboard
  rail.js             the parts rail / console
  builds.js           saving, the dialog, the toolbar
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
`bench.example()`.
