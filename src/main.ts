import "./styles.css";
import { Game, ROLE_DETAILS, SIGNAL_TARGET, type Team, type Unit } from "./game";
import { hexKey } from "./hex";
import { BoardRenderer } from "./renderer";

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing required element: #${id}`);
  return found as T;
}

const canvas = element<HTMLCanvasElement>("game-canvas");
const canvasWrap = element<HTMLDivElement>("canvas-wrap");
const roundValue = element<HTMLSpanElement>("round-value");
const playerScore = element<HTMLSpanElement>("player-score");
const enemyScore = element<HTMLSpanElement>("enemy-score");
const relayCount = element<HTMLSpanElement>("relay-count");
const relayList = element<HTMLDivElement>("relay-list");
const selectionContent = element<HTMLDivElement>("selection-content");
const unitStatus = element<HTMLSpanElement>("unit-status");
const activityLog = element<HTMLOListElement>("activity-log");
const actionPrompt = element<HTMLParagraphElement>("action-prompt");
const endTurnButton = element<HTMLButtonElement>("end-turn-button");
const resetButton = element<HTMLButtonElement>("reset-button");
const playAgainButton = element<HTMLButtonElement>("play-again-button");
const resultOverlay = element<HTMLDivElement>("result-overlay");
const resultIcon = element<HTMLSpanElement>("result-icon");
const resultKicker = element<HTMLSpanElement>("result-kicker");
const resultTitle = element<HTMLHeadingElement>("result-title");
const resultMessage = element<HTMLParagraphElement>("result-message");
const turnToast = element<HTMLDivElement>("turn-toast");
const mapAnnouncer = element<HTMLDivElement>("map-announcer");

let game = new Game();
let hoveredKey: string | null = null;
let keyboardMode = false;
let toastTimer = 0;
let animationFrame: number | null = null;
const renderer = new BoardRenderer(canvas);
const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

function teamLabel(team: Team | null): string {
  if (team === "player") return "Northstar";
  if (team === "enemy") return "Redline";
  return "Neutral";
}

function cursorStartingKey(): string | null {
  if (game.selectedUnit) return hexKey(game.selectedUnit);
  const firstPlayerUnit = game.units.find(({ team }) => team === "player");
  return firstPlayerUnit ? hexKey(firstPlayerUnit) : game.cells.keys().next().value ?? null;
}

function describeCell(key: string): string {
  const cell = game.cellAt(key);
  if (!cell) return "Unknown sector.";
  const unit = game.unitAt(key);
  const relay = cell.relay;
  const contents = unit
    ? `${teamLabel(unit.team)} ${ROLE_DETAILS[unit.role].label} ${unit.callsign}, ${unit.health} integrity.`
    : "Empty.";
  const relayDescription = relay ? `${relay.name} relay, ${teamLabel(relay.owner)} controlled.` : "";
  return `Sector ${cell.column + 1}.${cell.row + 1}, ${cell.terrain}. ${contents} ${relayDescription}`.trim();
}

function announceKeyboardCursor(): void {
  if (!keyboardMode || !hoveredKey) return;
  mapAnnouncer.textContent = `${describeCell(hoveredKey)} Press Enter to act.`;
}

function updateCanvasDescription(): void {
  const selected = game.selectedUnit;
  const selectionDescription = selected
    ? `${selected.callsign} selected with ${game.reachableCells(selected).size} movement sectors and ${game.attackableUnits(selected).length} targets available.`
    : "No unit selected.";
  const cursorDescription = keyboardMode && hoveredKey ? ` Cursor: ${describeCell(hoveredKey)}` : "";
  canvas.setAttribute(
    "aria-label",
    `Interactive hex map. ${selectionDescription}${cursorDescription} Use arrow keys to move the cursor and Enter to act.`,
  );
}

function moveKeyboardCursor(key: "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown"): void {
  const currentKey = hoveredKey ?? cursorStartingKey();
  const current = currentKey ? game.cellAt(currentKey) : undefined;
  if (!current) return;

  let destination = key === "ArrowLeft"
    ? game.cellAt({ column: current.column - 1, row: current.row })
    : key === "ArrowRight"
      ? game.cellAt({ column: current.column + 1, row: current.row })
      : undefined;

  if (!destination && (key === "ArrowUp" || key === "ArrowDown")) {
    const targetRow = current.row + (key === "ArrowUp" ? -1 : 1);
    const currentVisualColumn = current.column + 0.5 * (current.row & 1);
    destination = [...game.cells.values()]
      .filter(({ row }) => row === targetRow)
      .sort((a, b) => {
        const aDistance = Math.abs(a.column + 0.5 * (a.row & 1) - currentVisualColumn);
        const bDistance = Math.abs(b.column + 0.5 * (b.row & 1) - currentVisualColumn);
        return aDistance - bDistance || a.column - b.column;
      })[0];
  }

  if (destination) hoveredKey = destination.key;
  updateCanvasDescription();
  announceKeyboardCursor();
  renderer.draw(game, hoveredKey, performance.now());
}

function activateCell(key: string): void {
  const previousMessage = game.activity[0];
  game.selectCell(key);
  syncInterface();
  if (game.activity[0] !== previousMessage) showToast(game.activity[0] ?? "ORDER CONFIRMED");
  announceKeyboardCursor();
}

function renderSelection(unit: Unit | null): void {
  if (!unit) {
    unitStatus.textContent = "Awaiting orders";
    unitStatus.className = "status-pill";
    selectionContent.innerHTML = `
      <div class="empty-selection">
        <span class="empty-unit-icon" aria-hidden="true">⌁</span>
        <h2>No unit selected</h2>
        <p>Choose a cyan unit on the field to inspect its range and issue orders.</p>
      </div>
    `;
    return;
  }

  const role = ROLE_DETAILS[unit.role];
  const hasMove = !unit.moved;
  const hasAttack = !unit.attacked;
  unitStatus.textContent = hasMove || hasAttack ? "Ready" : "Orders complete";
  unitStatus.className = `status-pill ${hasMove || hasAttack ? "ready" : "spent"}`;
  selectionContent.innerHTML = `
    <div class="unit-profile">
      <div class="unit-avatar role-${unit.role}" aria-hidden="true">${role.symbol}</div>
      <div>
        <span>${role.label} · ${role.summary}</span>
        <h2>${unit.callsign}</h2>
      </div>
    </div>
    <div class="health-label"><span>Integrity</span><b>${unit.health} / ${unit.maxHealth}</b></div>
    <div class="health-track"><i style="width:${String((unit.health / unit.maxHealth) * 100)}%"></i></div>
    <dl class="unit-stats">
      <div><dt>Move</dt><dd>${unit.movement}</dd></div>
      <div><dt>Range</dt><dd>${unit.range}</dd></div>
      <div><dt>Power</dt><dd>${unit.damage}</dd></div>
    </dl>
    <div class="action-state">
      <span class="${hasMove ? "available" : "used"}"><i>${hasMove ? "✓" : "×"}</i> Move ${hasMove ? "ready" : "used"}</span>
      <span class="${hasAttack ? "available" : "used"}"><i>${hasAttack ? "✓" : "×"}</i> Attack ${hasAttack ? "ready" : "used"}</span>
    </div>
  `;
}

function syncInterface(): void {
  roundValue.textContent = String(game.round).padStart(2, "0");
  playerScore.textContent = `${game.playerSignal} / ${SIGNAL_TARGET}`;
  enemyScore.textContent = `${game.enemySignal} / ${SIGNAL_TARGET}`;

  const playerRelays = game.relays.filter(({ owner }) => owner === "player").length;
  relayCount.textContent = `${playerRelays} / ${game.relays.length} held`;
  relayList.innerHTML = game.relays
    .map((relay, index) => `
      <div class="relay-item ${relay.owner ?? "neutral"}">
        <span class="relay-index">0${index + 1}</span>
        <span class="relay-glyph" aria-hidden="true"><i></i></span>
        <span><b>${relay.name}</b><small>${teamLabel(relay.owner)} link</small></span>
        <i class="relay-owner"></i>
      </div>
    `)
    .join("");

  renderSelection(game.selectedUnit);
  activityLog.innerHTML = game.activity
    .map((message, index) => `<li class="${index === 0 ? "latest" : ""}"><i></i><span>${message}</span></li>`)
    .join("");

  const selected = game.selectedUnit;
  if (selected) {
    const moves = game.reachableCells(selected).size;
    const targets = game.attackableUnits(selected).length;
    actionPrompt.innerHTML = targets > 0
      ? `<strong>${targets} target${targets === 1 ? "" : "s"} in range.</strong> Select a red outlined unit to strike.`
      : moves > 0
        ? `<strong>${moves} sectors in range.</strong> Select a cyan outlined hex to advance.`
        : "This unit has no available orders. Select another unit or end the turn.";
  } else {
    actionPrompt.innerHTML = `<kbd>1</kbd> Select a unit <span>→</span> <kbd>2</kbd> Move or attack <span>→</span> <kbd>3</kbd> End turn`;
  }

  endTurnButton.disabled = game.status !== "playing";
  updateCanvasDescription();

  if (game.status !== "playing") showResult();
  renderer.draw(game, hoveredKey, performance.now());
}

function showToast(message: string): void {
  window.clearTimeout(toastTimer);
  turnToast.textContent = message;
  turnToast.classList.add("visible");
  toastTimer = window.setTimeout(() => turnToast.classList.remove("visible"), 1700);
}

function showResult(): void {
  const won = game.status === "playerWon";
  resultOverlay.hidden = false;
  resultOverlay.className = `result-overlay ${won ? "victory" : "defeat"}`;
  resultIcon.textContent = won ? "✦" : "×";
  resultKicker.textContent = won ? "Mission complete" : "Connection lost";
  resultTitle.textContent = won ? "Frontier secured" : "Signal intercepted";
  resultMessage.textContent = game.resultMessage;
  window.setTimeout(() => playAgainButton.focus(), 100);
}

function resetGame(): void {
  game = new Game();
  hoveredKey = null;
  keyboardMode = false;
  resultOverlay.hidden = true;
  resultOverlay.className = "result-overlay";
  renderer.resize(game);
  syncInterface();
  showToast("OPERATION RESTARTED");
  canvas.focus();
}

function pointerPosition(event: PointerEvent): { x: number; y: number } {
  const bounds = canvas.getBoundingClientRect();
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
}

canvas.addEventListener("pointermove", (event) => {
  const wasKeyboardMode = keyboardMode;
  keyboardMode = false;
  const { x, y } = pointerPosition(event);
  const nextHoveredKey = renderer.cellAtPoint(game, x, y)?.key ?? null;
  if (nextHoveredKey !== hoveredKey) {
    hoveredKey = nextHoveredKey;
    renderer.draw(game, hoveredKey, performance.now());
  }
  if (wasKeyboardMode) updateCanvasDescription();
  canvas.classList.toggle("interactive", hoveredKey !== null);
});

canvas.addEventListener("pointerleave", () => {
  hoveredKey = null;
  canvas.classList.remove("interactive");
  renderer.draw(game, hoveredKey, performance.now());
});

canvas.addEventListener("pointerup", (event) => {
  if (!event.isPrimary || event.button !== 0) return;
  keyboardMode = false;
  const { x, y } = pointerPosition(event);
  const cell = renderer.cellAtPoint(game, x, y);
  if (!cell) return;
  activateCell(cell.key);
});

canvas.addEventListener("keydown", (event) => {
  keyboardMode = true;
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
    event.preventDefault();
    moveKeyboardCursor(event.key as "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown");
    return;
  }
  if ((event.key === "Enter" || event.key === " ") && hoveredKey) {
    event.preventDefault();
    activateCell(hoveredKey);
    return;
  }
  if (event.key === "Escape") {
    game.selectedUnitId = null;
    syncInterface();
    announceKeyboardCursor();
  }
});

canvas.addEventListener("focus", () => {
  keyboardMode = true;
  hoveredKey ??= cursorStartingKey();
  updateCanvasDescription();
  announceKeyboardCursor();
  renderer.draw(game, hoveredKey, performance.now());
});

endTurnButton.addEventListener("click", () => {
  const priorRound = game.round;
  game.endPlayerTurn();
  syncInterface();
  if (game.status === "playing" && game.round > priorRound) showToast(`ROUND ${String(game.round).padStart(2, "0")} · NORTHSTAR`);
});

resetButton.addEventListener("click", resetGame);
playAgainButton.addEventListener("click", resetGame);

const resizeObserver = new ResizeObserver(() => {
  renderer.resize(game);
  renderer.draw(game, hoveredKey, performance.now());
});
resizeObserver.observe(canvasWrap);

function frame(time: number): void {
  renderer.draw(game, hoveredKey, time);
  animationFrame = window.requestAnimationFrame(frame);
}

function syncAnimationPreference(): void {
  if (reducedMotionQuery.matches) {
    if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
    animationFrame = null;
    renderer.draw(game, hoveredKey, performance.now());
  } else if (animationFrame === null) {
    animationFrame = window.requestAnimationFrame(frame);
  }
}

renderer.resize(game);
syncInterface();
reducedMotionQuery.addEventListener("change", syncAnimationPreference);
syncAnimationPreference();
