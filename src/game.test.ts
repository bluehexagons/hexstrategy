import { describe, expect, it } from "vitest";
import { Game } from "./game";

describe("Game", () => {
  it("creates the demo battlefield", () => {
    const game = new Game();

    expect(game.cells).toHaveLength(70);
    expect(game.units).toHaveLength(6);
    expect(game.relays.map(({ name }) => name)).toEqual(["North Array", "Meridian", "South Array"]);
    expect(game.status).toBe("playing");
  });

  it("moves units through weighted terrain and captures relays", () => {
    const game = new Game();

    game.selectCell("1,4");
    expect(game.reachableCells(game.selectedUnit!)).toHaveProperty("size");
    expect(game.reachableCells(game.selectedUnit!).has("3,3")).toBe(true);

    game.selectCell("3,3");

    expect(game.unitAt("3,3")?.callsign).toBe("Kite");
    expect(game.cellAt("3,3")?.relay?.owner).toBe("player");
    expect(game.selectedUnit?.moved).toBe(true);
    expect(game.reachableCells(game.selectedUnit!)).toHaveLength(0);
  });

  it("resolves attacks and prevents a second strike", () => {
    const game = new Game();
    const lancer = game.units.find(({ id }) => id === "player-lancer");
    const enemy = game.units.find(({ id }) => id === "enemy-vanguard");
    if (!lancer || !enemy) throw new Error("Expected demo units are missing");
    enemy.column = 3;
    enemy.row = 5;

    game.selectCell("1,5");
    game.selectCell("3,5");

    expect(enemy.health).toBe(2);
    expect(lancer.attacked).toBe(true);
    expect(game.attackableUnits(lancer)).toHaveLength(0);
  });

  it("scores controlled relays before the rival turn", () => {
    const game = new Game();
    game.playerSignal = 5;
    game.selectCell("1,4");
    game.selectCell("3,3");

    game.endPlayerTurn();

    expect(game.playerSignal).toBe(6);
    expect(game.status).toBe("playerWon");
    expect(game.round).toBe(1);
  });
});
