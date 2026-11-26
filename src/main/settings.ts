import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

export type Settings = { window?: { x: number; y: number } };

export function loadSettings(file: string): Settings {
  let parsed: unknown;

  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return {};
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {};
  }

  const window = (parsed as { window?: unknown }).window;

  if (typeof window !== "object" || window === null || Array.isArray(window)) {
    return {};
  }

  const { x, y } = window as { x?: unknown; y?: unknown };

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
  const directory = dirname(file);
  const temporary = join(directory, `.${basename(file)}.${randomUUID()}.tmp`);

  mkdirSync(directory, { recursive: true });

  try {
    writeFileSync(temporary, JSON.stringify(settings));
    renameSync(temporary, file);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
}
