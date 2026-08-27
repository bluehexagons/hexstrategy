import "./styles.css";
import { Game, ROLE_DETAILS, SIGNAL_TARGET, type Team, type Unit } from "./game";
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

let game = new Game();
let hoveredKey: string | null = null;
let toastTimer = 0;
const renderer = new BoardRenderer(canvas);

function teamLabel(team: Team | null): string {
  if (team === "player") return "Northstar";
  if (team === "enemy") return "Redline";
  return "Neutral";
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
  canvas.setAttribute("aria-label", selected
    ? `${selected.callsign} selected. ${game.reachableCells(selected).size} movement sectors and ${game.attackableUnits(selected).length} targets available.`
    : "Interactive hex map. Select a cyan unit to issue orders.");

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
  const { x, y } = pointerPosition(event);
  hoveredKey = renderer.cellAtPoint(game, x, y)?.key ?? null;
  canvas.classList.toggle("interactive", hoveredKey !== null);
});

canvas.addEventListener("pointerleave", () => {
  hoveredKey = null;
  canvas.classList.remove("interactive");
});

canvas.addEventListener("pointerup", (event) => {
  const { x, y } = pointerPosition(event);
  const cell = renderer.cellAtPoint(game, x, y);
  if (!cell) return;
  const previousMessage = game.activity[0];
  game.selectCell(cell.key);
  syncInterface();
  if (game.activity[0] !== previousMessage) showToast(game.activity[0] ?? "ORDER CONFIRMED");
});

canvas.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    game.selectedUnitId = null;
    syncInterface();
  }
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
  window.requestAnimationFrame(frame);
}

renderer.resize(game);
syncInterface();
window.requestAnimationFrame(frame);
