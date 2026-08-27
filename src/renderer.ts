import { ROLE_DETAILS, type Game, type HexCell, type Team, type Terrain, type Unit } from "./game";
import { hexKey, type HexCoordinate } from "./hex";

interface Point {
  readonly x: number;
  readonly y: number;
}

const SQRT_THREE = Math.sqrt(3);
const TERRAIN_COLORS: Readonly<Record<Terrain, { fill: string; stroke: string }>> = {
  plain: { fill: "#132628", stroke: "#264246" },
  forest: { fill: "#16342d", stroke: "#2b5144" },
  ridge: { fill: "#28283a", stroke: "#45455e" },
  water: { fill: "#0b2633", stroke: "#174253" },
};

const TEAM_COLORS: Readonly<Record<Team, { bright: string; dark: string; glow: string }>> = {
  player: { bright: "#72e8ff", dark: "#0b5e70", glow: "rgba(114, 232, 255, 0.5)" },
  enemy: { bright: "#ff716d", dark: "#822f36", glow: "rgba(255, 113, 109, 0.48)" },
};

export class BoardRenderer {
  private readonly context: CanvasRenderingContext2D;
  private width = 1;
  private height = 1;
  private size = 40;
  private origin: Point = { x: 0, y: 0 };

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D rendering is unavailable");
    this.context = context;
  }

  resize(game: Game): void {
    const bounds = this.canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.width = Math.max(bounds.width, 1);
    this.height = Math.max(bounds.height, 1);
    this.canvas.width = Math.round(this.width * ratio);
    this.canvas.height = Math.round(this.height * ratio);
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);

    const padding = Math.max(26, Math.min(this.width, this.height) * 0.065);
    const rawCenters = [...game.cells.values()].map((cell) => this.rawCenter(cell));
    const minimumX = Math.min(...rawCenters.map(({ x }) => x)) - SQRT_THREE / 2;
    const maximumX = Math.max(...rawCenters.map(({ x }) => x)) + SQRT_THREE / 2;
    const minimumY = Math.min(...rawCenters.map(({ y }) => y)) - 1;
    const maximumY = Math.max(...rawCenters.map(({ y }) => y)) + 1;
    const boardWidth = maximumX - minimumX;
    const boardHeight = maximumY - minimumY;
    this.size = Math.min((this.width - padding * 2) / boardWidth, (this.height - padding * 2) / boardHeight);
    this.origin = {
      x: (this.width - boardWidth * this.size) / 2 - minimumX * this.size,
      y: (this.height - boardHeight * this.size) / 2 - minimumY * this.size,
    };
  }

  draw(game: Game, hoveredKey: string | null, time: number): void {
    const context = this.context;
    context.clearRect(0, 0, this.width, this.height);

    const selected = game.selectedUnit;
    const moves = selected ? game.reachableCells(selected) : new Map<string, number>();
    const attackableIds = new Set(selected ? game.attackableUnits(selected).map(({ id }) => id) : []);

    for (const cell of game.cells.values()) {
      this.drawCell(cell, {
        hovered: cell.key === hoveredKey,
        selected: selected ? hexKey(selected) === cell.key : false,
        reachable: moves.has(cell.key),
        attackable: Boolean(game.unitAt(cell.key) && attackableIds.has(game.unitAt(cell.key)?.id ?? "")),
      }, time);
    }

    for (const unit of game.units) this.drawUnit(unit, unit.id === selected?.id, attackableIds.has(unit.id), time);
  }

  cellAtPoint(game: Game, x: number, y: number): HexCell | null {
    for (const cell of game.cells.values()) {
      this.hexPath(this.center(cell), this.size * 0.96);
      if (this.context.isPointInPath(x, y)) return cell;
    }
    return null;
  }

  private drawCell(
    cell: HexCell,
    state: { hovered: boolean; selected: boolean; reachable: boolean; attackable: boolean },
    time: number,
  ): void {
    const context = this.context;
    const center = this.center(cell);
    const palette = TERRAIN_COLORS[cell.terrain];

    context.save();
    this.hexPath(center, this.size * 0.965);
    context.fillStyle = palette.fill;
    context.fill();
    context.strokeStyle = palette.stroke;
    context.lineWidth = Math.max(1, this.size * 0.035);
    context.stroke();

    this.drawTerrainDetail(cell, center);

    if (cell.relay) this.drawRelay(cell, center, time);

    if (state.reachable) {
      this.hexPath(center, this.size * 0.84);
      context.fillStyle = "rgba(114, 232, 255, 0.14)";
      context.fill();
      context.strokeStyle = "rgba(114, 232, 255, 0.7)";
      context.lineWidth = Math.max(1.5, this.size * 0.045);
      context.setLineDash([this.size * 0.11, this.size * 0.09]);
      context.stroke();
      context.setLineDash([]);
    }

    if (state.selected || state.attackable || state.hovered) {
      this.hexPath(center, this.size * (state.selected ? 0.9 : 0.86));
      context.strokeStyle = state.attackable ? "#ff716d" : state.selected ? "#72e8ff" : "rgba(255,255,255,0.52)";
      context.lineWidth = state.selected ? Math.max(2, this.size * 0.07) : Math.max(1.5, this.size * 0.04);
      context.stroke();
    }
    context.restore();
  }

  private drawTerrainDetail(cell: HexCell, center: Point): void {
    const context = this.context;
    const size = this.size;
    context.save();
    context.globalAlpha = 0.38;
    context.lineWidth = Math.max(1, size * 0.025);

    if (cell.terrain === "forest") {
      context.strokeStyle = "#6b9c70";
      for (const offset of [-0.25, 0.12, 0.31]) {
        const x = center.x + size * offset;
        const y = center.y + size * (offset === 0.12 ? -0.25 : 0.12);
        context.beginPath();
        context.moveTo(x, y - size * 0.16);
        context.lineTo(x - size * 0.11, y + size * 0.08);
        context.lineTo(x + size * 0.11, y + size * 0.08);
        context.closePath();
        context.stroke();
      }
    } else if (cell.terrain === "ridge") {
      context.strokeStyle = "#9d9bb5";
      context.beginPath();
      context.moveTo(center.x - size * 0.42, center.y + size * 0.2);
      context.lineTo(center.x - size * 0.1, center.y - size * 0.24);
      context.lineTo(center.x + size * 0.08, center.y + size * 0.02);
      context.lineTo(center.x + size * 0.25, center.y - size * 0.17);
      context.lineTo(center.x + size * 0.43, center.y + size * 0.2);
      context.stroke();
    } else if (cell.terrain === "water") {
      context.strokeStyle = "#4b9ab8";
      for (const offset of [-0.13, 0.13]) {
        context.beginPath();
        context.moveTo(center.x - size * 0.34, center.y + size * offset);
        context.quadraticCurveTo(center.x - size * 0.17, center.y + size * (offset - 0.12), center.x, center.y + size * offset);
        context.quadraticCurveTo(center.x + size * 0.17, center.y + size * (offset + 0.12), center.x + size * 0.34, center.y + size * offset);
        context.stroke();
      }
    }
    context.restore();
  }

  private drawRelay(cell: HexCell, center: Point, time: number): void {
    const relay = cell.relay;
    if (!relay) return;
    const context = this.context;
    const ownerColor = relay.owner ? TEAM_COLORS[relay.owner].bright : "#f0cb62";
    const pulse = 1 + Math.sin(time / 430 + cell.column) * 0.06;

    context.save();
    context.translate(center.x, center.y);
    context.strokeStyle = ownerColor;
    context.fillStyle = `${ownerColor}22`;
    context.lineWidth = Math.max(1.5, this.size * 0.04);
    context.beginPath();
    context.arc(0, 0, this.size * 0.25 * pulse, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.rotate(Math.PI / 4);
    context.strokeRect(-this.size * 0.1, -this.size * 0.1, this.size * 0.2, this.size * 0.2);
    context.restore();
  }

  private drawUnit(unit: Unit, selected: boolean, attackable: boolean, time: number): void {
    const context = this.context;
    const center = this.center(unit);
    const palette = TEAM_COLORS[unit.team];
    const radius = this.size * 0.35;
    const pulse = selected ? 1 + Math.sin(time / 210) * 0.06 : 1;

    context.save();
    context.translate(center.x, center.y);
    context.shadowColor = attackable ? TEAM_COLORS.enemy.glow : palette.glow;
    context.shadowBlur = selected || attackable ? this.size * 0.32 : this.size * 0.14;
    context.beginPath();
    context.arc(0, 0, radius * pulse, 0, Math.PI * 2);
    context.fillStyle = palette.dark;
    context.fill();
    context.lineWidth = Math.max(2, this.size * 0.065);
    context.strokeStyle = palette.bright;
    context.stroke();
    context.shadowBlur = 0;

    context.fillStyle = "#f5fbf9";
    context.font = `700 ${Math.max(11, this.size * 0.3)}px ui-monospace, SFMono-Regular, monospace`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(ROLE_DETAILS[unit.role].symbol, 0, 0.5);

    const barWidth = this.size * 0.72;
    const barHeight = Math.max(3, this.size * 0.07);
    const barY = radius + this.size * 0.15;
    context.fillStyle = "rgba(2, 9, 10, 0.86)";
    context.fillRect(-barWidth / 2, barY, barWidth, barHeight);
    context.fillStyle = unit.health / unit.maxHealth > 0.35 ? palette.bright : "#ffcf5a";
    context.fillRect(-barWidth / 2, barY, barWidth * (unit.health / unit.maxHealth), barHeight);

    if (unit.team === "player" && (unit.moved || unit.attacked)) {
      context.fillStyle = "rgba(5, 15, 17, 0.82)";
      context.beginPath();
      context.arc(radius * 0.72, -radius * 0.72, this.size * 0.11, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "#f0cb62";
      context.font = `700 ${Math.max(8, this.size * 0.16)}px ui-sans-serif`;
      context.fillText(unit.moved && unit.attacked ? "×" : "•", radius * 0.72, -radius * 0.72);
    }
    context.restore();
  }

  private rawCenter({ column, row }: HexCoordinate): Point {
    return { x: SQRT_THREE * (column + 0.5 * (row & 1)), y: 1.5 * row };
  }

  private center(coordinate: HexCoordinate): Point {
    const raw = this.rawCenter(coordinate);
    return { x: this.origin.x + raw.x * this.size, y: this.origin.y + raw.y * this.size };
  }

  private hexPath(center: Point, radius: number): void {
    const context = this.context;
    context.beginPath();
    for (let index = 0; index < 6; index += 1) {
      const angle = (Math.PI / 180) * (60 * index - 30);
      const x = center.x + radius * Math.cos(angle);
      const y = center.y + radius * Math.sin(angle);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.closePath();
  }
}
