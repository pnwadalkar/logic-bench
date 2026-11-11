import { useEffect } from "react";
import { startEngine } from "virtual:engine";
import { host } from "./store.js";
import Bench from "./components/Bench.jsx";
import Home from "./components/Home.jsx";
import Arena from "./components/Arena.jsx";
import Login from "./components/Login.jsx";
import Dialog from "./components/Dialog.jsx";
import KindChooser from "./components/KindChooser.jsx";

/* The engine draws the sheet on a canvas and works the page it is given; it is
   started once, after React has put that page on screen. */
let started = false;

export default function App() {
  useEffect(() => {
    if (started) return;
    started = true;
    startEngine(host);
  }, []);
  return (
    <>
      <Bench />
      <Home />
      <Arena />
      <Login />
      <Dialog />
      <KindChooser />
    </>
  );
}
