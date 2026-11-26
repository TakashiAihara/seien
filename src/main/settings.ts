import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type Settings = { window?: { x: number; y: number }; avatarPath?: string };

export function loadSettings(file: string): Settings {
  let parsed: unknown;

  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return {};
  }

  if (typeof parsed !== "object" || parsed === null) {
    return {};
  }

  const source = parsed as { window?: unknown; avatarPath?: unknown };
  const settings: Settings = {};

  if (typeof source.window === "object" && source.window !== null) {
    const window = source.window as { x?: unknown; y?: unknown };

    if (
      typeof window.x === "number" &&
      typeof window.y === "number" &&
      Number.isInteger(window.x) &&
      Number.isInteger(window.y)
    ) {
      settings.window = { x: window.x, y: window.y };
    }
  }

  if (typeof source.avatarPath === "string" && source.avatarPath.length > 0) {
    settings.avatarPath = source.avatarPath;
  }

  return settings;
}

export function saveSettings(file: string, settings: Settings): void {
  const temporary = `${file}.tmp`;

  mkdirSync(dirname(file), { recursive: true });

  try {
    writeFileSync(temporary, JSON.stringify(settings));
    renameSync(temporary, file);
  } catch (error) {
    try {
      rmSync(temporary, { force: true });
    } catch {
      // Preserve the original write or rename failure.
    }

    throw error;
  }
}
