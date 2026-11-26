import { describe, expect, test } from "bun:test";
import { isReachable } from "../../src/main/placement";

const primary = { x: 0, y: 0, width: 1920, height: 1040 };
const leftOfPrimary = { x: -1280, y: 0, width: 1280, height: 984 };
const size = { width: 400, height: 600 };

describe("isReachable", () => {
  test("accepts a window fully inside a work area", () => {
    expect(isReachable({ x: 137, y: 211, ...size }, [primary])).toBe(true);
  });

  test("rejects a window on a display that is no longer connected", () => {
    expect(isReachable({ x: 2500, y: 211, ...size }, [primary])).toBe(false);
    expect(isReachable({ x: -900, y: 211, ...size }, [primary])).toBe(false);
    expect(isReachable({ x: 137, y: 3000, ...size }, [primary])).toBe(false);
    expect(isReachable({ x: 137, y: -2000, ...size }, [primary])).toBe(false);
    expect(isReachable({ x: 1e20, y: 211, ...size }, [primary])).toBe(false);
    expect(isReachable({ x: -32000, y: -32000, ...size }, [primary])).toBe(false);
  });

  test("accepts a window on a secondary display", () => {
    expect(isReachable({ x: -900, y: 211, ...size }, [primary, leftOfPrimary])).toBe(true);
  });

  test("measures against a work area that does not start at the origin", () => {
    const belowPrimary = { x: 300, y: 1080, width: 1280, height: 720 };

    expect(isReachable({ x: 400, y: 1700, ...size }, [belowPrimary])).toBe(true);
    expect(isReachable({ x: 400, y: 1080 + 720 - 63, ...size }, [belowPrimary])).toBe(false);
    expect(isReachable({ x: 300 + 1280 - 63, y: 1200, ...size }, [belowPrimary])).toBe(false);
    expect(isReachable({ x: 400, y: 300, ...size }, [belowPrimary])).toBe(false);
    expect(isReachable({ x: -200, y: 1200, ...size }, [belowPrimary])).toBe(false);
  });

  test("needs 64 pixels of the window inside the work area in each direction", () => {
    expect(isReachable({ x: 1920 - 64, y: 211, ...size }, [primary])).toBe(true);
    expect(isReachable({ x: 1920 - 63, y: 211, ...size }, [primary])).toBe(false);
    expect(isReachable({ x: 137, y: 1040 - 64, ...size }, [primary])).toBe(true);
    expect(isReachable({ x: 137, y: 1040 - 63, ...size }, [primary])).toBe(false);
    expect(isReachable({ x: 64 - 400, y: 211, ...size }, [primary])).toBe(true);
    expect(isReachable({ x: 63 - 400, y: 211, ...size }, [primary])).toBe(false);
    expect(isReachable({ x: 137, y: 64 - 600, ...size }, [primary])).toBe(true);
    expect(isReachable({ x: 137, y: 63 - 600, ...size }, [primary])).toBe(false);
  });

  test("does not add up slivers on two displays", () => {
    const straddling = { x: -40, y: 211, width: 80, height: 600 };

    expect(isReachable(straddling, [primary, leftOfPrimary])).toBe(false);
  });

  test("rejects everything when there is no display", () => {
    expect(isReachable({ x: 137, y: 211, ...size }, [])).toBe(false);
  });
});
