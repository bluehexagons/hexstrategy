import { describe, expect, it } from "vitest";
import { calculateHexSize, isPointInHex } from "./renderer";

describe("isPointInHex", () => {
  const center = { x: 100, y: 100 };

  it("accepts the center and points inside the six edges", () => {
    expect(isPointInHex(center, center, 40)).toBe(true);
    expect(isPointInHex({ x: 130, y: 100 }, center, 40)).toBe(true);
    expect(isPointInHex({ x: 100, y: 135 }, center, 40)).toBe(true);
  });

  it("rejects points outside corner and edge boundaries", () => {
    expect(isPointInHex({ x: 136, y: 100 }, center, 40)).toBe(false);
    expect(isPointInHex({ x: 128, y: 125 }, center, 40)).toBe(false);
    expect(isPointInHex({ x: 100, y: 141 }, center, 40)).toBe(false);
  });
});

describe("calculateHexSize", () => {
  it("keeps the board scale positive in collapsed containers", () => {
    expect(calculateHexSize(0, 0, 18, 11)).toBe(1);
  });

  it("uses compact padding to preserve mobile touch targets", () => {
    expect(calculateHexSize(390, 390, 18, 11)).toBeCloseTo(19.5);
  });
});
