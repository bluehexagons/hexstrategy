import "./styles.css";
import { hexKey } from "./hex";
import { BoardRenderer, type Point } from "./renderer";
import { Simulation, TICK_MS, type SelectionMode, type SimulationCell } from "./simulation";

function element<T extends HTMLElement>(id: string, type: { new (): T }): T {
  const found = document.getElementById(id);
  if (!(found instanceof type)) throw new Error(`Missing or incorrect element: #${id}`);
  return found;
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

interface TouchContact {
  readonly pointerId: number;
  readonly startPoint: Point;
  lastPoint: Point;
  moved: boolean;
  suppressTap: boolean;
}

interface PinchGesture {
  readonly midpoint: Point;
  readonly distance: number;
}

const canvas = element("game-canvas", HTMLCanvasElement);
const overviewCanvas = element("overview-canvas", HTMLCanvasElement);
const canvasWrap = element("canvas-wrap", HTMLDivElement);
const sampleCount = element("sample-count", HTMLElement);
const worldSeed = element("world-seed", HTMLElement);
const thingCount = element("thing-count", HTMLElement);
const readyCount = element("ready-count", HTMLElement);
const moteCount = element("mote-count", HTMLElement);
const sourceCount = element("source-count", HTMLElement);
const energyValue = element("energy-value", HTMLElement);
const tickCount = element("tick-count", HTMLElement);
const fpsValue = element("fps-value", HTMLElement);
const clockIndicator = element("clock-indicator", HTMLSpanElement);
const clockLabel = element("clock-label", HTMLSpanElement);
const zoomValue = element("zoom-value", HTMLSpanElement);
const selectionStatus = element("selection-status", HTMLSpanElement);
const selectionContent = element("selection-content", HTMLDivElement);
const activityLog = element("activity-log", HTMLOListElement);
const actionPrompt = element("action-prompt", HTMLParagraphElement);
const cellHint = element("cell-hint", HTMLDivElement);
const seedButton = element("seed-button", HTMLButtonElement);
const pulseButton = element("pulse-button", HTMLButtonElement);
const clearButton = element("clear-button", HTMLButtonElement);
const pauseButton = element("pause-button", HTMLButtonElement);
const resetButton = element("reset-button", HTMLButtonElement);
const zoomOutButton = element("zoom-out-button", HTMLButtonElement);
const zoomInButton = element("zoom-in-button", HTMLButtonElement);
const cameraResetButton = element("camera-reset-button", HTMLButtonElement);
const selectionModeButton = element("selection-mode-button", HTMLButtonElement);
const statusToast = element("status-toast", HTMLDivElement);
const mapAnnouncer = element("map-announcer", HTMLDivElement);

let simulation = new Simulation();
let hoveredKey: string | null = null;
let keyboardMode = false;
let multiSelectMode = false;
let spacePressed = false;
let pointerInteraction: PointerInteraction | null = null;
const touchContacts = new Map<number, TouchContact>();
let pinchGesture: PinchGesture | null = null;
let toastTimer = 0;
let previousFrame = performance.now();
let fpsStart = previousFrame;
let framesSinceSample = 0;
const renderer = new BoardRenderer(canvas);
const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const coarsePointerQuery = window.matchMedia("(any-pointer: coarse)");

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
  const contents =
    cell.things.length === 0
      ? "empty"
      : `${plural(waiting, "waiting thing")}, ${plural(growing, "growing thing")}, ${plural(ready, "ready thing")}`;
  const source = cell.generator ? " Timed source present." : "";
  return `Cell ${cell.column + 1}.${cell.row + 1}, ${cell.terrain}, ${Math.round(cell.energy * 100)} percent energy, ${contents}, ${plural(cell.imprints.length, "imprint")}.${source}`;
}

function cursorStartingKey(): string {
  const center = { column: simulation.columns / 2, row: simulation.rows / 2 };
  const occupied = [...simulation.cells.values()]
    .filter(({ things }) => things.length > 0)
    .toSorted(
      (a, b) =>
        Math.hypot(a.column - center.column, a.row - center.row) -
        Math.hypot(b.column - center.column, b.row - center.row),
    )[0];
  return (
    occupied?.key ?? hexKey({ column: Math.floor(center.column), row: Math.floor(center.row) })
  );
}

function announceCursor(): void {
  if (!keyboardMode || !hoveredKey) return;
  const cell = simulation.cellAt(hoveredKey);
  if (cell) mapAnnouncer.textContent = `${describeCell(cell)} Press Enter to select.`;
}

function updateCanvasDescription(): void {
  const selection =
    simulation.selectedKeys.size === 0
      ? "No cells selected."
      : `${plural(simulation.selectedKeys.size, "cell")} selected.`;
  const cursor =
    keyboardMode && hoveredKey
      ? ` Cursor: ${describeCell(simulation.cellAt(hoveredKey) ?? simulation.cellAt(cursorStartingKey())!)}`
      : "";
  canvas.setAttribute(
    "aria-label",
    coarsePointerQuery.matches
      ? `Realtime hex growth map. ${selection}${cursor} Tap to select, drag to pan, pinch to zoom, and use the on-screen action buttons.`
      : `Realtime hex growth map. ${selection}${cursor} Use arrow keys to move, Enter to select, A to seed, S to pulse, and D to clear.`,
  );
}

function renderSelection(): void {
  const cells = selectedCells();
  selectionStatus.textContent = cells.length === 0 ? "Watching grid" : `${cells.length} selected`;
  selectionStatus.className = `status-pill${cells.length > 0 ? " armed" : ""}`;

  if (cells.length === 0) {
    selectionContent.innerHTML = `
      <div class="empty-selection">
        <span class="empty-symbol" aria-hidden="true">⌁</span>
        <h2>No cells selected</h2>
        <p>${coarsePointerQuery.matches ? "Tap" : "Click"} any hex, including empty cells and sources. Seed an empty cell, pulse a source or growth, or select a red shape to pick its next form.</p>
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
  const title = singleCell
    ? `Cell ${singleCell.column + 1}.${singleCell.row + 1}`
    : `${cells.length} cells linked`;
  const state = !cells.every(({ buildable }) => buildable)
    ? "Selection includes a void. Void cells cannot be seeded or pulsed."
    : ready > 0
      ? "Ready mutation queued for the next 250 ms tick."
      : things > 0
        ? "Selection armed. It will be picked when red; Pulse adds energy here and nearby."
        : singleCell?.generator
          ? "Source selected. Pulse it to release a mote and brighten nearby cells."
          : "Empty cells selected. Seed a form or Pulse to energize this area.";
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
    <p class="imprint-count">${plural(imprints, "persistent imprint")} · Seed adds · Pulse spreads energy · Clear removes forms</p>
  `;
}

function updateActionPrompt(): void {
  if (simulation.paused) {
    actionPrompt.innerHTML = `<strong>Clock paused.</strong> Seed, Pulse, and Clear still work; Resume to watch the result.`;
    return;
  }

  const cells = selectedCells();
  const ready = cells.reduce(
    (total, cell) => total + cell.things.filter(({ phase }) => phase === "ready").length,
    0,
  );
  if (ready > 0) {
    actionPrompt.innerHTML = `<strong>${plural(ready, "form")} ready.</strong> The next tick picks ${ready === 1 ? "it" : "them"}; Pulse reaches neighbors.`;
  } else if (cells.some(({ things }) => things.length > 0)) {
    actionPrompt.innerHTML = `<strong>Selection armed.</strong> Pulse adds energy nearby; red forms are picked on the next tick.`;
  } else if (cells.length > 0) {
    actionPrompt.innerHTML = `<strong>${plural(cells.length, "cell")} selected.</strong> Seed a form or Pulse to brighten the area.`;
  } else {
    actionPrompt.innerHTML = coarsePointerQuery.matches
      ? `<strong>Tap any hex</strong> to select, then Seed or Pulse. Drag to pan.`
      : `<strong>Click any hex</strong> to select, then Seed or Pulse. Drag across several.`;
  }
}

function syncCamera(): void {
  zoomValue.textContent = coarsePointerQuery.matches
    ? `${(renderer.camera.zoomPercent / 100).toFixed(1)}×`
    : `${renderer.camera.zoomPercent}%`;
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
    .map(
      (message, index) =>
        `<li class="${index === 0 ? "latest" : ""}"><i></i><span>${message}</span></li>`,
    )
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

  let destination =
    key === "ArrowLeft"
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

function runPulseAction(): void {
  const keys = actionKeys();
  if (keys.length === 0) {
    showToast("SELECT OR HOVER A CELL");
    return;
  }
  const pulsed = simulation.pulseCells(keys);
  syncInterface();
  showToast(
    pulsed > 0 ? `PULSED ${plural(pulsed, "CELL").toUpperCase()}` : "VOID CANNOT BE PULSED",
  );
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
  cellHint.classList.remove("visible");
  keyboardMode = false;
  pointerInteraction = null;
  touchContacts.clear();
  pinchGesture = null;
  multiSelectMode = false;
  selectionModeButton.setAttribute("aria-pressed", "false");
  selectionModeButton.classList.remove("active");
  selectionModeButton.querySelector("span")!.textContent = "Multi";
  renderer.resetCamera(simulation);
  previousFrame = performance.now();
  syncInterface();
  showToast(`NEW WORLD · ${simulation.seedLabel}`);
  canvas.focus();
}

function updateHover(point: Point): void {
  hoveredKey = renderer.cellAtPoint(simulation, point.x, point.y)?.key ?? null;
  canvas.classList.toggle("interactive", hoveredKey !== null && !spacePressed);
  const cell = hoveredKey ? simulation.cellAt(hoveredKey) : undefined;
  const contents = !cell?.buildable
    ? "void"
    : cell.things.some(({ phase }) => phase === "ready")
      ? "ready"
      : cell.generator
        ? "source"
        : cell.things.length > 0
          ? "form"
          : "empty";
  cellHint.textContent = cell
    ? `${cell.column + 1}.${cell.row + 1} · ${cell.terrain} · ${contents} · click to select`
    : "";
  cellHint.classList.toggle("visible", Boolean(cell));
}

function capturePointer(pointerId: number): void {
  try {
    canvas.setPointerCapture(pointerId);
  } catch {
    // Synthetic pointer events do not have an active browser pointer to capture.
  }
}

function releasePointer(pointerId: number): void {
  if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
}

function currentPinch(): PinchGesture | null {
  const contacts = [...touchContacts.values()];
  const first = contacts[0];
  const second = contacts[1];
  if (!first || !second) return null;
  return {
    midpoint: {
      x: (first.lastPoint.x + second.lastPoint.x) / 2,
      y: (first.lastPoint.y + second.lastPoint.y) / 2,
    },
    distance: Math.max(
      1,
      Math.hypot(second.lastPoint.x - first.lastPoint.x, second.lastPoint.y - first.lastPoint.y),
    ),
  };
}

function beginTouch(event: PointerEvent): void {
  event.preventDefault();
  keyboardMode = false;
  hoveredKey = null;
  const point = pointFor(event);
  touchContacts.set(event.pointerId, {
    pointerId: event.pointerId,
    startPoint: point,
    lastPoint: point,
    moved: false,
    suppressTap: false,
  });
  capturePointer(event.pointerId);
  if (touchContacts.size >= 2) {
    for (const contact of touchContacts.values()) contact.suppressTap = true;
    pinchGesture = currentPinch();
    canvas.classList.add("panning");
  }
}

function moveTouch(event: PointerEvent): void {
  const contact = touchContacts.get(event.pointerId);
  if (!contact) return;
  event.preventDefault();
  const point = pointFor(event);
  const horizontal = point.x - contact.lastPoint.x;
  const vertical = point.y - contact.lastPoint.y;
  contact.lastPoint = point;
  if (Math.hypot(point.x - contact.startPoint.x, point.y - contact.startPoint.y) > 8) {
    contact.moved = true;
    contact.suppressTap = true;
  }

  if (touchContacts.size >= 2) {
    const nextPinch = currentPinch();
    if (pinchGesture && nextPinch) {
      renderer.panBy(
        nextPinch.midpoint.x - pinchGesture.midpoint.x,
        nextPinch.midpoint.y - pinchGesture.midpoint.y,
      );
      renderer.zoomAt(nextPinch.distance / pinchGesture.distance, nextPinch.midpoint);
      syncCamera();
    }
    pinchGesture = nextPinch;
    return;
  }

  if (contact.moved) {
    renderer.panBy(horizontal, vertical);
    canvas.classList.add("panning");
    syncCamera();
  }
}

function finishTouch(event: PointerEvent, cancelled = false): void {
  const contact = touchContacts.get(event.pointerId);
  if (!contact) return;
  event.preventDefault();
  const point = pointFor(event);
  touchContacts.delete(event.pointerId);
  releasePointer(event.pointerId);

  if (touchContacts.size < 2) pinchGesture = null;
  for (const remaining of touchContacts.values()) {
    remaining.suppressTap = true;
  }
  if (touchContacts.size === 0) canvas.classList.remove("panning");

  if (!cancelled && !contact.moved && !contact.suppressTap) {
    const cell = renderer.cellAtPoint(simulation, point.x, point.y);
    if (cell) {
      const wasSelected = simulation.selectedKeys.has(cell.key);
      selectCell(cell, multiSelectMode ? "toggle" : "replace");
      showToast(
        multiSelectMode
          ? wasSelected
            ? "CELL REMOVED"
            : "CELL ADDED"
          : `CELL ${cell.column + 1}.${cell.row + 1}`,
      );
    } else if (!multiSelectMode) {
      simulation.clearSelection();
      syncInterface();
    }
  }
}

canvas.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "touch") {
    beginTouch(event);
    return;
  }
  if (!event.isPrimary || ![0, 1, 2].includes(event.button)) return;
  event.preventDefault();
  canvas.focus();
  keyboardMode = false;
  const point = pointFor(event);
  const shouldPan =
    event.button === 1 || event.button === 2 || (spacePressed && event.button === 0);
  const selectionMode: SelectionMode =
    event.ctrlKey || event.metaKey
      ? "toggle"
      : multiSelectMode
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
  capturePointer(event.pointerId);
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
  if (event.pointerType === "touch") {
    moveTouch(event);
    return;
  }
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
  if (event.pointerType === "touch") {
    finishTouch(event);
    return;
  }
  const interaction = pointerInteraction;
  if (!interaction || interaction.pointerId !== event.pointerId) return;
  if (interaction.mode === "pan" && interaction.button === 2 && !interaction.moved) {
    simulation.clearSelection();
    syncInterface();
  }
  pointerInteraction = null;
  canvas.classList.remove("panning");
  releasePointer(event.pointerId);
  updateHover(pointFor(event));
}

canvas.addEventListener("pointerup", finishPointer);
canvas.addEventListener("pointercancel", (event) => {
  if (event.pointerType === "touch") finishTouch(event, true);
  else finishPointer(event);
});
canvas.addEventListener("pointerleave", () => {
  if (pointerInteraction || touchContacts.size > 0) return;
  hoveredKey = null;
  canvas.classList.remove("interactive");
  cellHint.classList.remove("visible");
});
canvas.addEventListener("contextmenu", (event) => event.preventDefault());

canvas.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    const point = pointFor(event);
    renderer.zoomAt(Math.exp(-event.deltaY * 0.0012), point);
    updateHover(point);
    syncCamera();
  },
  { passive: false },
);

canvas.addEventListener("keydown", (event) => {
  keyboardMode = true;
  switch (event.key) {
    case "ArrowLeft":
    case "ArrowRight":
    case "ArrowUp":
    case "ArrowDown":
      event.preventDefault();
      moveKeyboardCursor(event.key);
      return;
  }
  if (event.key === "Enter" && hoveredKey) {
    event.preventDefault();
    const mode: SelectionMode =
      event.ctrlKey || event.metaKey ? "toggle" : event.shiftKey ? "add" : "replace";
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
  if (event.key.toLowerCase() === "s") {
    event.preventDefault();
    runPulseAction();
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
  touchContacts.clear();
  pinchGesture = null;
  pointerInteraction = null;
  canvas.classList.remove("pan-ready", "panning");
});

canvas.addEventListener("focus", () => {
  keyboardMode = true;
  hoveredKey ??= cursorStartingKey();
  updateCanvasDescription();
  announceCursor();
});

seedButton.addEventListener("click", runSeedAction);
pulseButton.addEventListener("click", runPulseAction);
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
selectionModeButton.addEventListener("click", () => {
  multiSelectMode = !multiSelectMode;
  selectionModeButton.setAttribute("aria-pressed", String(multiSelectMode));
  selectionModeButton.classList.toggle("active", multiSelectMode);
  showToast(multiSelectMode ? "MULTI-SELECT ON" : "MULTI-SELECT OFF");
});

overviewCanvas.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  const bounds = overviewCanvas.getBoundingClientRect();
  const column = Math.max(
    0,
    Math.min(
      simulation.columns - 1,
      Math.floor(((event.clientX - bounds.left) / bounds.width) * simulation.columns),
    ),
  );
  const row = Math.max(
    0,
    Math.min(
      simulation.rows - 1,
      Math.floor(((event.clientY - bounds.top) / bounds.height) * simulation.rows),
    ),
  );
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
