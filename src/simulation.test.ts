import { describe, expect, it } from "vitest";
import { MAX_THINGS_PER_CELL, Simulation, TICK_MS, thingProgress } from "./simulation";

describe("Simulation", () => {
  it("restores the original 16 by 16 map and unbuildable level tile", () => {
    const simulation = new Simulation(() => 0.5, false);

    expect(simulation.cells).toHaveLength(256);
    expect(simulation.cellAt("2,2")?.buildable).toBe(false);
    expect(simulation.thingCount).toBe(0);
  });

  it("seeds procedural things while respecting cell limits", () => {
    const simulation = new Simulation(() => 0.5, false);

    expect(simulation.seedCells(["4,4"])).toBe(1);
    for (let index = 1; index < MAX_THINGS_PER_CELL; index += 1) simulation.seedCells(["4,4"]);

    expect(simulation.cellAt("4,4")?.things).toHaveLength(MAX_THINGS_PER_CELL);
    expect(simulation.seedCells(["4,4", "2,2"])).toBe(0);
  });

  it("advances growth on the original 250 millisecond world tick", () => {
    const simulation = new Simulation(() => 0.9, false);
    simulation.seedCells(["4,4"]);
    const thing = simulation.cellAt("4,4")?.things[0];
    if (!thing) throw new Error("Expected a seeded thing");

    expect(simulation.advance(TICK_MS - 1)).toBe(0);
    expect(thing.progressTicks).toBe(0);
    expect(simulation.advance(1)).toBe(1);
    expect(thing.progressTicks).toBe(1);
    expect(thingProgress(thing)).toBeGreaterThan(0);
  });

  it("picks a selected mature thing, retains its imprint, and starts its successor", () => {
    const simulation = new Simulation(() => 0.9, false);
    simulation.seedCells(["4,4"]);
    simulation.selectCell("4,4");
    const original = simulation.cellAt("4,4")?.things[0];
    if (!original) throw new Error("Expected a seeded thing");

    simulation.advance(original.growthTicks * TICK_MS);
    const cell = simulation.cellAt("4,4");

    expect(simulation.samples).toBe(1);
    expect(cell?.imprints).toHaveLength(1);
    expect(cell?.things[0]?.generation).toBe(2);
    expect(cell?.things[0]?.id).not.toBe(original.id);
    expect(simulation.selectedKeys.has("4,4")).toBe(false);
  });

  it("can echo mutations into open neighboring cells", () => {
    const simulation = new Simulation(() => 0, false);
    simulation.seedCells(["4,4"]);
    simulation.selectCell("4,4");
    const original = simulation.cellAt("4,4")?.things[0];
    if (!original) throw new Error("Expected a seeded thing");

    simulation.advance(original.growthTicks * TICK_MS);

    expect(simulation.samples).toBe(1);
    expect(simulation.thingCount).toBe(2);
  });

  it("supports additive and toggle selection plus batch clearing", () => {
    const simulation = new Simulation(() => 0.5, false);
    simulation.seedCells(["4,4", "5,4"]);
    simulation.selectCell("4,4");
    simulation.selectCell("5,4", "add");
    simulation.selectCell("4,4", "toggle");

    expect([...simulation.selectedKeys]).toEqual(["5,4"]);
    expect(simulation.clearCells(["4,4", "5,4"])).toBe(2);
    expect(simulation.thingCount).toBe(0);
  });

  it("freezes simulation time while paused", () => {
    const simulation = new Simulation(() => 0.5, false);
    simulation.seedCells(["4,4"]);
    simulation.setPaused(true);

    expect(simulation.advance(TICK_MS * 4)).toBe(0);
    expect(simulation.ticks).toBe(0);
    expect(simulation.cellAt("4,4")?.things[0]?.progressTicks).toBe(0);
  });
});
