import { hexKey, neighbors, type HexCoordinate } from "./hex";

export const TICK_MS = 250;
export const MAP_COLUMNS = 16;
export const MAP_ROWS = 16;
export const MAX_THINGS_PER_CELL = 3;
const MAX_IMPRINTS_PER_CELL = 6;
const SPREAD_CHANCE = 0.32;

export type ThingPhase = "waiting" | "growing" | "ready";
export type ThingAnimation =
  | "shrink"
  | "shrink-alt"
  | "spin-clockwise"
  | "spin-counterclockwise"
  | "spin-and-shrink-clockwise"
  | "spin-and-shrink-counterclockwise";
export type SelectionMode = "replace" | "add" | "toggle";

export interface ShapePoint {
  readonly x: number;
  readonly y: number;
}

export interface Thing {
  readonly id: string;
  readonly generation: number;
  readonly shape: readonly ShapePoint[];
  readonly stroke: string;
  readonly fill: string;
  readonly animation: ThingAnimation;
  readonly baseRotation: number;
  readonly waitTicks: number;
  readonly growthTicks: number;
  phase: ThingPhase;
  waitedTicks: number;
  progressTicks: number;
}

export interface Imprint {
  readonly shape: readonly ShapePoint[];
  readonly stroke: string;
  readonly fill: string;
  readonly rotation: number;
  readonly scale: number;
}

export interface SimulationCell extends HexCoordinate {
  readonly key: string;
  readonly buildable: boolean;
  readonly things: Thing[];
  readonly imprints: Imprint[];
}

const INITIAL_SEEDS: readonly HexCoordinate[] = [
  { column: 5, row: 6 },
  { column: 7, row: 6 },
  { column: 9, row: 7 },
  { column: 6, row: 9 },
  { column: 8, row: 9 },
  { column: 11, row: 10 },
  { column: 4, row: 11 },
];

export function thingProgress(thing: Thing, tickFraction = 0): number {
  if (thing.phase === "ready") return 1;
  if (thing.phase === "waiting") return 0;
  return Math.min(1, (thing.progressTicks + Math.max(0, Math.min(tickFraction, 1))) / thing.growthTicks);
}

export function thingRotation(thing: Thing, progress: number): number {
  if (thing.animation === "spin-clockwise" || thing.animation === "spin-and-shrink-clockwise") {
    return progress * Math.PI * 2;
  }
  if (thing.animation === "spin-counterclockwise" || thing.animation === "spin-and-shrink-counterclockwise") {
    return progress * Math.PI * -2;
  }
  return 0;
}

export function thingScale(thing: Thing, progress: number): number {
  return thing.animation === "shrink"
    || thing.animation === "shrink-alt"
    || thing.animation === "spin-and-shrink-clockwise"
    || thing.animation === "spin-and-shrink-counterclockwise"
    ? 1 - progress * 0.42
    : 1;
}

export class Simulation {
  readonly columns = MAP_COLUMNS;
  readonly rows = MAP_ROWS;
  readonly cells = new Map<string, SimulationCell>();
  readonly selectedKeys = new Set<string>();
  activity: string[] = [
    "Realtime lattice online. World clock is running.",
    "Select a red growth to pick its mutation.",
  ];
  samples = 0;
  ticks = 0;
  paused = false;
  private accumulatorMs = 0;
  private nextThingId = 1;

  constructor(
    private readonly random: () => number = Math.random,
    populate = true,
  ) {
    for (let row = 0; row < this.rows; row += 1) {
      for (let column = 0; column < this.columns; column += 1) {
        const coordinate = { column, row };
        const key = hexKey(coordinate);
        this.cells.set(key, {
          ...coordinate,
          key,
          buildable: key !== "2,2",
          things: [],
          imprints: [],
        });
      }
    }

    if (populate) {
      for (const coordinate of INITIAL_SEEDS) {
        const thing = this.addThing(this.cellAt(coordinate), 1);
        if (thing) {
          thing.phase = "growing";
          thing.waitedTicks = thing.waitTicks;
          thing.progressTicks = Math.floor(thing.growthTicks * (0.12 + this.random() * 0.62));
        }
      }
    }
  }

  get thingCount(): number {
    return [...this.cells.values()].reduce((total, cell) => total + cell.things.length, 0);
  }

  get readyCount(): number {
    return [...this.cells.values()].reduce(
      (total, cell) => total + cell.things.filter(({ phase }) => phase === "ready").length,
      0,
    );
  }

  get growingCount(): number {
    return [...this.cells.values()].reduce(
      (total, cell) => total + cell.things.filter(({ phase }) => phase === "growing").length,
      0,
    );
  }

  get waitingCount(): number {
    return this.thingCount - this.readyCount - this.growingCount;
  }

  get tickFraction(): number {
    return this.paused ? 0 : this.accumulatorMs / TICK_MS;
  }

  cellAt(coordinate: HexCoordinate | string): SimulationCell | undefined {
    return this.cells.get(typeof coordinate === "string" ? coordinate : hexKey(coordinate));
  }

  selectCell(key: string, mode: SelectionMode = "replace"): boolean {
    const cell = this.cellAt(key);
    if (!cell) return false;

    if (mode === "replace") this.selectedKeys.clear();
    if (mode === "toggle" && this.selectedKeys.has(key)) {
      this.selectedKeys.delete(key);
      return false;
    }

    this.selectedKeys.add(key);
    return true;
  }

  clearSelection(): void {
    this.selectedKeys.clear();
  }

  seedCells(keys: Iterable<string>): number {
    let seeded = 0;
    for (const key of new Set(keys)) {
      const cell = this.cellAt(key);
      if (this.addThing(cell, 1)) seeded += 1;
    }
    if (seeded > 0) this.log(`Seeded ${seeded} new ${seeded === 1 ? "thing" : "things"}.`);
    return seeded;
  }

  clearCells(keys: Iterable<string>): number {
    let cleared = 0;
    for (const key of new Set(keys)) {
      const cell = this.cellAt(key);
      if (!cell || (cell.things.length === 0 && cell.imprints.length === 0)) continue;
      cell.things.length = 0;
      cell.imprints.length = 0;
      this.selectedKeys.delete(key);
      cleared += 1;
    }
    if (cleared > 0) this.log(`Cleared ${cleared} ${cleared === 1 ? "cell" : "cells"}.`);
    return cleared;
  }

  advance(elapsedMs: number): number {
    if (this.paused || elapsedMs <= 0) return 0;
    this.accumulatorMs += elapsedMs;
    let processed = 0;
    while (this.accumulatorMs >= TICK_MS) {
      this.accumulatorMs -= TICK_MS;
      this.tick();
      processed += 1;
    }
    return processed;
  }

  setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    this.accumulatorMs = 0;
    this.log(paused ? "World clock paused." : "World clock resumed.");
  }

  private tick(): void {
    this.ticks += 1;

    for (const cell of this.cells.values()) {
      for (const thing of cell.things) {
        if (thing.phase === "ready") continue;
        if (thing.phase === "waiting") {
          thing.waitedTicks += 1;
          if (thing.waitedTicks >= thing.waitTicks) thing.phase = "growing";
          continue;
        }
        thing.progressTicks += 1;
        if (thing.progressTicks >= thing.growthTicks) {
          thing.progressTicks = thing.growthTicks;
          thing.phase = "ready";
        }
      }
    }

    for (const key of [...this.selectedKeys]) {
      const cell = this.cellAt(key);
      const readyThing = cell?.things.find(({ phase }) => phase === "ready");
      if (cell && readyThing) this.pickThing(cell, readyThing);
    }
  }

  private pickThing(cell: SimulationCell, thing: Thing): void {
    const thingIndex = cell.things.indexOf(thing);
    if (thingIndex < 0) return;

    cell.imprints.push({
      shape: thing.shape,
      stroke: thing.stroke,
      fill: thing.fill,
      rotation: thing.baseRotation + thingRotation(thing, 1),
      scale: thingScale(thing, 1),
    });
    if (cell.imprints.length > MAX_IMPRINTS_PER_CELL) cell.imprints.shift();

    const shouldSpread = this.random() < SPREAD_CHANCE;
    cell.things[thingIndex] = this.createThing(thing.generation + 1);
    this.samples += 1;
    this.selectedKeys.delete(cell.key);
    this.log(`Picked mutation ${this.samples} at ${cell.column + 1}.${cell.row + 1}.`);

    if (shouldSpread) {
      const openNeighbors = neighbors(cell)
        .map((coordinate) => this.cellAt(coordinate))
        .filter((candidate): candidate is SimulationCell => Boolean(
          candidate?.buildable && candidate.things.length === 0,
        ));
      const target = openNeighbors[Math.floor(this.random() * openNeighbors.length)];
      if (target && this.addThing(target, thing.generation + 1)) {
        this.log(`Mutation ${this.samples} echoed into ${target.column + 1}.${target.row + 1}.`);
      }
    }
  }

  private addThing(cell: SimulationCell | undefined, generation: number): Thing | null {
    if (!cell?.buildable || cell.things.length >= MAX_THINGS_PER_CELL) return null;
    const thing = this.createThing(generation);
    cell.things.push(thing);
    return thing;
  }

  private createThing(generation: number): Thing {
    const pointCount = 5 + Math.floor(this.random() * 9);
    const shape: ShapePoint[] = [];
    for (let index = 0; index < pointCount; index += 1) {
      shape.push({
        x: this.random() * 0.82 - 0.41,
        y: this.random() * 0.82 - 0.41,
      });
    }

    const hue = Math.floor(this.random() * 360);
    const animationIndex = Math.floor(this.random() * 6);
    const animations: readonly ThingAnimation[] = [
      "shrink",
      "shrink-alt",
      "spin-clockwise",
      "spin-counterclockwise",
      "spin-and-shrink-clockwise",
      "spin-and-shrink-counterclockwise",
    ];

    return {
      id: `thing-${this.nextThingId++}`,
      generation,
      shape,
      stroke: `hsl(${hue} 86% 72%)`,
      fill: `hsl(${(hue + 42) % 360} 76% 48%)`,
      animation: animations[animationIndex] ?? "shrink",
      baseRotation: this.random() * Math.PI * 2,
      waitTicks: 2 + Math.floor(this.random() * 10),
      growthTicks: 10 + Math.floor(this.random() * 40),
      phase: "waiting",
      waitedTicks: 0,
      progressTicks: 0,
    };
  }

  private log(message: string): void {
    this.activity.unshift(message);
    this.activity = this.activity.slice(0, 7);
  }
}
