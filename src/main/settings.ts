import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type Settings = { window?: { x: number; y: number } };

export function loadSettings(file: string): Settings {
  let parsed: unknown;

  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return {};
  }

  const window = (parsed as { window?: { x?: unknown; y?: unknown } | null } | null)?.window;
  const x = window?.x;
  const y = window?.y;

  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    !Number.isInteger(x) ||
    !Number.isInteger(y)
  ) {
    return {};
  }

  return { window: { x, y } };
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
