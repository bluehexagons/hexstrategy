import "./styles.css";
import { hexKey } from "./hex";
import { BoardRenderer, type Point } from "./renderer";
import { Simulation, TICK_MS, type SelectionMode, type SimulationCell } from "./simulation";

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing required element: #${id}`);
  return found as T;
}

interface PointerInteraction {
  readonly pointerId: number;
  readonly mode: "pan" | "select";
  readonly button: number;
  readonly selectionMode: SelectionMode;
  readonly seenKeys: Set<string>;
  lastPoint: Point;
  moved: boolean;
}

const canvas = element<HTMLCanvasElement>("game-canvas");
const overviewCanvas = element<HTMLCanvasElement>("overview-canvas");
const canvasWrap = element<HTMLDivElement>("canvas-wrap");
const sampleCount = element<HTMLSpanElement>("sample-count");
const worldSeed = element<HTMLSpanElement>("world-seed");
const thingCount = element<HTMLSpanElement>("thing-count");
const readyCount = element<HTMLSpanElement>("ready-count");
const moteCount = element<HTMLSpanElement>("mote-count");
const sourceCount = element<HTMLSpanElement>("source-count");
const energyValue = element<HTMLSpanElement>("energy-value");
const tickCount = element<HTMLSpanElement>("tick-count");
const fpsValue = element<HTMLSpanElement>("fps-value");
const clockIndicator = element<HTMLSpanElement>("clock-indicator");
const clockLabel = element<HTMLSpanElement>("clock-label");
const zoomValue = element<HTMLSpanElement>("zoom-value");
const selectionStatus = element<HTMLSpanElement>("selection-status");
const selectionContent = element<HTMLDivElement>("selection-content");
const activityLog = element<HTMLOListElement>("activity-log");
const actionPrompt = element<HTMLParagraphElement>("action-prompt");
const seedButton = element<HTMLButtonElement>("seed-button");
const clearButton = element<HTMLButtonElement>("clear-button");
const pauseButton = element<HTMLButtonElement>("pause-button");
const resetButton = element<HTMLButtonElement>("reset-button");
const zoomOutButton = element<HTMLButtonElement>("zoom-out-button");
const zoomInButton = element<HTMLButtonElement>("zoom-in-button");
const cameraResetButton = element<HTMLButtonElement>("camera-reset-button");
const panModeButton = element<HTMLButtonElement>("pan-mode-button");
const statusToast = element<HTMLDivElement>("status-toast");
const mapAnnouncer = element<HTMLDivElement>("map-announcer");

let simulation = new Simulation();
let hoveredKey: string | null = null;
let keyboardMode = false;
let panMode = false;
let spacePressed = false;
let pointerInteraction: PointerInteraction | null = null;
let toastTimer = 0;
let previousFrame = performance.now();
let fpsStart = previousFrame;
let framesSinceSample = 0;
const renderer = new BoardRenderer(canvas);
const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function pointFor(event: PointerEvent | WheelEvent): Point {
  const bounds = canvas.getBoundingClientRect();
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
}

function selectedCells(): SimulationCell[] {
  return [...simulation.selectedKeys]
    .map((key) => simulation.cellAt(key))
    .filter((cell): cell is SimulationCell => Boolean(cell));
}

function actionKeys(): string[] {
  if (simulation.selectedKeys.size > 0) return [...simulation.selectedKeys];
  return hoveredKey ? [hoveredKey] : [];
}

function describeCell(cell: SimulationCell): string {
  if (!cell.buildable) return `Cell ${cell.column + 1}.${cell.row + 1}, void and unbuildable.`;
  const ready = cell.things.filter(({ phase }) => phase === "ready").length;
  const growing = cell.things.filter(({ phase }) => phase === "growing").length;
  const waiting = cell.things.length - ready - growing;
  const contents = cell.things.length === 0
    ? "empty"
    : `${plural(waiting, "waiting thing")}, ${plural(growing, "growing thing")}, ${plural(ready, "ready thing")}`;
  const source = cell.generator ? " Timed source present." : "";
  return `Cell ${cell.column + 1}.${cell.row + 1}, ${cell.terrain}, ${Math.round(cell.energy * 100)} percent energy, ${contents}, ${plural(cell.imprints.length, "imprint")}.${source}`;
}

function cursorStartingKey(): string {
  const center = { column: simulation.columns / 2, row: simulation.rows / 2 };
  const occupied = [...simulation.cells.values()]
    .filter(({ things }) => things.length > 0)
    .sort((a, b) => (
      Math.hypot(a.column - center.column, a.row - center.row)
      - Math.hypot(b.column - center.column, b.row - center.row)
    ))[0];
  return occupied?.key ?? hexKey({ column: Math.floor(center.column), row: Math.floor(center.row) });
}

function announceCursor(): void {
  if (!keyboardMode || !hoveredKey) return;
  const cell = simulation.cellAt(hoveredKey);
  if (cell) mapAnnouncer.textContent = `${describeCell(cell)} Press Enter to select.`;
}

function updateCanvasDescription(): void {
  const selection = simulation.selectedKeys.size === 0
    ? "No cells selected."
    : `${plural(simulation.selectedKeys.size, "cell")} selected.`;
  const cursor = keyboardMode && hoveredKey
    ? ` Cursor: ${describeCell(simulation.cellAt(hoveredKey) ?? simulation.cellAt(cursorStartingKey())!)}`
    : "";
  canvas.setAttribute(
    "aria-label",
    `Realtime hex growth map. ${selection}${cursor} Use arrow keys to move, Enter to select, A to seed, and D to clear.`,
  );
}

function renderSelection(): void {
  const cells = selectedCells();
  selectionStatus.textContent = cells.length === 0 ? "Watching grid" : `${cells.length} armed`;
  selectionStatus.className = `status-pill${cells.length > 0 ? " armed" : ""}`;

  if (cells.length === 0) {
    selectionContent.innerHTML = `
      <div class="empty-selection">
        <span class="empty-symbol" aria-hidden="true">⌁</span>
        <h2>No cells selected</h2>
        <p>Select a growing shape to arm it. When it turns red, the next world tick picks its mutation.</p>
      </div>
    `;
    return;
  }

  const things = cells.reduce((total, cell) => total + cell.things.length, 0);
  const ready = cells.reduce(
    (total, cell) => total + cell.things.filter(({ phase }) => phase === "ready").length,
    0,
  );
  const imprints = cells.reduce((total, cell) => total + cell.imprints.length, 0);
  const singleCell = cells.length === 1 ? cells[0] : undefined;
  const generation = cells.reduce(
    (highest, cell) => Math.max(highest, ...cell.things.map((thing) => thing.generation), 0),
    0,
  );
  const energy = cells.reduce((total, cell) => total + cell.energy, 0) / cells.length;
  const title = singleCell ? `Cell ${singleCell.column + 1}.${singleCell.row + 1}` : `${cells.length} cells linked`;
  const state = !cells.every(({ buildable }) => buildable)
    ? "Selection includes the void. It cannot hold a seed."
    : ready > 0
      ? "Ready mutation queued for the next 250 ms tick."
      : things > 0
        ? "Selection is armed. Local energy changes how quickly its genome matures."
        : singleCell?.generator
          ? "Timed source selected. It diffuses energy and produces autonomous motes."
          : "Empty cells selected. Press A to seed them."
  const ecology = singleCell
    ? `${singleCell.terrain} terrain · ${singleCell.generator ? "source online" : "ambient field"}`
    : "linked field sample";
  selectionContent.innerHTML = `
    <div class="selection-profile">
      <span class="selection-glyph" aria-hidden="true">${ready > 0 ? "◆" : "◇"}</span>
      <div><span>${ecology}</span><h2>${title}</h2></div>
    </div>
    <p class="selection-note">${state}</p>
    <dl class="selection-stats">
      <div><dt>Things</dt><dd>${things}</dd></div>
      <div><dt>Ready</dt><dd>${ready}</dd></div>
      <div><dt>Energy</dt><dd>${Math.round(energy * 100)}%</dd></div>
      <div><dt>Gen</dt><dd>${generation || "—"}</dd></div>
    </dl>
    <p class="imprint-count">${plural(imprints, "persistent imprint")}</p>
  `;
}

function updateActionPrompt(): void {
  if (simulation.paused) {
    actionPrompt.innerHTML = `<strong>World clock paused.</strong> Resume to continue growth and queued picks.`;
    return;
  }

  const cells = selectedCells();
  const ready = cells.reduce(
    (total, cell) => total + cell.things.filter(({ phase }) => phase === "ready").length,
    0,
  );
  if (ready > 0) {
    actionPrompt.innerHTML = `<strong>${plural(ready, "mutation")} ready.</strong> The clock will pick ${ready === 1 ? "it" : "them"} on the next tick.`;
  } else if (cells.some(({ things }) => things.length > 0)) {
    actionPrompt.innerHTML = `<strong>Selection armed.</strong> Growth is continuous; red shapes are picked automatically.`;
  } else if (cells.length > 0) {
    actionPrompt.innerHTML = `<strong>${plural(cells.length, "empty cell")} selected.</strong> Press <kbd>A</kbd> to seed.`;
  } else {
    actionPrompt.innerHTML = `<kbd>Drag</kbd> multi-select <span>·</span> <kbd>Shift</kbd> add <span>·</span> <kbd>Ctrl</kbd> toggle`;
  }
}

function syncCamera(): void {
  zoomValue.textContent = `${renderer.camera.zoomPercent}%`;
  renderer.drawOverview(overviewCanvas, simulation);
}

function syncInterface(): void {
  sampleCount.textContent = String(simulation.samples).padStart(3, "0");
  worldSeed.textContent = simulation.seedLabel;
  thingCount.textContent = String(simulation.thingCount);
  readyCount.textContent = String(simulation.readyCount);
  moteCount.textContent = String(simulation.motes.length);
  sourceCount.textContent = String(simulation.generatorCount);
  energyValue.textContent = `${Math.round(simulation.averageEnergy * 100)}%`;
  tickCount.textContent = String(simulation.ticks).padStart(5, "0");
  clockIndicator.className = `clock-indicator${simulation.paused ? " paused" : ""}`;
  clockLabel.textContent = simulation.paused ? "PAUSED" : `LIVE · ${1000 / TICK_MS} HZ`;
  pauseButton.innerHTML = simulation.paused
    ? `Resume <span aria-hidden="true">▶</span>`
    : `Pause <span aria-hidden="true">Ⅱ</span>`;
  pauseButton.setAttribute("aria-pressed", String(simulation.paused));
  renderSelection();
  updateActionPrompt();
  activityLog.innerHTML = simulation.activity
    .map((message, index) => `<li class="${index === 0 ? "latest" : ""}"><i></i><span>${message}</span></li>`)
    .join("");
  updateCanvasDescription();
  syncCamera();
}

function showToast(message: string): void {
  window.clearTimeout(toastTimer);
  statusToast.textContent = message;
  statusToast.classList.add("visible");
  toastTimer = window.setTimeout(() => statusToast.classList.remove("visible"), 1500);
}

function selectCell(cell: SimulationCell, mode: SelectionMode): void {
  simulation.selectCell(cell.key, mode);
  syncInterface();
}

function moveKeyboardCursor(key: "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown"): void {
  const current = simulation.cellAt(hoveredKey ?? cursorStartingKey());
  if (!current) return;

  let destination = key === "ArrowLeft"
    ? simulation.cellAt({ column: current.column - 1, row: current.row })
    : key === "ArrowRight"
      ? simulation.cellAt({ column: current.column + 1, row: current.row })
      : undefined;

  if (!destination && (key === "ArrowUp" || key === "ArrowDown")) {
    const targetRow = current.row + (key === "ArrowUp" ? -1 : 1);
    const visualColumn = current.column + 0.5 * (current.row & 1);
    destination = simulation.cellAt({
      column: Math.round(visualColumn - 0.5 * (targetRow & 1)),
      row: targetRow,
    });
  }

  if (destination) hoveredKey = destination.key;
  updateCanvasDescription();
  announceCursor();
}

function runSeedAction(): void {
  const keys = actionKeys();
  if (keys.length === 0) {
    showToast("SELECT OR HOVER A CELL");
    return;
  }
  const seeded = simulation.seedCells(keys);
  syncInterface();
  showToast(seeded > 0 ? `SEEDED ${plural(seeded, "THING").toUpperCase()}` : "NO OPEN SEED SLOTS");
}

function runClearAction(): void {
  const keys = actionKeys();
  if (keys.length === 0) {
    showToast("SELECT OR HOVER A CELL");
    return;
  }
  const cleared = simulation.clearCells(keys);
  syncInterface();
  showToast(cleared > 0 ? `CLEARED ${plural(cleared, "CELL").toUpperCase()}` : "NOTHING TO CLEAR");
}

function togglePause(): void {
  simulation.setPaused(!simulation.paused);
  previousFrame = performance.now();
  syncInterface();
  showToast(simulation.paused ? "WORLD CLOCK PAUSED" : "WORLD CLOCK LIVE");
}

function resetWorld(): void {
  simulation = new Simulation();
  hoveredKey = null;
  keyboardMode = false;
  pointerInteraction = null;
  renderer.resetCamera(simulation);
  previousFrame = performance.now();
  syncInterface();
  showToast(`NEW WORLD · ${simulation.seedLabel}`);
  canvas.focus();
}

function updateHover(point: Point): void {
  hoveredKey = renderer.cellAtPoint(simulation, point.x, point.y)?.key ?? null;
  canvas.classList.toggle("interactive", hoveredKey !== null && !panMode && !spacePressed);
}

canvas.addEventListener("pointerdown", (event) => {
  if (!event.isPrimary || ![0, 1, 2].includes(event.button)) return;
  event.preventDefault();
  canvas.focus();
  keyboardMode = false;
  const point = pointFor(event);
  const shouldPan = event.button === 1 || event.button === 2 || panMode || (spacePressed && event.button === 0);
  const selectionMode: SelectionMode = event.ctrlKey || event.metaKey
    ? "toggle"
    : event.shiftKey
      ? "add"
      : "replace";
  pointerInteraction = {
    pointerId: event.pointerId,
    mode: shouldPan ? "pan" : "select",
    button: event.button,
    selectionMode,
    seenKeys: new Set<string>(),
    lastPoint: point,
    moved: false,
  };
  try {
    canvas.setPointerCapture(event.pointerId);
  } catch {
    // Synthetic pointer events do not have an active browser pointer to capture.
  }
  canvas.classList.toggle("panning", shouldPan);

  if (!shouldPan) {
    const cell = renderer.cellAtPoint(simulation, point.x, point.y);
    if (cell) {
      pointerInteraction.seenKeys.add(cell.key);
      selectCell(cell, selectionMode);
    } else if (selectionMode === "replace") {
      simulation.clearSelection();
      syncInterface();
    }
  }
});

canvas.addEventListener("pointermove", (event) => {
  if (!event.isPrimary) return;
  const point = pointFor(event);
  const interaction = pointerInteraction;
  if (!interaction || interaction.pointerId !== event.pointerId) {
    keyboardMode = false;
    updateHover(point);
    return;
  }

  const horizontal = point.x - interaction.lastPoint.x;
  const vertical = point.y - interaction.lastPoint.y;
  if (Math.abs(horizontal) + Math.abs(vertical) > 1.5) interaction.moved = true;
  interaction.lastPoint = point;

  if (interaction.mode === "pan") {
    renderer.panBy(horizontal, vertical);
    syncCamera();
    return;
  }

  const cell = renderer.cellAtPoint(simulation, point.x, point.y);
  if (!cell || interaction.seenKeys.has(cell.key)) return;
  interaction.seenKeys.add(cell.key);
  const dragMode = interaction.selectionMode === "toggle" ? "toggle" : "add";
  selectCell(cell, dragMode);
});

function finishPointer(event: PointerEvent): void {
  const interaction = pointerInteraction;
  if (!interaction || interaction.pointerId !== event.pointerId) return;
  if (interaction.mode === "pan" && interaction.button === 2 && !interaction.moved) {
    simulation.clearSelection();
    syncInterface();
  }
  pointerInteraction = null;
  canvas.classList.remove("panning");
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  updateHover(pointFor(event));
}

canvas.addEventListener("pointerup", finishPointer);
canvas.addEventListener("pointercancel", finishPointer);
canvas.addEventListener("pointerleave", () => {
  if (pointerInteraction) return;
  hoveredKey = null;
  canvas.classList.remove("interactive");
});
canvas.addEventListener("contextmenu", (event) => event.preventDefault());

canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  const point = pointFor(event);
  renderer.zoomAt(Math.exp(-event.deltaY * 0.0012), point);
  updateHover(point);
  syncCamera();
}, { passive: false });

canvas.addEventListener("keydown", (event) => {
  keyboardMode = true;
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
    event.preventDefault();
    moveKeyboardCursor(event.key as "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown");
    return;
  }
  if (event.key === "Enter" && hoveredKey) {
    event.preventDefault();
    const mode: SelectionMode = event.ctrlKey || event.metaKey ? "toggle" : event.shiftKey ? "add" : "replace";
    const cell = simulation.cellAt(hoveredKey);
    if (cell) selectCell(cell, mode);
    announceCursor();
    return;
  }
  if (event.key.toLowerCase() === "a") {
    event.preventDefault();
    runSeedAction();
    return;
  }
  if (event.key.toLowerCase() === "d") {
    event.preventDefault();
    runClearAction();
    return;
  }
  if (event.key.toLowerCase() === "p") {
    event.preventDefault();
    togglePause();
    return;
  }
  if (event.key === "0") {
    event.preventDefault();
    renderer.resetCamera(simulation);
    syncCamera();
    return;
  }
  if (event.key === "Escape") {
    simulation.clearSelection();
    syncInterface();
    return;
  }
  if (event.key === " ") {
    event.preventDefault();
    spacePressed = true;
    canvas.classList.add("pan-ready");
  }
});

window.addEventListener("keyup", (event) => {
  if (event.key !== " ") return;
  spacePressed = false;
  canvas.classList.remove("pan-ready");
});

window.addEventListener("blur", () => {
  spacePressed = false;
  canvas.classList.remove("pan-ready", "panning");
});

canvas.addEventListener("focus", () => {
  keyboardMode = true;
  hoveredKey ??= cursorStartingKey();
  updateCanvasDescription();
  announceCursor();
});

seedButton.addEventListener("click", runSeedAction);
clearButton.addEventListener("click", runClearAction);
pauseButton.addEventListener("click", togglePause);
resetButton.addEventListener("click", resetWorld);

function zoomFromCenter(factor: number): void {
  renderer.zoomAt(factor, { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 });
  syncCamera();
}

zoomOutButton.addEventListener("click", () => zoomFromCenter(0.82));
zoomInButton.addEventListener("click", () => zoomFromCenter(1.22));
cameraResetButton.addEventListener("click", () => {
  renderer.resetCamera(simulation);
  syncCamera();
  showToast("CAMERA RECENTERED");
});
panModeButton.addEventListener("click", () => {
  panMode = !panMode;
  panModeButton.setAttribute("aria-pressed", String(panMode));
  panModeButton.classList.toggle("active", panMode);
  canvas.classList.toggle("pan-ready", panMode);
});

overviewCanvas.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  const bounds = overviewCanvas.getBoundingClientRect();
  const column = Math.max(0, Math.min(
    simulation.columns - 1,
    Math.floor(((event.clientX - bounds.left) / bounds.width) * simulation.columns),
  ));
  const row = Math.max(0, Math.min(
    simulation.rows - 1,
    Math.floor(((event.clientY - bounds.top) / bounds.height) * simulation.rows),
  ));
  renderer.centerOn({ column, row });
  hoveredKey = hexKey({ column, row });
  syncCamera();
  showToast(`CAMERA · ${column + 1}.${row + 1}`);
});
overviewCanvas.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  renderer.resetCamera(simulation);
  syncCamera();
  showToast("CAMERA RECENTERED");
});

const resizeObserver = new ResizeObserver(() => {
  renderer.resize(simulation);
  syncCamera();
});
resizeObserver.observe(canvasWrap);

function frame(time: number): void {
  const elapsed = Math.min(1000, Math.max(0, time - previousFrame));
  previousFrame = time;
  const processedTicks = simulation.advance(elapsed);
  renderer.draw(simulation, hoveredKey, time, !reducedMotionQuery.matches && !simulation.paused);

  if (processedTicks > 0) syncInterface();
  framesSinceSample += 1;
  const fpsElapsed = time - fpsStart;
  if (fpsElapsed >= 500) {
    fpsValue.textContent = String(Math.round((framesSinceSample * 1000) / fpsElapsed));
    framesSinceSample = 0;
    fpsStart = time;
  }
  window.requestAnimationFrame(frame);
}

renderer.resize(simulation);
syncInterface();
window.requestAnimationFrame(frame);
