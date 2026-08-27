import {
  thingProgress,
  thingRotation,
  thingScale,
  type Imprint,
  type Simulation,
  type SimulationCell,
  type Thing,
} from "./simulation";
import type { HexCoordinate } from "./hex";

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface CameraState {
  readonly zoomPercent: number;
  readonly hexSize: number;
}

const SQRT_THREE = Math.sqrt(3);

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
  private hexSize = 28;
  private fitSize = 20;
  private origin: Point = { x: 0, y: 0 };
  private initialized = false;

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
    const previousZoom = this.initialized ? this.hexSize / this.fitSize : 1.5;
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
      this.hexSize = Math.max(12, Math.min(72, this.fitSize * previousZoom));
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
    this.hexSize = Math.max(12, Math.min(72, this.fitSize * 1.5));
    this.origin = {
      x: (this.width - board.width * this.hexSize) / 2 - board.minimumX * this.hexSize,
      y: (this.height - board.height * this.hexSize) / 2 - board.minimumY * this.hexSize,
    };
  }

  panBy(horizontal: number, vertical: number): void {
    this.origin = { x: this.origin.x + horizontal, y: this.origin.y + vertical };
  }

  zoomAt(factor: number, center: Point): void {
    const previousSize = this.hexSize;
    const nextSize = Math.max(12, Math.min(72, previousSize * factor));
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

    for (const cell of simulation.cells.values()) {
      const center = this.center(cell);
      if (!this.isVisible(center)) continue;
      this.drawCell(
        cell,
        center,
        simulation.selectedKeys.has(cell.key),
        hoveredKey === cell.key,
        pulse,
      );
    }

    for (const cell of simulation.cells.values()) {
      const center = this.center(cell);
      if (!this.isVisible(center)) continue;
      for (const imprint of cell.imprints) this.drawImprint(imprint, center);
      this.drawThings(cell, center, simulation.tickFraction, pulse);
    }
  }

  cellAtPoint(simulation: Simulation, x: number, y: number): SimulationCell | null {
    for (const cell of simulation.cells.values()) {
      if (isPointInHex({ x, y }, this.center(cell), this.hexSize * 0.96)) return cell;
    }
    return null;
  }

  private drawCell(cell: SimulationCell, center: Point, selected: boolean, hovered: boolean, pulse: number): void {
    const context = this.context;
    const ready = cell.things.some(({ phase }) => phase === "ready");
    context.save();
    this.hexPath(center, this.hexSize * 0.965);
    context.fillStyle = cell.buildable ? "#151c1d" : "#080b0c";
    context.fill();
    context.strokeStyle = cell.buildable ? "#273031" : "#111718";
    context.lineWidth = Math.max(0.75, this.hexSize * 0.035);
    context.stroke();

    if (!cell.buildable) {
      context.strokeStyle = "rgba(235, 92, 91, 0.24)";
      context.lineWidth = Math.max(1, this.hexSize * 0.035);
      context.beginPath();
      context.moveTo(center.x - this.hexSize * 0.25, center.y - this.hexSize * 0.25);
      context.lineTo(center.x + this.hexSize * 0.25, center.y + this.hexSize * 0.25);
      context.moveTo(center.x + this.hexSize * 0.25, center.y - this.hexSize * 0.25);
      context.lineTo(center.x - this.hexSize * 0.25, center.y + this.hexSize * 0.25);
      context.stroke();
    }

    if (ready) {
      this.hexPath(center, this.hexSize * (0.82 + pulse * 0.06));
      context.fillStyle = `rgba(255, 82, 85, ${0.11 + pulse * 0.08})`;
      context.fill();
      context.strokeStyle = `rgba(255, 99, 101, ${0.58 + pulse * 0.36})`;
      context.lineWidth = Math.max(1.5, this.hexSize * 0.055);
      context.stroke();
    }

    if (selected) {
      this.hexPath(center, this.hexSize * 0.87);
      context.fillStyle = "rgba(183, 239, 83, 0.11)";
      context.fill();
      context.strokeStyle = "#b7ef53";
      context.lineWidth = Math.max(1.5, this.hexSize * 0.06);
      context.setLineDash([this.hexSize * 0.12, this.hexSize * 0.08]);
      context.stroke();
      context.setLineDash([]);
    } else if (hovered) {
      this.hexPath(center, this.hexSize * 0.86);
      context.strokeStyle = "rgba(236, 245, 242, 0.64)";
      context.lineWidth = Math.max(1, this.hexSize * 0.04);
      context.stroke();
    }
    context.restore();
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
    context.lineWidth = Math.max(0.8, this.hexSize * 0.025);
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
      const thingCenter = {
        x: center.x + Math.cos(angle) * offset,
        y: center.y + Math.sin(angle) * offset,
      };
      this.drawThing(thing, thingCenter, progress, thingCount > 1 ? 0.72 : 1, pulse);
    }

    if (thingCount > 0 && cell.things.some(({ phase }) => phase === "growing")) {
      const barWidth = this.hexSize * 0.86;
      const barHeight = Math.max(2, this.hexSize * 0.07);
      const startX = center.x - barWidth / 2;
      const startY = center.y + this.hexSize * 0.62;
      context.save();
      context.fillStyle = "rgba(3, 8, 9, 0.88)";
      context.fillRect(startX, startY, barWidth, barHeight);
      context.fillStyle = "#7fc943";
      context.fillRect(startX, startY, barWidth * leadingProgress, barHeight);
      context.strokeStyle = "rgba(226, 240, 234, 0.7)";
      context.lineWidth = Math.max(0.7, this.hexSize * 0.022);
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
    context.lineWidth = Math.max(1, this.hexSize * (ready ? 0.07 : 0.045)) / Math.max(scale, 0.2);
    context.shadowColor = ready ? "rgba(255, 78, 81, 0.7)" : thing.stroke;
    context.shadowBlur = ready ? this.hexSize * 0.26 : waiting ? 0 : this.hexSize * 0.1;
    context.stroke();
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
    const centers = [...simulation.cells.values()].map((cell) => this.rawCenter(cell));
    const minimumX = Math.min(...centers.map(({ x }) => x)) - SQRT_THREE / 2;
    const maximumX = Math.max(...centers.map(({ x }) => x)) + SQRT_THREE / 2;
    const minimumY = Math.min(...centers.map(({ y }) => y)) - 1;
    const maximumY = Math.max(...centers.map(({ y }) => y)) + 1;
    return { minimumX, minimumY, width: maximumX - minimumX, height: maximumY - minimumY };
  }

  private isVisible(center: Point): boolean {
    return center.x > -this.hexSize
      && center.y > -this.hexSize
      && center.x < this.width + this.hexSize
      && center.y < this.height + this.hexSize;
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
