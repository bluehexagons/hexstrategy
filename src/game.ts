import { hexDistance, hexKey, neighbors, type HexCoordinate } from "./hex";

export type Team = "player" | "enemy";
export type Terrain = "plain" | "forest" | "ridge" | "water";
export type UnitRole = "vanguard" | "warden" | "lancer";
export type GameStatus = "playing" | "playerWon" | "enemyWon";

export interface Relay {
  readonly key: string;
  readonly name: string;
  owner: Team | null;
}

export interface HexCell extends HexCoordinate {
  readonly key: string;
  readonly terrain: Terrain;
  readonly movementCost: number;
  relay?: Relay;
}

export interface Unit extends HexCoordinate {
  readonly id: string;
  readonly callsign: string;
  readonly role: UnitRole;
  readonly team: Team;
  readonly maxHealth: number;
  readonly movement: number;
  readonly range: number;
  readonly damage: number;
  health: number;
  moved: boolean;
  attacked: boolean;
}

export interface RoleDetails {
  readonly label: string;
  readonly symbol: string;
  readonly summary: string;
}

export const SIGNAL_TARGET = 6;

export const ROLE_DETAILS: Readonly<Record<UnitRole, RoleDetails>> = {
  vanguard: { label: "Vanguard", symbol: "V", summary: "Fast recon specialist" },
  warden: { label: "Warden", symbol: "W", summary: "Armored line holder" },
  lancer: { label: "Lancer", symbol: "L", summary: "Ranged strike unit" },
};

const TERRAIN_COST: Readonly<Record<Terrain, number>> = {
  plain: 1,
  forest: 2,
  ridge: 2,
  water: Number.POSITIVE_INFINITY,
};

const TERRAIN_MAP = [
  "WWRPPFPPWW",
  "WPPRPFFPPW",
  "PPFFPPPPPP",
  "PPRPWFPPPP",
  "PPPPWFPPPP",
  "PFPPPPFRPP",
  "WWPPFRPPWW",
] as const;

const TERRAIN_CODE: Readonly<Record<string, Terrain>> = {
  P: "plain",
  F: "forest",
  R: "ridge",
  W: "water",
};

const RELAYS = [
  { column: 4, row: 1, name: "North Array" },
  { column: 3, row: 3, name: "Meridian" },
  { column: 6, row: 5, name: "South Array" },
] as const;

interface UnitTemplate extends HexCoordinate {
  readonly id: string;
  readonly callsign: string;
  readonly role: UnitRole;
  readonly team: Team;
}

const STARTING_UNITS: readonly UnitTemplate[] = [
  { id: "player-vanguard", callsign: "Kite", role: "vanguard", team: "player", column: 1, row: 4 },
  { id: "player-warden", callsign: "Bastion", role: "warden", team: "player", column: 2, row: 5 },
  { id: "player-lancer", callsign: "Arc", role: "lancer", team: "player", column: 1, row: 5 },
  { id: "enemy-vanguard", callsign: "Rook", role: "vanguard", team: "enemy", column: 8, row: 2 },
  { id: "enemy-warden", callsign: "Anvil", role: "warden", team: "enemy", column: 7, row: 1 },
  { id: "enemy-lancer", callsign: "Flare", role: "lancer", team: "enemy", column: 8, row: 1 },
];

const UNIT_STATS: Readonly<Record<UnitRole, Pick<Unit, "maxHealth" | "movement" | "range" | "damage">>> = {
  vanguard: { maxHealth: 4, movement: 4, range: 1, damage: 2 },
  warden: { maxHealth: 7, movement: 2, range: 1, damage: 3 },
  lancer: { maxHealth: 5, movement: 3, range: 2, damage: 2 },
};

function createUnit(template: UnitTemplate): Unit {
  const stats = UNIT_STATS[template.role];
  return {
    ...template,
    ...stats,
    health: stats.maxHealth,
    moved: false,
    attacked: false,
  };
}

export class Game {
  readonly columns = TERRAIN_MAP[0].length;
  readonly rows = TERRAIN_MAP.length;
  readonly cells = new Map<string, HexCell>();
  units: Unit[] = STARTING_UNITS.map(createUnit);
  selectedUnitId: string | null = null;
  round = 1;
  playerSignal = 0;
  enemySignal = 0;
  status: GameStatus = "playing";
  resultMessage = "";
  activity: string[] = [
    "Field link established. Northstar has initiative.",
    "Three neutral relay stations detected.",
  ];

  constructor() {
    for (const [row, terrainRow] of TERRAIN_MAP.entries()) {
      for (const [column, code] of [...terrainRow].entries()) {
        const terrain = TERRAIN_CODE[code];
        if (!terrain) throw new Error(`Unknown terrain code: ${code}`);
        const coordinate = { column, row };
        this.cells.set(hexKey(coordinate), {
          ...coordinate,
          key: hexKey(coordinate),
          terrain,
          movementCost: TERRAIN_COST[terrain],
        });
      }
    }

    for (const relay of RELAYS) {
      const cell = this.cellAt(relay);
      if (!cell) throw new Error(`Relay ${relay.name} is outside the map`);
      cell.relay = { key: cell.key, name: relay.name, owner: null };
    }
  }

  get selectedUnit(): Unit | null {
    return this.units.find(({ id }) => id === this.selectedUnitId) ?? null;
  }

  get relays(): Relay[] {
    return [...this.cells.values()].flatMap((cell) => (cell.relay ? [cell.relay] : []));
  }

  cellAt(coordinate: HexCoordinate | string): HexCell | undefined {
    return this.cells.get(typeof coordinate === "string" ? coordinate : hexKey(coordinate));
  }

  unitAt(coordinate: HexCoordinate | string): Unit | undefined {
    const key = typeof coordinate === "string" ? coordinate : hexKey(coordinate);
    return this.units.find((unit) => hexKey(unit) === key);
  }

  selectCell(key: string): void {
    if (this.status !== "playing") return;
    const clickedUnit = this.unitAt(key);
    const selected = this.selectedUnit;

    if (selected && clickedUnit?.team === "enemy" && this.attackableUnits(selected).some(({ id }) => id === clickedUnit.id)) {
      this.attack(selected, clickedUnit);
      return;
    }

    if (selected && !clickedUnit && this.reachableCells(selected).has(key)) {
      this.move(selected, key);
      return;
    }

    if (clickedUnit?.team === "player") {
      this.selectedUnitId = clickedUnit.id;
      return;
    }

    this.selectedUnitId = null;
  }

  reachableCells(unit: Unit): Map<string, number> {
    const reachable = new Map<string, number>();
    if (unit.moved || unit.health <= 0) return reachable;

    const startKey = hexKey(unit);
    const frontier: Array<{ key: string; cost: number }> = [{ key: startKey, cost: 0 }];
    const visited = new Map<string, number>([[startKey, 0]]);

    while (frontier.length > 0) {
      frontier.sort((a, b) => a.cost - b.cost);
      const current = frontier.shift();
      if (!current) break;
      const cell = this.cellAt(current.key);
      if (!cell) continue;

      for (const coordinate of neighbors(cell)) {
        const next = this.cellAt(coordinate);
        if (!next || !Number.isFinite(next.movementCost) || this.unitAt(next.key)) continue;
        const cost = current.cost + next.movementCost;
        if (cost > unit.movement || cost >= (visited.get(next.key) ?? Number.POSITIVE_INFINITY)) continue;
        visited.set(next.key, cost);
        reachable.set(next.key, cost);
        frontier.push({ key: next.key, cost });
      }
    }

    return reachable;
  }

  attackableUnits(unit: Unit): Unit[] {
    if (unit.attacked || unit.health <= 0) return [];
    return this.units.filter(
      (candidate) => candidate.team !== unit.team && hexDistance(unit, candidate) <= unit.range,
    );
  }

  endPlayerTurn(): void {
    if (this.status !== "playing") return;
    this.selectedUnitId = null;
    this.scoreRelays("player");
    if (this.checkForWinner()) return;

    this.log("Redline is calculating a counter-move.");
    this.runEnemyTurn();
    if (this.status !== "playing") return;

    this.round += 1;
    for (const unit of this.units) {
      unit.moved = unit.team === "enemy";
      unit.attacked = unit.team === "enemy";
    }
    this.log(`Round ${this.round}: Northstar ready.`);
  }

  private move(unit: Unit, destinationKey: string): void {
    const destination = this.cellAt(destinationKey);
    if (!destination) return;
    unit.column = destination.column;
    unit.row = destination.row;
    unit.moved = true;
    this.log(`${unit.callsign} advanced to sector ${destination.column + 1}.${destination.row + 1}.`);
    this.captureRelay(unit);
  }

  private attack(attacker: Unit, defender: Unit): void {
    defender.health -= attacker.damage;
    attacker.attacked = true;
    this.log(`${attacker.callsign} hit ${defender.callsign} for ${attacker.damage}.`);

    if (defender.health <= 0) {
      this.destroyUnit(defender, attacker);
    } else if (hexDistance(attacker, defender) === 1) {
      attacker.health -= 1;
      this.log(`${defender.callsign} returned 1 damage.`);
      if (attacker.health <= 0) this.destroyUnit(attacker, defender);
    }

    this.checkForWinner();
  }

  private destroyUnit(unit: Unit, attacker: Unit): void {
    this.units = this.units.filter(({ id }) => id !== unit.id);
    if (this.selectedUnitId === unit.id) this.selectedUnitId = null;
    this.log(`${unit.callsign} was disabled by ${attacker.callsign}.`);
  }

  private captureRelay(unit: Unit): void {
    const relay = this.cellAt(unit)?.relay;
    if (!relay || relay.owner === unit.team) return;
    relay.owner = unit.team;
    this.log(`${unit.callsign} linked ${relay.name} for ${unit.team === "player" ? "Northstar" : "Redline"}.`);
  }

  private scoreRelays(team: Team): void {
    const controlled = this.relays.filter(({ owner }) => owner === team).length;
    if (team === "player") this.playerSignal += controlled;
    else this.enemySignal += controlled;
    if (controlled > 0) this.log(`${team === "player" ? "Northstar" : "Redline"} gained ${controlled} signal.`);
  }

  private runEnemyTurn(): void {
    const enemies = this.units.filter(({ team }) => team === "enemy");
    for (const enemy of enemies) {
      if (!this.units.includes(enemy) || this.status !== "playing") continue;
      enemy.moved = false;
      enemy.attacked = false;

      let target = this.closestAttackTarget(enemy);
      if (!target) {
        const destination = this.chooseEnemyDestination(enemy);
        if (destination) this.move(enemy, destination);
        target = this.closestAttackTarget(enemy);
      }
      if (target) this.attack(enemy, target);
    }

    if (this.status !== "playing") return;
    this.scoreRelays("enemy");
    this.checkForWinner();
  }

  private closestAttackTarget(unit: Unit): Unit | undefined {
    return this.attackableUnits(unit).sort((a, b) => a.health - b.health)[0];
  }

  private chooseEnemyDestination(unit: Unit): string | undefined {
    const reachable = this.reachableCells(unit);
    const relayTargets = [...this.cells.values()].filter((cell) => cell.relay?.owner !== "enemy");
    const playerTargets = this.units.filter(({ team }) => team === "player");
    const targets: HexCoordinate[] = relayTargets.length > 0 ? relayTargets : playerTargets;
    if (targets.length === 0) return undefined;

    return [...reachable.entries()]
      .map(([key, cost]) => {
        const cell = this.cellAt(key);
        const distance = cell ? Math.min(...targets.map((target) => hexDistance(cell, target))) : Number.POSITIVE_INFINITY;
        return { key, score: distance * 10 + cost };
      })
      .sort((a, b) => a.score - b.score || a.key.localeCompare(b.key))[0]?.key;
  }

  private checkForWinner(): boolean {
    const playerUnits = this.units.filter(({ team }) => team === "player").length;
    const enemyUnits = this.units.filter(({ team }) => team === "enemy").length;

    if (this.playerSignal >= SIGNAL_TARGET || enemyUnits === 0) {
      this.status = "playerWon";
      this.resultMessage = enemyUnits === 0
        ? "The rival force is offline. Every relay is open for Northstar."
        : "The relay network is synchronized. Northstar owns the signal frontier.";
    } else if (this.enemySignal >= SIGNAL_TARGET || playerUnits === 0) {
      this.status = "enemyWon";
      this.resultMessage = playerUnits === 0
        ? "Your field team was disabled before the network could come online."
        : "Redline completed its signal chain first. Re-route and try another approach.";
    }

    return this.status !== "playing";
  }

  private log(message: string): void {
    this.activity.unshift(message);
    this.activity = this.activity.slice(0, 6);
  }
}
