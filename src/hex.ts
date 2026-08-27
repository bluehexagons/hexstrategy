export interface HexCoordinate {
  column: number;
  row: number;
}

export const hexKey = ({ column, row }: HexCoordinate): string => `${column},${row}`;

const EVEN_ROW_DIRECTIONS: readonly HexCoordinate[] = [
  { column: 1, row: 0 },
  { column: -1, row: 0 },
  { column: 0, row: -1 },
  { column: -1, row: -1 },
  { column: 0, row: 1 },
  { column: -1, row: 1 },
];

const ODD_ROW_DIRECTIONS: readonly HexCoordinate[] = [
  { column: 1, row: 0 },
  { column: -1, row: 0 },
  { column: 1, row: -1 },
  { column: 0, row: -1 },
  { column: 1, row: 1 },
  { column: 0, row: 1 },
];

export function neighbors(coordinate: HexCoordinate): HexCoordinate[] {
  const directions = coordinate.row % 2 === 0 ? EVEN_ROW_DIRECTIONS : ODD_ROW_DIRECTIONS;
  return directions.map(({ column, row }) => ({
    column: coordinate.column + column,
    row: coordinate.row + row,
  }));
}

interface CubeCoordinate {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

function toCube({ column, row }: HexCoordinate): CubeCoordinate {
  const x = column - (row - (row & 1)) / 2;
  const z = row;
  return { x, y: -x - z, z };
}

export function hexDistance(a: HexCoordinate, b: HexCoordinate): number {
  const first = toCube(a);
  const second = toCube(b);
  return Math.max(
    Math.abs(first.x - second.x),
    Math.abs(first.y - second.y),
    Math.abs(first.z - second.z),
  );
}
