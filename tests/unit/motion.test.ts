import { describe, expect, test } from "bun:test";
import { blinkWeight, breath } from "../../src/renderer/src/motion";

describe("blinkWeight", () => {
  test("keeps the eyes open between blinks", () => {
    expect(blinkWeight(0)).toBe(0);
    expect(blinkWeight(0.2)).toBeCloseTo(0, 6);
    expect(blinkWeight(1.7)).toBe(0);
    expect(blinkWeight(3.99)).toBe(0);
  });

  test("closes and reopens the eyes within the first 0.2 seconds of every 4", () => {
    expect(blinkWeight(0.1)).toBeCloseTo(1, 6);
    expect(blinkWeight(0.05)).toBeCloseTo(Math.SQRT1_2, 6);
    expect(blinkWeight(0.15)).toBeCloseTo(Math.SQRT1_2, 6);
    expect(blinkWeight(4.1)).toBeCloseTo(1, 6);
    expect(blinkWeight(12.05)).toBeCloseTo(Math.SQRT1_2, 6);
  });
});

describe("breath", () => {
  test("swings between -1 and 1 once every 4 seconds", () => {
    expect(breath(0)).toBeCloseTo(0, 6);
    expect(breath(1)).toBeCloseTo(1, 6);
    expect(breath(2)).toBeCloseTo(0, 6);
    expect(breath(3)).toBeCloseTo(-1, 6);
    expect(breath(5)).toBeCloseTo(1, 6);
    expect(breath(0.5)).toBeCloseTo(Math.SQRT1_2, 6);
  });
});
