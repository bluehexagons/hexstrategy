import { hexKey, neighbors, type HexCoordinate } from "./hex";

export const TICK_MS = 250;
export const MAP_COLUMNS = 96;
export const MAP_ROWS = 64;
export const MAX_THINGS_PER_CELL = 3;
export const MAX_MOTES = 360;
const MAX_IMPRINTS_PER_CELL = 6;
const MAX_WORLD_THINGS = 720;

export type ThingPhase = "waiting" | "growing" | "ready";
export type ThingAnimation =
  | "shrink"
  | "shrink-alt"
  | "spin-clockwise"
  | "spin-counterclockwise"
  | "spin-and-shrink-clockwise"
  | "spin-and-shrink-counterclockwise";
export type SelectionMode = "replace" | "add" | "toggle";
export type Terrain = "field" | "basin" | "ridge" | "void";

export interface ShapePoint {
  readonly x: number;
  readonly y: number;
}

export interface Genome {
  readonly hue: number;
  readonly growthRate: number;
  readonly dormancy: number;
  readonly metabolism: number;
  readonly spread: number;
}

export interface Thing {
  readonly id: string;
  readonly generation: number;
  readonly genome: Genome;
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

export interface Generator {
  readonly id: string;
  readonly hue: number;
  readonly cycleTicks: number;
  readonly output: number;
  progressTicks: number;
}

export interface Mote {
  readonly id: string;
  readonly hue: number;
  readonly payload: number;
  readonly moveEvery: number;
  readonly lifespan: number;
  key: string;
  previousKey: string;
  direction: number;
  moveTimer: number;
  age: number;
}

export interface SimulationCell extends HexCoordinate {
  readonly index: number;
  readonly key: string;
  readonly buildable: boolean;
  readonly terrain: Terrain;
  readonly elevation: number;
  readonly moisture: number;
  readonly things: Thing[];
  readonly imprints: Imprint[];
  energy: number;
  generator: Generator | null;
}

const ANIMATIONS: readonly ThingAnimation[] = [
  "shrink",
  "shrink-alt",
  "spin-clockwise",
  "spin-counterclockwise",
  "spin-and-shrink-clockwise",
  "spin-and-shrink-counterclockwise",
];

const INITIAL_OFFSETS: readonly HexCoordinate[] = [
  { column: -8, row: -6 },
  { column: -3, row: -7 },
  { column: 4, row: -6 },
  { column: 8, row: -2 },
  { column: -9, row: 0 },
  { column: -4, row: 2 },
  { column: 3, row: 1 },
  { column: 9, row: 5 },
  { column: -6, row: 7 },
  { column: 1, row: 8 },
  { column: 6, row: 7 },
];

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

function smooth(value: number): number {
  return value * value * (3 - 2 * value);
}

export function hashNoise(column: number, row: number, seed: number): number {
  let hash = Math.imul(column, 374_761_393) ^ Math.imul(row, 668_265_263) ^ seed;
  hash = Math.imul(hash ^ (hash >>> 13), 1_274_126_177);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4_294_967_295;
}

function valueNoise(column: number, row: number, scale: number, seed: number): number {
  const horizontal = column / scale;
  const vertical = row / scale;
  const left = Math.floor(horizontal);
  const top = Math.floor(vertical);
  const x = smooth(horizontal - left);
  const y = smooth(vertical - top);
  const upper = lerp(hashNoise(left, top, seed), hashNoise(left + 1, top, seed), x);
  const lower = lerp(hashNoise(left, top + 1, seed), hashNoise(left + 1, top + 1, seed), x);
  return lerp(upper, lower, y);
}

function fractalNoise(column: number, row: number, seed: number): number {
  return (
    valueNoise(column, row, 28, seed) * 0.55
    + valueNoise(column, row, 13, seed + 1_019) * 0.3
    + valueNoise(column, row, 6, seed + 7_919) * 0.15
  );
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function mutateValue(random: () => number, value: number, range: number, minimum: number, maximum: number): number {
  return clamp(value + (random() - 0.5) * range, minimum, maximum);
}

export function thingProgress(thing: Thing, tickFraction = 0): number {
  if (thing.phase === "ready") return 1;
  if (thing.phase === "waiting") return 0;
  const interpolatedGrowth = tickFraction * thing.genome.growthRate;
  return Math.min(1, (thing.progressTicks + interpolatedGrowth) / thing.growthTicks);
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

export function generatorProgress(generator: Generator, tickFraction = 0): number {
  return Math.min(1, (generator.progressTicks + clamp(tickFraction)) / generator.cycleTicks);
}

export class Simulation {
  readonly columns = MAP_COLUMNS;
  readonly rows = MAP_ROWS;
  readonly seed: number;
  readonly cells = new Map<string, SimulationCell>();
  readonly selectedKeys = new Set<string>();
  readonly motes: Mote[] = [];
  activity: string[];
  samples = 0;
  ticks = 0;
  paused = false;
  private readonly random: () => number;
  private readonly nextEnergy = new Float32Array(MAP_COLUMNS * MAP_ROWS);
  private accumulatorMs = 0;
  private nextThingId = 1;
  private nextMoteId = 1;
  private nextGeneratorId = 1;

  constructor(random?: () => number, populate = true, seed?: number) {
    const seedSource = random ?? Math.random;
    this.seed = (seed ?? Math.floor(seedSource() * 4_294_967_295)) >>> 0;
    this.random = random ?? seededRandom(this.seed);
    this.activity = [
      `Procedural lattice ${this.seedLabel} online: ${MAP_COLUMNS} × ${MAP_ROWS} cells.`,
      "Sources diffuse energy and release autonomous motes.",
      "Select a red growth to pick its mutation.",
    ];

    this.generateCells();
    if (populate) {
      this.installGenerators();
      this.seedInitialEcology();
    }
  }

  get seedLabel(): string {
    return this.seed.toString(16).padStart(8, "0").toUpperCase();
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

  get generatorCount(): number {
    return [...this.cells.values()].filter(({ generator }) => generator !== null).length;
  }

  get averageEnergy(): number {
    let total = 0;
    let buildable = 0;
    for (const cell of this.cells.values()) {
      if (!cell.buildable) continue;
      total += cell.energy;
      buildable += 1;
    }
    return buildable > 0 ? total / buildable : 0;
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

  private generateCells(): void {
    let index = 0;
    for (let row = 0; row < this.rows; row += 1) {
      for (let column = 0; column < this.columns; column += 1) {
        const coordinate = { column, row };
        const key = hexKey(coordinate);
        const elevation = fractalNoise(column, row, this.seed + 17);
        const moisture = fractalNoise(column + 31, row - 19, this.seed + 9_973);
        const isOriginalVoid = key === "2,2";
        const isProceduralVoid = elevation < 0.16
          || (elevation > 0.84 && moisture < 0.38)
          || (Math.abs(elevation - 0.49) < 0.012 && moisture < 0.24);
        const terrain: Terrain = isOriginalVoid || isProceduralVoid
          ? "void"
          : elevation > 0.66
            ? "ridge"
            : moisture > 0.64
              ? "basin"
              : "field";
        const buildable = terrain !== "void";
        this.cells.set(key, {
          ...coordinate,
          index,
          key,
          buildable,
          terrain,
          elevation,
          moisture,
          energy: buildable ? clamp(moisture * 0.12 + (terrain === "basin" ? 0.06 : 0)) : 0,
          generator: null,
          things: [],
          imprints: [],
        });
        index += 1;
      }
    }
  }

  private installGenerators(): void {
    for (let row = 7; row < this.rows; row += 14) {
      for (let column = 9; column < this.columns; column += 18) {
        const jittered = {
          column: column + Math.floor(hashNoise(column, row, this.seed + 401) * 9) - 4,
          row: row + Math.floor(hashNoise(column, row, this.seed + 809) * 7) - 3,
        };
        const cell = this.nearestBuildable(jittered, 6);
        if (!cell || cell.generator) continue;
        const variation = hashNoise(cell.column, cell.row, this.seed + 2_003);
        cell.generator = {
          id: `source-${this.nextGeneratorId++}`,
          hue: Math.floor(150 + variation * 90),
          cycleTicks: 14 + Math.floor(variation * 18),
          output: 0.022 + variation * 0.026,
          progressTicks: Math.floor(variation * 10),
        };
        cell.energy = Math.max(cell.energy, 0.38);
      }
    }
  }

  private seedInitialEcology(): void {
    const center = { column: Math.floor(this.columns / 2), row: Math.floor(this.rows / 2) };
    for (const offset of INITIAL_OFFSETS) {
      const cell = this.nearestBuildable({
        column: center.column + offset.column,
        row: center.row + offset.row,
      }, 5);
      const thing = this.addThing(cell, 1);
      if (!thing) continue;
      thing.phase = "growing";
      thing.waitedTicks = thing.waitTicks;
      thing.progressTicks = thing.growthTicks * (0.12 + this.random() * 0.62);
    }

    let sourceIndex = 0;
    for (const cell of this.cells.values()) {
      if (!cell.generator) continue;
      if (sourceIndex % 4 === 0 && cell.things.length === 0) {
        const thing = this.addThing(cell, 1);
        if (thing) {
          thing.phase = "growing";
          thing.waitedTicks = thing.waitTicks;
          thing.progressTicks = thing.growthTicks * 0.2;
        }
      }
      if (sourceIndex % 2 === 0) this.addMote(cell, cell.generator.hue);
      sourceIndex += 1;
    }
  }

  private tick(): void {
    this.ticks += 1;
    this.diffuseEnergy();
    this.tickGenerators();
    this.tickThings();
    this.tickMotes();

    for (const key of [...this.selectedKeys]) {
      const cell = this.cellAt(key);
      const readyThing = cell?.things.find(({ phase }) => phase === "ready");
      if (cell && readyThing) this.pickThing(cell, readyThing);
    }
  }

  private diffuseEnergy(): void {
    for (const cell of this.cells.values()) {
      if (!cell.buildable) {
        this.nextEnergy[cell.index] = 0;
        continue;
      }
      const adjacent = neighbors(cell)
        .map((coordinate) => this.cellAt(coordinate))
        .filter((candidate): candidate is SimulationCell => Boolean(candidate?.buildable));
      const neighboringEnergy = adjacent.length > 0
        ? adjacent.reduce((total, candidate) => total + candidate.energy, 0) / adjacent.length
        : cell.energy;
      const ambient = cell.moisture * 0.003 + (cell.terrain === "basin" ? 0.002 : 0);
      const generated = cell.generator?.output ?? 0;
      this.nextEnergy[cell.index] = clamp(cell.energy * 0.9 + neighboringEnergy * 0.075 + ambient + generated);
    }

    for (const cell of this.cells.values()) cell.energy = this.nextEnergy[cell.index] ?? 0;
  }

  private tickGenerators(): void {
    for (const cell of this.cells.values()) {
      const generator = cell.generator;
      if (!generator) continue;
      generator.progressTicks += 1;
      if (generator.progressTicks < generator.cycleTicks) continue;
      generator.progressTicks = 0;
      this.addMote(cell, generator.hue);
    }
  }

  private tickThings(): void {
    for (const cell of this.cells.values()) {
      for (const thing of cell.things) {
        if (thing.phase === "ready") {
          cell.energy = clamp(cell.energy + 0.0025 * thing.genome.metabolism);
          continue;
        }
        if (thing.phase === "waiting") {
          thing.waitedTicks += 1;
          if (thing.waitedTicks >= thing.waitTicks) thing.phase = "growing";
          continue;
        }
        const availableEnergy = 0.44 + cell.energy * 1.16;
        thing.progressTicks += thing.genome.growthRate * availableEnergy;
        cell.energy = clamp(cell.energy - thing.genome.metabolism * 0.006);
        if (thing.progressTicks >= thing.growthTicks) {
          thing.progressTicks = thing.growthTicks;
          thing.phase = "ready";
        }
      }
    }
  }

  private tickMotes(): void {
    let totalThings = this.thingCount;
    for (let index = this.motes.length - 1; index >= 0; index -= 1) {
      const mote = this.motes[index];
      if (!mote) continue;
      if (mote.previousKey !== mote.key) mote.previousKey = mote.key;
      mote.age += 1;
      mote.moveTimer += 1;
      const cell = this.cellAt(mote.key);
      if (!cell || mote.age >= mote.lifespan) {
        if (cell) cell.energy = clamp(cell.energy + mote.payload * 0.16);
        this.motes.splice(index, 1);
        continue;
      }
      if (mote.moveTimer < mote.moveEvery) continue;
      mote.moveTimer = 0;

      const destination = this.chooseMoteDestination(cell, mote);
      if (!destination) continue;
      mote.previousKey = mote.key;
      mote.key = destination.cell.key;
      mote.direction = destination.direction;
      destination.cell.energy = clamp(destination.cell.energy + mote.payload * 0.028);

      const growing = destination.cell.things.find(({ phase }) => phase === "growing");
      if (growing) growing.progressTicks = Math.min(growing.growthTicks, growing.progressTicks + mote.payload * 0.18);

      const canColonize = totalThings < MAX_WORLD_THINGS
        && destination.cell.things.length === 0
        && mote.age > 8
        && destination.cell.energy > 0.14;
      if (canColonize && this.random() < 0.012 + destination.cell.moisture * 0.012) {
        const thing = this.addThing(destination.cell, 1, {
          hue: mote.hue,
          growthRate: 0.9 + this.random() * 0.4,
          dormancy: 0.7 + this.random() * 0.5,
          metabolism: 0.7 + this.random() * 0.6,
          spread: 0.14 + this.random() * 0.2,
        });
        if (thing) {
          totalThings += 1;
          this.motes.splice(index, 1);
          if (this.ticks % 8 === 0) {
            this.log(`A mote colonized ${destination.cell.column + 1}.${destination.cell.row + 1}.`);
          }
        }
      }
    }
  }

  private chooseMoteDestination(
    cell: SimulationCell,
    mote: Mote,
  ): { readonly cell: SimulationCell; readonly direction: number } | null {
    const candidates = neighbors(cell)
      .map((coordinate, direction) => ({ cell: this.cellAt(coordinate), direction }))
      .filter((candidate): candidate is { cell: SimulationCell; direction: number } => Boolean(candidate.cell?.buildable));
    let best: { readonly cell: SimulationCell; readonly direction: number } | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const candidate of candidates) {
      const emptyBonus = candidate.cell.things.length === 0 ? 0.12 : 0;
      const momentum = candidate.direction === mote.direction ? 0.2 : 0;
      const energyGradient = (1 - candidate.cell.energy) * 0.28;
      const basinAffinity = candidate.cell.moisture * 0.16;
      const score = emptyBonus + momentum + energyGradient + basinAffinity + this.random() * 0.24;
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    return best;
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

    const shouldSpread = this.random() < thing.genome.spread;
    cell.things[thingIndex] = this.createThing(thing.generation + 1, thing.genome, thing.shape);
    cell.energy = clamp(cell.energy + 0.16);
    this.addMote(cell, thing.genome.hue);
    this.samples += 1;
    this.selectedKeys.delete(cell.key);
    this.log(`Picked generation ${thing.generation + 1} at ${cell.column + 1}.${cell.row + 1}.`);

    if (shouldSpread) {
      const openNeighbors = neighbors(cell)
        .map((coordinate) => this.cellAt(coordinate))
        .filter((candidate): candidate is SimulationCell => Boolean(
          candidate?.buildable && candidate.things.length === 0,
        ));
      const target = openNeighbors[Math.floor(this.random() * openNeighbors.length)];
      if (target && this.addThing(target, thing.generation + 1, thing.genome, thing.shape)) {
        this.log(`Generation ${thing.generation + 1} echoed into ${target.column + 1}.${target.row + 1}.`);
      }
    }
  }

  private addThing(
    cell: SimulationCell | undefined,
    generation: number,
    parentGenome?: Genome,
    parentShape?: readonly ShapePoint[],
  ): Thing | null {
    if (!cell?.buildable || cell.things.length >= MAX_THINGS_PER_CELL) return null;
    const thing = this.createThing(generation, parentGenome, parentShape);
    cell.things.push(thing);
    return thing;
  }

  private addMote(cell: SimulationCell, hue: number): Mote | null {
    if (this.motes.length >= MAX_MOTES) return null;
    const mote: Mote = {
      id: `mote-${this.nextMoteId++}`,
      key: cell.key,
      previousKey: cell.key,
      hue: Math.round((hue + (this.random() - 0.5) * 28 + 360) % 360),
      payload: 0.65 + this.random() * 0.7,
      direction: Math.floor(this.random() * 6),
      moveEvery: 2 + Math.floor(this.random() * 4),
      moveTimer: 0,
      age: 0,
      lifespan: 42 + Math.floor(this.random() * 54),
    };
    this.motes.push(mote);
    return mote;
  }

  private createThing(
    generation: number,
    parentGenome?: Genome,
    parentShape?: readonly ShapePoint[],
  ): Thing {
    const genome: Genome = parentGenome
      ? {
          hue: (parentGenome.hue + (this.random() - 0.5) * 54 + 360) % 360,
          growthRate: mutateValue(this.random, parentGenome.growthRate, 0.28, 0.55, 1.65),
          dormancy: mutateValue(this.random, parentGenome.dormancy, 0.3, 0.4, 1.8),
          metabolism: mutateValue(this.random, parentGenome.metabolism, 0.28, 0.45, 1.7),
          spread: mutateValue(this.random, parentGenome.spread, 0.16, 0.08, 0.58),
        }
      : {
          hue: this.random() * 360,
          growthRate: 0.75 + this.random() * 0.65,
          dormancy: 0.6 + this.random() * 0.8,
          metabolism: 0.65 + this.random() * 0.7,
          spread: 0.12 + this.random() * 0.32,
        };
    const shape = this.mutateShape(parentShape);
    const hue = Math.round(genome.hue);

    return {
      id: `thing-${this.nextThingId++}`,
      generation,
      genome,
      shape,
      stroke: `hsl(${hue} 86% 72%)`,
      fill: `hsl(${(hue + 42) % 360} 76% 48%)`,
      animation: ANIMATIONS[Math.floor(this.random() * ANIMATIONS.length)] ?? "shrink",
      baseRotation: this.random() * Math.PI * 2,
      waitTicks: Math.max(1, Math.round((2 + this.random() * 10) * genome.dormancy)),
      growthTicks: 10 + Math.floor(this.random() * 40),
      phase: "waiting",
      waitedTicks: 0,
      progressTicks: 0,
    };
  }

  private mutateShape(parentShape?: readonly ShapePoint[]): ShapePoint[] {
    if (!parentShape) {
      const pointCount = 5 + Math.floor(this.random() * 9);
      return Array.from({ length: pointCount }, () => ({
        x: this.random() * 0.82 - 0.41,
        y: this.random() * 0.82 - 0.41,
      }));
    }

    const points = parentShape.map(({ x, y }) => ({
      x: clamp(x + (this.random() - 0.5) * 0.13, -0.46, 0.46),
      y: clamp(y + (this.random() - 0.5) * 0.13, -0.46, 0.46),
    }));
    if (points.length < 14 && this.random() < 0.28) {
      points.splice(Math.floor(this.random() * points.length), 0, {
        x: this.random() * 0.82 - 0.41,
        y: this.random() * 0.82 - 0.41,
      });
    } else if (points.length > 5 && this.random() < 0.22) {
      points.splice(Math.floor(this.random() * points.length), 1);
    }
    return points;
  }

  private nearestBuildable(coordinate: HexCoordinate, maximumRadius: number): SimulationCell | undefined {
    for (let radius = 0; radius <= maximumRadius; radius += 1) {
      for (let row = coordinate.row - radius; row <= coordinate.row + radius; row += 1) {
        for (let column = coordinate.column - radius; column <= coordinate.column + radius; column += 1) {
          if (Math.max(Math.abs(column - coordinate.column), Math.abs(row - coordinate.row)) !== radius) continue;
          const cell = this.cellAt({ column, row });
          if (cell?.buildable) return cell;
        }
      }
    }
    return undefined;
  }

  private log(message: string): void {
    this.activity.unshift(message);
    this.activity = this.activity.slice(0, 8);
  }
}
