/* The bench's shared state: constants, part types, colours and part geometry. */
"use strict";

var $ = function(s){ return document.querySelector(s); };
var cv = $("#cv"), ctx = cv.getContext("2d"), ren = $("#ren");
var STUB = 9, GRID = 24, SNAP = 12, PORT = 12, PTR = 5, MONO = '500 10px "IBM Plex Mono", monospace';
var LIBKEY = "logicbench.lib", CURKEY = "logicbench.cur";

var TYPES = {
  /* A junction: both of its ports sit on the same dot, so wires meet it from
     any angle. One wire drives it, any number of wires carry the level onward —
     the way a 90° turn or a branch is made. x,y is the centre, not a corner. */
  POINT: {n:"Point",  ins:1, w:0,  h:0,  k:"pt"},
  SWITCH:{n:"Switch", ins:0, w:46, h:30, k:"sw"},
  BUTTON:{n:"Button", ins:0, w:30, h:30, k:"btn"},
  LAMP:  {n:"Lamp",   ins:1, w:28, h:28, k:"lamp"},
  AND:   {n:"AND",    ins:2, w:52, h:40, k:"and"},
  OR:    {n:"OR",     ins:2, w:52, h:40, k:"or"},
  NOT:   {n:"NOT",    ins:1, w:46, h:34, k:"not", inv:true},
  NAND:  {n:"NAND",   ins:2, w:58, h:40, k:"and", inv:true},
  NOR:   {n:"NOR",    ins:2, w:58, h:40, k:"or",  inv:true},
  XOR:   {n:"XOR",    ins:2, w:54, h:40, k:"xor"},
  XNOR:  {n:"XNOR",   ins:2, w:60, h:40, k:"xor", inv:true}
};
var IO = ["SWITCH","BUTTON","LAMP"], GATES = ["AND","OR","NOT","NAND","NOR","XOR","XNOR"];

var nodes = [], wires = [], seq = 1, pan = {x:0,y:0};
var byId = new Map(), drag = null, wiring = null, panning = null, cascade = 0;
var wireMode = false, pend = null, cursor = {x:0,y:0}, wend = null;
/* The selection is a set of parts and a set of wires rather than one item, so a
   whole region of the sheet can be boxed in, dragged, copied and pasted as one
   piece. marq is the rubber band while it is being drawn. */
var pickN = new Set(), pickW = new Set(), marq = null, regionMode = false, hover = null;
var clip = null, lastPaste = null, undoStack = [], space = false, pasteMode = false;
var testMode = false, TIP_EDIT = $("#tip").textContent;
var TIP_TEST = "Test mode — click the switches and buttons to drive the circuit · the sheet is locked · T or the Test button to edit again";
var docName = "", docDirty = false;
var dpr = 1, queued = false, dotPat = null, C = {};
/* js/layout.js picks the layout before the page paints: "desktop" puts the rail
   down the left, "tablet" docks it along the bottom as a console */
var LAYOUT = document.documentElement.getAttribute("data-layout") === "tablet" ? "tablet" : "desktop";
/* the sheet's scale: the tablet layout draws everything half as big again by default */
var ZDEF = LAYOUT === "tablet" ? 1.5 : 1, ZMIN = 0.5, ZMAX = 4, zoom = ZDEF;

/* ---------- colors ---------- */
function readColors(){
  var s = getComputedStyle(document.documentElement), i;
  var keys = ["line","grid","wire","fg","muted","panel","body","hot","accent","sel","canvas"];
  for (i = 0; i < keys.length; i++) C[keys[i]] = s.getPropertyValue("--" + keys[i]).trim();
  dotPat = null;
  buildRail();
  if ($("#home") && !$("#home").hidden) renderHome();
}
function dots(){
  if (dotPat) return dotPat;
  var c = document.createElement("canvas"), g = c.getContext("2d");
  c.width = c.height = GRID;
  g.fillStyle = C.grid; g.beginPath(); g.arc(1, 1, 1.1, 0, 7); g.fill();
  dotPat = ctx.createPattern(c, "repeat");
  return dotPat;
}

/* ---------- geometry ---------- */
function nIn(n){ return TYPES[n.t].ins; }
function isPt(n){ return TYPES[n.t].k === "pt"; }
function inPort(n, i){
  if (isPt(n)) return {x:n.x, y:n.y};
  var d = TYPES[n.t]; return {x:n.x - STUB, y:n.y + d.h * (i + 1) / (d.ins + 1)};
}
function outPort(n){
  if (isPt(n)) return {x:n.x, y:n.y};
  var d = TYPES[n.t]; return {x:n.x + d.w + STUB, y:n.y + d.h / 2};
}
function hasOut(n){ return n.t !== "LAMP"; }
function box(n){ var d = TYPES[n.t];
  if (isPt(n)) return {x:n.x - PTR - 4, y:n.y - PTR - 4, w:(PTR + 4) * 2, h:(PTR + 4) * 2};
  return {x:n.x - (d.ins ? STUB : 0) - 2, y:n.y - 2, w:d.w + 4 + (d.ins ? STUB : 0) + (hasOut(n) ? STUB : 0), h:d.h + 4}; }
