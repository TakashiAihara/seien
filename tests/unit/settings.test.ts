import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadSettings, saveSettings } from "../../src/main/settings";

function withDir(run: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "seien-settings-"));

  try {
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("loadSettings", () => {
  test("returns empty settings when the file does not exist", () => {
    withDir((dir) => {
      expect(loadSettings(join(dir, "settings.json"))).toEqual({});
    });
  });

  test("returns empty settings when the file is not JSON", () => {
    withDir((dir) => {
      const file = join(dir, "settings.json");
      writeFileSync(file, "{ not json");

      expect(loadSettings(file)).toEqual({});
    });
  });

  test.each(["[1, 2]", "null", "5"])("returns empty settings when the JSON is %s", (json) => {
    withDir((dir) => {
      const file = join(dir, "settings.json");
      writeFileSync(file, json);

      expect(loadSettings(file)).toEqual({});
    });
  });

  test("reads the saved window position", () => {
    withDir((dir) => {
      const file = join(dir, "settings.json");
      writeFileSync(file, JSON.stringify({ window: { x: 137, y: -211 } }));

      expect(loadSettings(file)).toEqual({ window: { x: 137, y: -211 } });
    });
  });

  test.each([
    ["x is a string", { x: "137", y: 211 }],
    ["y is missing", { x: 137 }],
    ["x is null", { x: null, y: 211 }],
    ["x is fractional", { x: 137.5, y: 211 }],
    ["y is fractional", { x: 137, y: 211.5 }],
    ["window is null", null],
    ["window is not an object", "137,211"],
  ])("drops the window position when %s", (_name, window) => {
    withDir((dir) => {
      const file = join(dir, "settings.json");
      writeFileSync(file, JSON.stringify({ window }));

      expect(loadSettings(file)).toEqual({});
    });
  });
});

describe("saveSettings", () => {
  test("throws and leaves no temporary file behind when the target cannot be replaced", () => {
    withDir((dir) => {
      const file = join(dir, "settings.json");
      mkdirSync(join(file, "occupied"), { recursive: true });

      expect(() => saveSettings(file, { window: { x: 1, y: 2 } })).toThrow(/settings\.json/);
      expect(readdirSync(dir)).toEqual(["settings.json"]);
    });
  });

  test("writes settings that loadSettings reads back", () => {
    withDir((dir) => {
      const file = join(dir, "settings.json");
      saveSettings(file, { window: { x: 42, y: 77 } });

      expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ window: { x: 42, y: 77 } });
      expect(loadSettings(file)).toEqual({ window: { x: 42, y: 77 } });
    });
  });

  test("creates the parent directory", () => {
    withDir((dir) => {
      const file = join(dir, "nested", "deeper", "settings.json");
      saveSettings(file, { window: { x: 1, y: 2 } });

      expect(loadSettings(file)).toEqual({ window: { x: 1, y: 2 } });
    });
  });

  test("replaces an existing file and leaves no temporary file behind", () => {
    withDir((dir) => {
      const file = join(dir, "settings.json");
      saveSettings(file, { window: { x: 1, y: 2 } });
      saveSettings(file, { window: { x: 3, y: 4 } });

      expect(loadSettings(file)).toEqual({ window: { x: 3, y: 4 } });
      expect(readdirSync(dir)).toEqual(["settings.json"]);
    });
  });
});
