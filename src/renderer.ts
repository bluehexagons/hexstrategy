import {
  generatorProgress,
  thingProgress,
  thingRotation,
  thingScale,
  type Generator,
  type Imprint,
  type Mote,
  type Simulation,
  type SimulationCell,
  type Terrain,
  type Thing,
} from "./simulation";
import { hexKey, type HexCoordinate } from "./hex";

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface CameraState {
  readonly zoomPercent: number;
  readonly hexSize: number;
}

export interface ViewBounds {
  readonly minimumColumn: number;
  readonly maximumColumn: number;
  readonly minimumRow: number;
  readonly maximumRow: number;
}

const SQRT_THREE = Math.sqrt(3);
const MINIMUM_HEX_SIZE = 7;
const MAXIMUM_HEX_SIZE = 72;
const STARTING_ZOOM = 2.35;
const TERRAIN_COLORS: Readonly<Record<Terrain, { readonly fill: string; readonly stroke: string }>> = {
  field: { fill: "#141c1c", stroke: "#263130" },
  basin: { fill: "#102024", stroke: "#20383b" },
  ridge: { fill: "#1c1a22", stroke: "#302d38" },
  void: { fill: "#06090a", stroke: "#111617" },
};

export function calculateHexSize(width: number, height: number, boardWidth: number, boardHeight: number): number {
  const shortestSide = Math.max(0, Math.min(width, height));
  const padding = Math.min(38, Math.max(14, shortestSide * 0.06));
  const availableWidth = Math.max(1, width - padding * 2);
  const availableHeight = Math.max(1, height - padding * 2);
  return Math.max(1, Math.min(availableWidth / boardWidth, availableHeight / boardHeight));
}

export function isPointInHex(point: Point, center: Point, radius: number): boolean {
  const horizontalDistance = Math.abs(point.x - center.x);
  const verticalDistance = Math.abs(point.y - center.y);
  return horizontalDistance <= (SQRT_THREE / 2) * radius
    && SQRT_THREE * verticalDistance + horizontalDistance <= SQRT_THREE * radius;
}

export class BoardRenderer {
  private readonly context: CanvasRenderingContext2D;
  private width = 1;
  private height = 1;
  private hexSize = 18;
  private fitSize = 8;
  private origin: Point = { x: 0, y: 0 };
  private initialized = false;
  private overviewTerrain: HTMLCanvasElement | null = null;
  private overviewSeed = -1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D rendering is unavailable");
    this.context = context;
  }

  get camera(): CameraState {
    return {
      zoomPercent: Math.round((this.hexSize / this.fitSize) * 100),
      hexSize: this.hexSize,
    };
  }

  resize(simulation: Simulation): void {
    const previousZoom = this.initialized ? this.hexSize / this.fitSize : STARTING_ZOOM;
    const previousCenter = this.initialized
      ? {
          x: (this.width / 2 - this.origin.x) / this.hexSize,
          y: (this.height / 2 - this.origin.y) / this.hexSize,
        }
      : null;
    const bounds = this.canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.width = Math.max(bounds.width, 1);
    this.height = Math.max(bounds.height, 1);
    this.canvas.width = Math.round(this.width * ratio);
    this.canvas.height = Math.round(this.height * ratio);
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);

    const board = this.boardBounds(simulation);
    this.fitSize = calculateHexSize(this.width, this.height, board.width, board.height);
    if (!previousCenter) {
      this.resetCamera(simulation);
    } else {
      this.hexSize = this.clampHexSize(this.fitSize * previousZoom);
      this.origin = {
        x: this.width / 2 - previousCenter.x * this.hexSize,
        y: this.height / 2 - previousCenter.y * this.hexSize,
      };
    }
    this.initialized = true;
  }

  resetCamera(simulation: Simulation): void {
    const board = this.boardBounds(simulation);
    this.fitSize = calculateHexSize(this.width, this.height, board.width, board.height);
    this.hexSize = this.clampHexSize(this.fitSize * STARTING_ZOOM);
    const center = {
      x: board.minimumX + board.width / 2,
      y: board.minimumY + board.height / 2,
    };
    this.origin = {
      x: this.width / 2 - center.x * this.hexSize,
      y: this.height / 2 - center.y * this.hexSize,
    };
  }

  centerOn(coordinate: HexCoordinate): void {
    const center = this.rawCenter(coordinate);
    this.origin = {
      x: this.width / 2 - center.x * this.hexSize,
      y: this.height / 2 - center.y * this.hexSize,
    };
  }

  panBy(horizontal: number, vertical: number): void {
    this.origin = { x: this.origin.x + horizontal, y: this.origin.y + vertical };
  }

  zoomAt(factor: number, center: Point): void {
    const previousSize = this.hexSize;
    const nextSize = this.clampHexSize(previousSize * factor);
    if (nextSize === previousSize) return;
    const worldX = (center.x - this.origin.x) / previousSize;
    const worldY = (center.y - this.origin.y) / previousSize;
    this.hexSize = nextSize;
    this.origin = {
      x: center.x - worldX * nextSize,
      y: center.y - worldY * nextSize,
    };
  }

  draw(simulation: Simulation, hoveredKey: string | null, time: number, animate = true): void {
    const context = this.context;
    context.clearRect(0, 0, this.width, this.height);
    const pulse = animate ? (Math.sin(time / 220) + 1) / 2 : 0.5;
    const visibleCells = this.visibleCells(simulation);

    for (const cell of visibleCells) {
      this.drawCell(
        cell,
        this.center(cell),
        simulation.selectedKeys.has(cell.key),
        hoveredKey === cell.key,
        pulse,
      );
    }

    for (const cell of visibleCells) {
      const center = this.center(cell);
      if (cell.generator) this.drawGenerator(cell.generator, center, simulation.tickFraction, pulse);
      for (const imprint of cell.imprints) this.drawImprint(imprint, center);
      this.drawThings(cell, center, simulation.tickFraction, pulse);
    }
    this.drawMotes(simulation);
  }

  drawOverview(overview: HTMLCanvasElement, simulation: Simulation): void {
    const bounds = overview.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, bounds.width);
    const height = Math.max(1, bounds.height);
    overview.width = Math.round(width * ratio);
    overview.height = Math.round(height * ratio);
    const context = overview.getContext("2d");
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    context.fillStyle = "rgba(5, 9, 10, 0.92)";
    context.fillRect(0, 0, width, height);

    if (!this.overviewTerrain || this.overviewSeed !== simulation.seed) {
      const terrain = document.createElement("canvas");
      terrain.width = simulation.columns;
      terrain.height = simulation.rows;
      const terrainContext = terrain.getContext("2d");
      if (terrainContext) {
        for (const cell of simulation.cells.values()) {
          terrainContext.fillStyle = cell.terrain === "void"
            ? "#090c0d"
            : cell.terrain === "basin"
              ? "#173137"
              : cell.terrain === "ridge"
                ? "#292632"
                : "#1b2927";
          terrainContext.fillRect(cell.column, cell.row, 1, 1);
        }
      }
      this.overviewTerrain = terrain;
      this.overviewSeed = simulation.seed;
    }
    context.imageSmoothingEnabled = false;
    context.drawImage(this.overviewTerrain, 0, 0, width, height);

    const cellWidth = width / simulation.columns;
    const cellHeight = height / simulation.rows;
    for (const cell of simulation.cells.values()) {
      if (cell.generator) {
        context.fillStyle = "#f0d35f";
        context.fillRect(cell.column * cellWidth, cell.row * cellHeight, Math.max(1, cellWidth), Math.max(1, cellHeight));
      }
      if (cell.things.length > 0) {
        context.fillStyle = cell.things.some(({ phase }) => phase === "ready") ? "#ff6769" : "#63dfd6";
        context.fillRect(cell.column * cellWidth, cell.row * cellHeight, Math.max(1.2, cellWidth), Math.max(1.2, cellHeight));
      }
    }

    const view = this.viewBounds(simulation);
    const x = view.minimumColumn * cellWidth;
    const y = view.minimumRow * cellHeight;
    const viewWidth = (view.maximumColumn - view.minimumColumn + 1) * cellWidth;
    const viewHeight = (view.maximumRow - view.minimumRow + 1) * cellHeight;
    context.strokeStyle = "#b7ef53";
    context.lineWidth = 1;
    context.strokeRect(x + 0.5, y + 0.5, Math.max(1, viewWidth - 1), Math.max(1, viewHeight - 1));
  }

  cellAtPoint(simulation: Simulation, x: number, y: number): SimulationCell | null {
    const rawX = (x - this.origin.x) / this.hexSize;
    const rawY = (y - this.origin.y) / this.hexSize;
    const axialColumn = (SQRT_THREE / 3) * rawX - rawY / 3;
    const axialRow = (2 / 3) * rawY;
    const rounded = this.roundAxial(axialColumn, axialRow);
    const column = rounded.column + (rounded.row - (rounded.row & 1)) / 2;
    const cell = simulation.cellAt({ column, row: rounded.row });
    return cell && isPointInHex({ x, y }, this.center(cell), this.hexSize * 0.98) ? cell : null;
  }

  viewBounds(simulation: Simulation): ViewBounds {
    const rawMinimumY = (-this.hexSize - this.origin.y) / this.hexSize;
    const rawMaximumY = (this.height + this.hexSize - this.origin.y) / this.hexSize;
    const minimumRow = Math.max(0, Math.floor(rawMinimumY / 1.5));
    const maximumRow = Math.min(simulation.rows - 1, Math.ceil(rawMaximumY / 1.5));
    const rawMinimumX = (-this.hexSize - this.origin.x) / this.hexSize;
    const rawMaximumX = (this.width + this.hexSize - this.origin.x) / this.hexSize;
    const minimumColumn = Math.max(0, Math.floor(rawMinimumX / SQRT_THREE - 0.5));
    const maximumColumn = Math.min(simulation.columns - 1, Math.ceil(rawMaximumX / SQRT_THREE));
    return { minimumColumn, maximumColumn, minimumRow, maximumRow };
  }

  private visibleCells(simulation: Simulation): SimulationCell[] {
    const view = this.viewBounds(simulation);
    const visible: SimulationCell[] = [];
    for (let row = view.minimumRow; row <= view.maximumRow; row += 1) {
      const rowOffset = 0.5 * (row & 1);
      const rawMinimumX = (-this.hexSize - this.origin.x) / this.hexSize;
      const rawMaximumX = (this.width + this.hexSize - this.origin.x) / this.hexSize;
      const minimumColumn = Math.max(0, Math.floor(rawMinimumX / SQRT_THREE - rowOffset));
      const maximumColumn = Math.min(simulation.columns - 1, Math.ceil(rawMaximumX / SQRT_THREE - rowOffset));
      for (let column = minimumColumn; column <= maximumColumn; column += 1) {
        const cell = simulation.cellAt(hexKey({ column, row }));
        if (cell) visible.push(cell);
      }
    }
    return visible;
  }

  private drawCell(cell: SimulationCell, center: Point, selected: boolean, hovered: boolean, pulse: number): void {
    const context = this.context;
    const ready = cell.things.some(({ phase }) => phase === "ready");
    const palette = TERRAIN_COLORS[cell.terrain];
    context.save();
    this.hexPath(center, this.hexSize * 0.965);
    context.fillStyle = palette.fill;
    context.fill();
    context.strokeStyle = palette.stroke;
    context.lineWidth = Math.max(0.5, this.hexSize * 0.035);
    context.stroke();

    if (cell.buildable && cell.energy > 0.08) {
      this.hexPath(center, this.hexSize * 0.88);
      context.fillStyle = `rgba(74, 223, 179, ${Math.min(0.13, cell.energy * 0.13)})`;
      context.fill();
    }

    if (!cell.buildable && this.hexSize >= 9) {
      context.strokeStyle = "rgba(235, 92, 91, 0.2)";
      context.lineWidth = Math.max(0.8, this.hexSize * 0.035);
      context.beginPath();
      context.moveTo(center.x - this.hexSize * 0.22, center.y - this.hexSize * 0.22);
      context.lineTo(center.x + this.hexSize * 0.22, center.y + this.hexSize * 0.22);
      context.moveTo(center.x + this.hexSize * 0.22, center.y - this.hexSize * 0.22);
      context.lineTo(center.x - this.hexSize * 0.22, center.y + this.hexSize * 0.22);
      context.stroke();
    }

    if (ready) {
      this.hexPath(center, this.hexSize * (0.82 + pulse * 0.06));
      context.fillStyle = `rgba(255, 82, 85, ${0.11 + pulse * 0.08})`;
      context.fill();
      context.strokeStyle = `rgba(255, 99, 101, ${0.58 + pulse * 0.36})`;
      context.lineWidth = Math.max(1, this.hexSize * 0.055);
      context.stroke();
    }

    if (selected) {
      this.hexPath(center, this.hexSize * 0.87);
      context.fillStyle = "rgba(183, 239, 83, 0.11)";
      context.fill();
      context.strokeStyle = "#b7ef53";
      context.lineWidth = Math.max(1, this.hexSize * 0.06);
      context.setLineDash([this.hexSize * 0.12, this.hexSize * 0.08]);
      context.stroke();
      context.setLineDash([]);
    } else if (hovered) {
      this.hexPath(center, this.hexSize * 0.86);
      context.strokeStyle = "rgba(236, 245, 242, 0.64)";
      context.lineWidth = Math.max(0.8, this.hexSize * 0.04);
      context.stroke();
    }
    context.restore();
  }

  private drawGenerator(generator: Generator, center: Point, tickFraction: number, pulse: number): void {
    const context = this.context;
    const radius = Math.max(2.6, this.hexSize * 0.26);
    const progress = generatorProgress(generator, tickFraction);
    context.save();
    context.translate(center.x, center.y);
    context.rotate(Math.PI / 4);
    context.fillStyle = `hsla(${generator.hue} 78% 46% / ${0.18 + pulse * 0.08})`;
    context.strokeStyle = `hsl(${generator.hue} 88% 72%)`;
    context.lineWidth = Math.max(0.75, this.hexSize * 0.045);
    context.fillRect(-radius, -radius, radius * 2, radius * 2);
    context.strokeRect(-radius, -radius, radius * 2, radius * 2);
    context.restore();

    if (this.hexSize >= 9) {
      context.save();
      context.beginPath();
      context.arc(center.x, center.y, this.hexSize * 0.43, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
      context.strokeStyle = `hsla(${generator.hue} 90% 68% / 0.72)`;
      context.lineWidth = Math.max(1, this.hexSize * 0.055);
      context.stroke();
      context.restore();
    }
  }

  private drawImprint(imprint: Imprint, center: Point): void {
    const context = this.context;
    context.save();
    context.globalAlpha = 0.16;
    context.translate(center.x, center.y);
    context.rotate(imprint.rotation);
    context.scale(imprint.scale, imprint.scale);
    this.shapePath(imprint.shape, this.hexSize * 1.08);
    context.fillStyle = imprint.fill;
    context.fill();
    context.strokeStyle = imprint.stroke;
    context.lineWidth = Math.max(0.6, this.hexSize * 0.025);
    context.stroke();
    context.restore();
  }

  private drawThings(cell: SimulationCell, center: Point, tickFraction: number, pulse: number): void {
    const context = this.context;
    const thingCount = cell.things.length;
    let leadingProgress = 0;

    for (const [index, thing] of cell.things.entries()) {
      const progress = thingProgress(thing, tickFraction);
      leadingProgress = Math.max(leadingProgress, progress);
      const angle = thingCount > 1 ? (index / thingCount) * Math.PI * 2 - Math.PI / 2 : 0;
      const offset = thingCount > 1 ? this.hexSize * 0.17 : 0;
      this.drawThing(thing, {
        x: center.x + Math.cos(angle) * offset,
        y: center.y + Math.sin(angle) * offset,
      }, progress, thingCount > 1 ? 0.72 : 1, pulse);
    }

    if (this.hexSize >= 8 && thingCount > 0 && cell.things.some(({ phase }) => phase === "growing")) {
      const barWidth = this.hexSize * 0.86;
      const barHeight = Math.max(1.5, this.hexSize * 0.07);
      const startX = center.x - barWidth / 2;
      const startY = center.y + this.hexSize * 0.62;
      context.save();
      context.fillStyle = "rgba(3, 8, 9, 0.88)";
      context.fillRect(startX, startY, barWidth, barHeight);
      context.fillStyle = "#7fc943";
      context.fillRect(startX, startY, barWidth * leadingProgress, barHeight);
      context.strokeStyle = "rgba(226, 240, 234, 0.7)";
      context.lineWidth = Math.max(0.5, this.hexSize * 0.022);
      context.strokeRect(startX, startY, barWidth, barHeight);
      context.restore();
    }
  }

  private drawThing(thing: Thing, center: Point, progress: number, layerScale: number, pulse: number): void {
    const context = this.context;
    const ready = thing.phase === "ready";
    const waiting = thing.phase === "waiting";
    const scale = thingScale(thing, progress) * layerScale * (ready ? 1 + pulse * 0.06 : 1);
    context.save();
    context.translate(center.x, center.y);
    context.rotate(thing.baseRotation + thingRotation(thing, progress));
    context.scale(scale, scale);
    this.shapePath(thing.shape, this.hexSize * 1.08);
    context.fillStyle = thing.fill;
    context.globalAlpha = ready ? 0.6 : waiting ? 0.24 : 0.42;
    context.fill();
    context.globalAlpha = 1;
    context.strokeStyle = ready ? "#ff6769" : thing.stroke;
    context.lineWidth = Math.max(0.75, this.hexSize * (ready ? 0.07 : 0.045)) / Math.max(scale, 0.2);
    context.shadowColor = ready ? "rgba(255, 78, 81, 0.7)" : thing.stroke;
    context.shadowBlur = ready ? this.hexSize * 0.26 : waiting ? 0 : this.hexSize * 0.1;
    context.stroke();
    context.restore();
  }

  private drawMotes(simulation: Simulation): void {
    const fraction = simulation.tickFraction;
    const eased = 1 - (1 - fraction) ** 3;
    for (const mote of simulation.motes) {
      const current = simulation.cellAt(mote.key);
      const previous = simulation.cellAt(mote.previousKey) ?? current;
      if (!current || !previous) continue;
      const from = this.center(previous);
      const to = this.center(current);
      const point = {
        x: from.x + (to.x - from.x) * eased,
        y: from.y + (to.y - from.y) * eased,
      };
      if (!this.isVisible(point)) continue;
      this.drawMote(mote, point);
    }
  }

  private drawMote(mote: Mote, point: Point): void {
    const context = this.context;
    const radius = Math.max(1.3, Math.min(3.8, this.hexSize * 0.13));
    context.save();
    context.translate(point.x, point.y);
    context.rotate((mote.direction / 6) * Math.PI * 2);
    context.beginPath();
    context.moveTo(radius * 1.8, 0);
    context.lineTo(-radius, radius * 0.8);
    context.lineTo(-radius * 0.55, 0);
    context.lineTo(-radius, -radius * 0.8);
    context.closePath();
    context.fillStyle = `hsl(${mote.hue} 90% 68%)`;
    context.shadowColor = context.fillStyle;
    context.shadowBlur = radius * 2.4;
    context.fill();
    context.restore();
  }

  private shapePath(points: readonly Point[], scale: number): void {
    const context = this.context;
    context.beginPath();
    for (const [index, point] of points.entries()) {
      const x = point.x * scale;
      const y = point.y * scale;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.closePath();
  }

  private rawCenter({ column, row }: HexCoordinate): Point {
    return { x: SQRT_THREE * (column + 0.5 * (row & 1)), y: 1.5 * row };
  }

  private center(coordinate: HexCoordinate): Point {
    const raw = this.rawCenter(coordinate);
    return { x: this.origin.x + raw.x * this.hexSize, y: this.origin.y + raw.y * this.hexSize };
  }

  private boardBounds(simulation: Simulation): {
    readonly minimumX: number;
    readonly minimumY: number;
    readonly width: number;
    readonly height: number;
  } {
    const minimumX = -SQRT_THREE / 2;
    const maximumCenterX = SQRT_THREE * (simulation.columns - 1 + (simulation.rows > 1 ? 0.5 : 0));
    const maximumX = maximumCenterX + SQRT_THREE / 2;
    const minimumY = -1;
    const maximumY = 1.5 * (simulation.rows - 1) + 1;
    return { minimumX, minimumY, width: maximumX - minimumX, height: maximumY - minimumY };
  }

  private roundAxial(column: number, row: number): HexCoordinate {
    let x = column;
    let z = row;
    let y = -x - z;
    let roundedX = Math.round(x);
    let roundedY = Math.round(y);
    let roundedZ = Math.round(z);
    const xDifference = Math.abs(roundedX - x);
    const yDifference = Math.abs(roundedY - y);
    const zDifference = Math.abs(roundedZ - z);
    if (xDifference > yDifference && xDifference > zDifference) roundedX = -roundedY - roundedZ;
    else if (yDifference > zDifference) roundedY = -roundedX - roundedZ;
    else roundedZ = -roundedX - roundedY;
    x = roundedX;
    y = roundedY;
    z = roundedZ;
    return { column: x, row: z };
  }

  private isVisible(center: Point): boolean {
    return center.x > -this.hexSize
      && center.y > -this.hexSize
      && center.x < this.width + this.hexSize
      && center.y < this.height + this.hexSize;
  }

  private clampHexSize(size: number): number {
    return Math.max(MINIMUM_HEX_SIZE, Math.min(MAXIMUM_HEX_SIZE, size));
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
