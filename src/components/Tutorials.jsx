import { S, notify } from "../bench/state.js";
import { enterBench, newSheet } from "../bench/home.js";
import { example, example2 } from "../bench/builds.js";
import { exampleQ } from "../bench/quantum.js";

const lessons = [
  {
    id: "signals", level: "01 · First steps", title: "Signals and logic gates", time: "10 min",
    intro: "A circuit is a network of signals. Switches provide inputs, wires carry them, and gates transform them into outputs.",
    learn: "Read a truth table and connect AND, OR, NOT, XOR, and NAND gates.",
    steps: ["Start with two switches and one lamp.", "Connect both switches to an AND gate, then connect its output to the lamp.", "Try all four input combinations. The lamp lights only when both inputs are on.", "Swap AND for OR, then XOR. Describe how each truth table differs."],
    goal: "Make a lamp turn on for exactly one of the two input combinations where one switch is on."
  },
  {
    id: "half-adder", level: "02 · Arithmetic", title: "Build a half adder", time: "12 min",
    intro: "Add two one-bit numbers. The sum is XOR; the carry is AND. Together, two small gates make the first useful arithmetic circuit.",
    learn: "See why binary addition needs two output bits: Sum and Carry.",
    steps: ["Open the half-adder example, then inspect its two switches and two lamps.", "Find the XOR path to Sum and the AND path to Carry.", "Test 0+0, 0+1, 1+0, and 1+1.", "Replace one gate with an equivalent Boolean circuit and check that every result still matches."],
    goal: "For 1+1, make Sum read 0 and Carry read 1.", sample: "half"
  },
  {
    id: "full-adder", level: "03 · Arithmetic", title: "From half adder to full adder", time: "15 min",
    intro: "A full adder also accepts a carry from the previous bit. Two XOR gates form the sum; three AND terms combined with OR form the carry.",
    learn: "Chain binary addition across bit positions without losing a carry.",
    steps: ["Place three switches for A, B, and Carry-in.", "XOR A and B, then XOR that result with Carry-in to make Sum.", "Build Carry-out as (A AND B) OR (Carry-in AND (A XOR B)).", "Check all eight input combinations, especially 1+1+1 = binary 11."],
    goal: "Make the output read Sum=1 and Carry-out=1 when all three inputs are 1."
  },
  {
    id: "routing", level: "04 · Data flow", title: "Choose and route data", time: "12 min",
    intro: "A multiplexer chooses one input; a decoder turns a binary address into one active output. These parts steer data through a computer.",
    learn: "Use select bits to control which value reaches an output.",
    steps: ["Connect two switches to the data inputs of a 2:1 MUX.", "Connect a third switch to Select and the MUX output to a lamp.", "Toggle Select and confirm the lamp follows the selected data input.", "Try a decoder: use its address inputs to activate one output at a time."],
    goal: "Make the output follow D0 for Select=0 and D1 for Select=1."
  },
  {
    id: "state", level: "05 · Remembering", title: "Latches, flip-flops, and registers", time: "15 min",
    intro: "Combinational gates forget immediately. Feedback and clocked storage let circuits remember a bit, then a group of bits.",
    learn: "Distinguish a latch from an edge-triggered flip-flop and combine bits into a register.",
    steps: ["Place a D flip-flop, a switch on D, a clock, and a lamp on Q.", "Toggle D between clock edges; Q should hold its old value.", "Pulse the clock and watch Q take the value of D.", "Repeat the idea with a 4-bit register to store a small number."],
    goal: "Change D without a clock edge and show that the stored output stays put."
  },
  {
    id: "alu", level: "06 · The datapath", title: "Build an ALU", time: "18 min",
    intro: "An arithmetic logic unit combines add, subtract, and bitwise operations. Control bits choose which result appears at the output.",
    learn: "Connect operands, operation selection, and a result bus.",
    steps: ["Place the 4-bit ALU and wire switches or hex inputs to A and B.", "Connect the operation select pins and four result outputs to a display.", "Try ADD, SUB, AND, OR, and XOR with small values.", "Compare the chip with a gate-built 1-bit slice and identify reusable patterns."],
    goal: "Run the same operands through two operations and explain which control input changed the result."
  },
  {
    id: "memory", level: "07 · Memory", title: "RAM, ROM, and counters", time: "15 min",
    intro: "Memory stores words at addresses. A counter can walk through addresses; ROM keeps fixed instructions while RAM can be written during a run.",
    learn: "Use address, data, write-enable, and clock signals to work with stored values.",
    steps: ["Open the counter example and follow the clock into the counter.", "See how each rising edge advances the stored count.", "Place RAM and connect an address, data input, write-enable, clock, and output display.", "Double-click RAM or ROM to inspect its sixteen words."],
    goal: "Explain how the address selects a word and what must happen for RAM to store new data.", sample: "counter"
  },
  {
    id: "cpu", level: "08 · A computer", title: "Assemble a simple CPU", time: "25 min",
    intro: "A CPU repeats a fetch, decode, execute cycle. The program counter selects an instruction; control logic routes values through registers and the ALU.",
    learn: "Trace the roles of the program counter, instruction memory, register, ALU, and control signals.",
    steps: ["Lay out a program counter feeding the address of a ROM.", "Treat ROM output bits as an instruction: reserve fields for operation and operands.", "Route operands to registers and the ALU; use decoded operation bits as control.", "Feed the result back into a register and advance the program counter on each clock.", "Start with one instruction, such as increment A, then add a second operation."],
    goal: "Trace one clock cycle from instruction address to updated register value."
  },
  {
    id: "gpu", level: "09 · Parallel computing", title: "How a GPU works", time: "20 min",
    intro: "A GPU applies the same operation to many values at once. Replicated arithmetic lanes share control, while memory supplies batches of data.",
    learn: "Model parallel lanes and compare their throughput with one sequential lane.",
    steps: ["Build two identical 4-bit datapaths from adders or ALUs.", "Feed each lane a different pair of values, and share the operation select signals.", "Use separate registers to hold each lane's result on the same clock edge.", "Scale the pattern to four lanes and count how many values one cycle can process.", "Discuss what a real GPU adds: thousands of lanes, caches, scheduling, and graphics units."],
    goal: "Show two independent additions completing in the same clock cycle."
  },
  {
    id: "transistors", level: "10 · Down to the silicon", title: "Transistors and cooling", time: "18 min",
    intro: "Logic can be built from transistor switches. Real processors pack billions of devices into a chip, and power turns into heat that must be moved away.",
    learn: "Connect transistor-level switching to gates, power draw, and thermal limits.",
    steps: ["Build an inverter from a PMOS and NMOS pair with power and ground.", "Use transistor networks to make a NAND gate, then compare its behavior with the gate part.", "Open Test mode and observe how active parts warm up.", "Place a powered fan near a warm region and watch its temperature change."],
    goal: "Explain how complementary transistors make a low-power inverter and why a processor needs cooling."
  },
  {
    id: "quantum", level: "11 · Another model", title: "Quantum circuits", time: "15 min",
    intro: "Qubits can be in superpositions, and gates can entangle them. Measurement returns classical outcomes with probabilities rather than one fixed answer.",
    learn: "Read a state-vector experiment through its meter outcomes.",
    steps: ["Open the Bell-pair example and inspect the Hadamard and CNOT gates.", "Run the build and read the joint outcomes panel.", "Notice that 00 and 11 occur, while 01 and 10 do not.", "Change the gates and compare how the outcome probabilities change."],
    goal: "Describe why the two meter results agree even though either result is unpredictable.", sample: "quantum"
  }
];

function TutorialLesson({ lesson }) {
  const openSheet = () => {
    if (lesson.sample === "half") example();
    else if (lesson.sample === "counter") example2();
    else if (lesson.sample === "quantum") exampleQ();
    else newSheet("classical");
    enterBench();
  };
  return <article className="lessonBody">
    <div className="lessonEyebrow">{lesson.level} <span>· {lesson.time}</span></div>
    <h2>{lesson.title}</h2>
    <p className="lessonIntro">{lesson.intro}</p>
    <div className="lessonLearn"><b>You will learn</b><p>{lesson.learn}</p></div>
    <h3>Try it</h3>
    <ol>{lesson.steps.map((step) => <li key={step}>{step}</li>)}</ol>
    <div className="lessonGoal"><b>Challenge</b><p>{lesson.goal}</p></div>
    <button type="button" className="key lessonStart" onClick={openSheet}>{lesson.sample ? "Open example on the sheet" : "Start with a blank sheet"}</button>
  </article>;
}

export default function Tutorials() {
  const lesson = lessons.find((item) => item.id === S.tutorialLesson) || lessons[0];
  return <aside className="tutorialPanel" aria-label="Learning path">
    <div className="tutorialHead">
      <div><span className="tutorialKicker">LOGIC BENCH · LEARNING PATH</span><h2>From gates to GPUs</h2></div>
      <button type="button" className="tutorialClose" aria-label="Close learning path" onClick={() => { S.tutorialOpen = false; notify(); }}>Close</button>
    </div>
    <p className="tutorialSummary">A hands-on route from your first truth table to the ideas behind modern computers. Pick any lesson and build along.</p>
    <nav className="lessonList" aria-label="Lessons">
      {lessons.map((item) => <button type="button" key={item.id} className={item.id === lesson.id ? "lessonPick selected" : "lessonPick"}
        aria-current={item.id === lesson.id ? "step" : undefined}
        onClick={() => { S.tutorialLesson = item.id; notify(); }}>
        <span>{item.level}</span><b>{item.title}</b>
      </button>)}
    </nav>
    <TutorialLesson lesson={lesson} />
  </aside>;
}
