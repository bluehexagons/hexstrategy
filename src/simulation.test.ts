import { describe, expect, it } from "vitest";
import {
  MAP_COLUMNS,
  MAP_ROWS,
  MAX_THINGS_PER_CELL,
  Simulation,
  TICK_MS,
  generatorProgress,
  thingProgress,
  thingRotation,
  thingScale,
  type SimulationCell,
} from "./simulation";

function buildableCells(simulation: Simulation, count: number): SimulationCell[] {
  return [...simulation.cells.values()].filter(({ buildable }) => buildable).slice(0, count);
}

describe("Simulation", () => {
  it("generates a large procedural map while retaining the original void", () => {
    const first = new Simulation(() => 0.5, false, 123_456);
    const second = new Simulation(() => 0.5, false, 123_456);

    expect(first.cells).toHaveLength(MAP_COLUMNS * MAP_ROWS);
    expect(first.cells.size).toBeGreaterThan(6_000);
    expect(first.cellAt("2,2")?.buildable).toBe(false);
    expect(new Set([...first.cells.values()].map(({ terrain }) => terrain)).size).toBeGreaterThan(1);
    expect([...first.cells.values()].map(({ terrain }) => terrain))
      .toEqual([...second.cells.values()].map(({ terrain }) => terrain));
  });

  it("installs timed generators and an initial procedural ecology", () => {
    const simulation = new Simulation(undefined, true, 71_321);
    const generators = [...simulation.cells.values()]
      .map(({ generator }) => generator)
      .filter((generator) => generator !== null);
    const initialMotes = simulation.motes.length;

    expect(generators.length).toBeGreaterThan(10);
    expect(simulation.thingCount).toBeGreaterThan(10);
    expect(initialMotes).toBeGreaterThan(0);
    expect(generatorProgress(generators[0]!, 0.5)).toBeGreaterThanOrEqual(0);

    const longestCycle = Math.max(...generators.map(({ cycleTicks }) => cycleTicks));
    simulation.advance((longestCycle + 1) * TICK_MS);

    expect(simulation.motes.length).toBeGreaterThan(initialMotes);
    expect(simulation.motes.some(({ previousKey, key }) => previousKey !== key)).toBe(true);
  });

  it("replays procedural simulation from the same world seed", () => {
    const first = new Simulation(undefined, true, 808_808);
    const second = new Simulation(undefined, true, 808_808);

    first.advance(24 * TICK_MS);
    second.advance(24 * TICK_MS);

    expect(first.motes.map(({ key }) => key)).toEqual(second.motes.map(({ key }) => key));
    expect(first.thingCount).toBe(second.thingCount);
    expect(first.averageEnergy).toBeCloseTo(second.averageEnergy, 8);
  });

  it("seeds procedural things while respecting cell limits", () => {
    const simulation = new Simulation(() => 0.5, false, 9);
    const [cell] = buildableCells(simulation, 1);
    if (!cell) throw new Error("Expected a buildable cell");

    expect(simulation.seedCells([cell.key])).toBe(1);
    for (let index = 1; index < MAX_THINGS_PER_CELL; index += 1) simulation.seedCells([cell.key]);

    expect(cell.things).toHaveLength(MAX_THINGS_PER_CELL);
    expect(simulation.seedCells([cell.key, "2,2"])).toBe(0);
  });

  it("waits, then advances energy-dependent growth on the 250 millisecond world tick", () => {
    const simulation = new Simulation(() => 0.5, false, 22);
    const [cell] = buildableCells(simulation, 1);
    if (!cell) throw new Error("Expected a buildable cell");
    simulation.seedCells([cell.key]);
    const thing = cell.things[0];
    if (!thing) throw new Error("Expected a seeded thing");

    expect(simulation.advance(TICK_MS - 1)).toBe(0);
    expect(thing.progressTicks).toBe(0);
    expect(simulation.advance(1)).toBe(1);
    expect(thing.waitedTicks).toBe(1);
    simulation.advance(thing.waitTicks * TICK_MS);

    expect(thing.progressTicks).toBeGreaterThan(0);
    expect(thingProgress(thing)).toBeGreaterThan(0);
    expect(thingRotation(thing, 0.5)).not.toBeNaN();
    expect(thingScale(thing, 0.5)).toBeGreaterThan(0);
  });

  it("picks a mature thing, inherits its genome, and retains its imprint", () => {
    const simulation = new Simulation(() => 0.5, false, 44);
    const [cell] = buildableCells(simulation, 1);
    if (!cell) throw new Error("Expected a buildable cell");
    simulation.seedCells([cell.key]);
    simulation.selectCell(cell.key);
    const original = cell.things[0];
    if (!original) throw new Error("Expected a seeded thing");

    simulation.advance(220 * TICK_MS);
    const successor = cell.things[0];

    expect(simulation.samples).toBe(1);
    expect(cell.imprints).toHaveLength(1);
    expect(successor?.generation).toBe(2);
    expect(successor?.id).not.toBe(original.id);
    expect(successor?.genome.growthRate).toBeCloseTo(original.genome.growthRate);
    expect(simulation.selectedKeys.has(cell.key)).toBe(false);
  });

  it("can echo a picked mutation into an open neighboring cell", () => {
    const simulation = new Simulation(() => 0, false, 77);
    const cell = [...simulation.cells.values()].find((candidate) => (
      candidate.buildable
      && candidate.column > 4
      && candidate.row > 4
      && candidate.column < MAP_COLUMNS - 4
      && candidate.row < MAP_ROWS - 4
    ));
    if (!cell) throw new Error("Expected an interior buildable cell");
    simulation.seedCells([cell.key]);
    simulation.selectCell(cell.key);

    for (let tick = 0; tick < 300 && simulation.samples === 0; tick += 1) {
      simulation.advance(TICK_MS);
    }

    expect(simulation.samples).toBe(1);
    expect(simulation.thingCount).toBe(2);
    expect(simulation.motes.length).toBe(1);
  });

  it("supports additive and toggle selection plus batch clearing", () => {
    const simulation = new Simulation(() => 0.5, false, 101);
    const [first, second] = buildableCells(simulation, 2);
    if (!first || !second) throw new Error("Expected buildable cells");
    simulation.seedCells([first.key, second.key]);
    simulation.selectCell(first.key);
    simulation.selectCell(second.key, "add");
    simulation.selectCell(first.key, "toggle");

    expect([...simulation.selectedKeys]).toEqual([second.key]);
    expect(simulation.clearCells([first.key, second.key])).toBe(2);
    expect(simulation.thingCount).toBe(0);
  });

  it("diffuses generated energy through neighboring cells", () => {
    const simulation = new Simulation(undefined, true, 91_117);
    const source = [...simulation.cells.values()].find(({ generator }) => generator !== null);
    if (!source) throw new Error("Expected a generator");
    const neighbor = buildableCells(simulation, simulation.cells.size)
      .find((candidate) => Math.abs(candidate.row - source.row) <= 1 && candidate.key !== source.key);
    if (!neighbor) throw new Error("Expected a neighboring cell");
    const initialEnergy = neighbor.energy;

    simulation.advance(8 * TICK_MS);

    expect(neighbor.energy).not.toBe(initialEnergy);
    expect(simulation.averageEnergy).toBeGreaterThan(0);
  });

  it("freezes the complete simulation while paused", () => {
    const simulation = new Simulation(undefined, true, 55);
    const initialMotes = simulation.motes.map(({ key }) => key);
    simulation.setPaused(true);

    expect(simulation.advance(TICK_MS * 8)).toBe(0);
    expect(simulation.ticks).toBe(0);
    expect(simulation.motes.map(({ key }) => key)).toEqual(initialMotes);
  });
});
