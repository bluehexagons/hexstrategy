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

  it("keeps water and occupied cells out of movement range", () => {
    const game = new Game();
    game.selectCell("1,4");

    const reachable = game.reachableCells(game.selectedUnit!);

    expect(reachable.has("4,3")).toBe(false);
    expect(reachable.has("2,5")).toBe(false);
    expect(reachable.get("3,3")).toBe(3);
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

  it("resets player orders after the enemy finishes", () => {
    const game = new Game();
    game.selectCell("1,4");
    game.selectCell("3,3");

    game.endPlayerTurn();

    expect(game.round).toBe(2);
    expect(game.units.filter(({ team }) => team === "player").every(({ moved, attacked }) => !moved && !attacked)).toBe(true);
    expect(game.units.filter(({ team }) => team === "enemy").every(({ moved, attacked }) => moved && attacked)).toBe(true);
  });

  it("ends the mission when the rival disables the last player unit", () => {
    const game = new Game();
    const player = game.units.find(({ id }) => id === "player-vanguard");
    const enemy = game.units.find(({ id }) => id === "enemy-warden");
    if (!player || !enemy) throw new Error("Expected demo units are missing");
    player.column = 4;
    player.row = 4;
    player.health = 2;
    enemy.column = 4;
    enemy.row = 3;
    game.units = [player, enemy];

    game.endPlayerTurn();

    expect(game.status).toBe("enemyWon");
    expect(game.units).not.toContain(player);
  });
});
