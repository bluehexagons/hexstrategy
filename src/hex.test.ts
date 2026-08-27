import { describe, expect, it } from "vitest";
import { hexDistance, hexKey, neighbors } from "./hex";

describe("hex coordinate helpers", () => {
  it("creates stable coordinate keys", () => {
    expect(hexKey({ column: 4, row: 2 })).toBe("4,2");
  });

  it("returns six neighbors for even and odd rows", () => {
    expect(neighbors({ column: 3, row: 2 })).toHaveLength(6);
    expect(neighbors({ column: 3, row: 3 })).toContainEqual({ column: 4, row: 2 });
  });

  it("measures distance on an odd-row offset grid", () => {
    expect(hexDistance({ column: 1, row: 4 }, { column: 3, row: 3 })).toBe(3);
    expect(hexDistance({ column: 2, row: 2 }, { column: 2, row: 2 })).toBe(0);
  });
});
