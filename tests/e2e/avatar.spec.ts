import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type ElectronApplication, type Page, expect, test } from "@playwright/test";
import { makeVrm } from "../fixtures/make-vrm";
import { launch, quit } from "./app";

type IgnoreCall = { ignore: boolean; forward: boolean };

const onAvatar = { ignore: false, forward: false };
const offAvatar = { ignore: true, forward: true };

// Framed to fill the window's height, the body covers x 55 to 225 over nearly the whole height
// and the flag covers x 275 to 345, y 60 to 135. The points away from the avatar are where a hit
// test flipped vertically or horizontally would find the flag or the body.
const probes = [
  [140, 300, onAvatar],
  [5, 5, offAvatar],
  [310, 98, onAvatar],
  [310, 502, offAvatar],
  [140, 300, onAvatar],
  [310, 300, offAvatar],
] as const;

function seed(userData: string, settings: unknown): string {
  const file = join(userData, "settings.json");
  mkdirSync(userData, { recursive: true });
  writeFileSync(file, JSON.stringify(settings));

  return file;
}

function writeAvatar(path: string): string {
  writeFileSync(path, makeVrm({ textured: true }));

  return path;
}

// Records what the app asks of the window instead of letting it through, so the test sees the
// decision the app made rather than what a given window system does with it.
async function recordIgnoreCalls(
  app: ElectronApplication,
): Promise<() => Promise<IgnoreCall | undefined>> {
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) throw new Error("no window");
    const calls: IgnoreCall[] = [];
    (globalThis as unknown as { ignoreCalls: IgnoreCall[] }).ignoreCalls = calls;
    win.setIgnoreMouseEvents = (ignore, options) => {
      calls.push({ ignore, forward: options?.forward === true });
    };
  });

  return () =>
    app.evaluate(() => (globalThis as unknown as { ignoreCalls: IgnoreCall[] }).ignoreCalls.at(-1));
}

// The app follows the real cursor while dragging, and Playwright's mouse does not move it.
async function putCursorAt(app: ElectronApplication, x: number, y: number): Promise<void> {
  await app.evaluate(
    ({ screen }, point) => {
      screen.getCursorScreenPoint = () => point;
    },
    { x, y },
  );
}

function windowPosition(app: ElectronApplication): Promise<number[] | undefined> {
  return app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getPosition());
}

async function shownAvatar(
  userData: string,
  extraArgs: string[] = [],
): Promise<{
  app: ElectronApplication;
  page: Page;
  lastIgnoreCall: () => Promise<IgnoreCall | undefined>;
}> {
  const app = await launch(userData, extraArgs);

  try {
    const page = await app.firstWindow();
    await expect(page.locator("#hint")).toBeHidden();
    await expect(page.locator("#hint")).toHaveText("");
    const lastIgnoreCall = await recordIgnoreCalls(app);

    return { app, page, lastIgnoreCall };
  } catch (error) {
    await quit(app);
    throw error;
  }
}

test("asks for a .vrm when no avatar is chosen", async ({}, testInfo) => {
  const app = await launch(testInfo.outputPath("user-data"));

  try {
    const page = await app.firstWindow();

    await expect(page.locator("#hint")).toBeVisible();
    await expect(page.locator("#hint")).toHaveText("Choose an avatar (.vrm) from the tray menu.");
  } finally {
    await quit(app);
  }
});

for (const [name, prepare] of [
  ["is not a VRM", (path: string) => writeFileSync(path, "this is not a vrm")],
  [
    "is a 3D model without VRM data",
    (path: string) => writeFileSync(path, makeVrm({ textured: false, vrm: false })),
  ],
  ["no longer exists", () => {}],
] as const) {
  test(`says the avatar could not be loaded when the chosen file ${name}`, async ({}, testInfo) => {
    const userData = testInfo.outputPath("user-data");
    const avatarPath = testInfo.outputPath("broken.vrm");
    prepare(avatarPath);
    seed(userData, { avatarPath });

    const app = await launch(userData);

    try {
      const page = await app.firstWindow();

      await expect(page.locator("#hint")).toBeVisible();
      await expect(page.locator("#hint")).toHaveText(
        "The avatar could not be loaded. Choose another .vrm from the tray menu.",
      );
    } finally {
      await quit(app);
    }
  });
}

for (const [name, extraArgs] of [
  ["at 100% display scale", []],
  ["at 150% display scale", ["--force-device-scale-factor=1.5"]],
] as const) {
  test(`shows the chosen avatar and takes the mouse only on it ${name}`, async ({}, testInfo) => {
    const userData = testInfo.outputPath("user-data");
    seed(userData, { avatarPath: writeAvatar(testInfo.outputPath("box.vrm")) });
    const { app, page, lastIgnoreCall } = await shownAvatar(userData, [...extraArgs]);

    try {
      for (const [x, y, expected] of probes) {
        await page.mouse.move(x, y);
        await expect.poll(lastIgnoreCall, `pointer at ${x}, ${y}`).toEqual(expected);
      }
    } finally {
      await quit(app);
    }
  });
}

test("loads a textured avatar without tripping the content security policy", async ({}, testInfo) => {
  const userData = testInfo.outputPath("user-data");
  seed(userData, { avatarPath: writeAvatar(testInfo.outputPath("box.vrm")) });

  const app = await launch(userData);
  const errors: string[] = [];
  // Attached before the window exists, so nothing logged while loading is missed.
  app.context().on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  app.context().on("weberror", (error) => errors.push(String(error.error())));

  try {
    const page = await app.firstWindow();
    await expect(page.locator("#hint")).toBeHidden();

    expect(errors).toEqual([]);
  } finally {
    await quit(app);
  }
});

test("stops taking the mouse when the pointer leaves the window from the avatar", async ({}, testInfo) => {
  const userData = testInfo.outputPath("user-data");
  seed(userData, { avatarPath: writeAvatar(testInfo.outputPath("box.vrm")) });
  const { app, page, lastIgnoreCall } = await shownAvatar(userData);

  try {
    await page.mouse.move(140, 300);
    await expect.poll(lastIgnoreCall).toEqual(onAvatar);

    await page.dispatchEvent("#avatar", "pointerleave");
    await expect.poll(lastIgnoreCall).toEqual(offAvatar);
  } finally {
    await quit(app);
  }
});

test("follows the cursor when dragged by the avatar and saves where it was dropped", async ({}, testInfo) => {
  const userData = testInfo.outputPath("user-data");
  const avatarPath = writeAvatar(testInfo.outputPath("box.vrm"));
  const settingsFile = seed(userData, { window: { x: 137, y: 211 }, avatarPath });
  const { app, page, lastIgnoreCall } = await shownAvatar(userData);

  try {
    await putCursorAt(app, 1000, 1000);
    await page.mouse.move(140, 300);
    await expect.poll(lastIgnoreCall).toEqual(onAvatar);
    await page.mouse.down();

    await putCursorAt(app, 1030, 1020);
    await page.mouse.move(141, 301);
    await expect.poll(() => windowPosition(app)).toEqual([167, 231]);

    // More mouse moves with the cursor in the same place must not push the window further.
    await page.mouse.move(150, 310, { steps: 5 });
    // While dragging, the pointer may get ahead of the avatar; the window must keep the mouse.
    await page.mouse.move(5, 5);
    await putCursorAt(app, 1010, 1040);
    await page.mouse.move(6, 6);
    await expect.poll(() => windowPosition(app)).toEqual([147, 251]);
    expect(await lastIgnoreCall()).toEqual(onAvatar);

    await page.mouse.up();
    await expect
      .poll(() => JSON.parse(readFileSync(settingsFile, "utf8")))
      .toEqual({ window: { x: 147, y: 251 }, avatarPath });
    await expect.poll(lastIgnoreCall, "the pointer was left off the avatar").toEqual(offAvatar);

    await putCursorAt(app, 1500, 1500);
    await page.mouse.move(140, 300);
    await expect.poll(lastIgnoreCall).toEqual(onAvatar);
    expect(await windowPosition(app)).toEqual([147, 251]);
  } finally {
    await quit(app);
  }
});

for (const [name, press] of [
  ["starts outside the avatar", { x: 5, y: 5, button: "left", ignoring: offAvatar }],
  ["uses the right mouse button", { x: 140, y: 300, button: "right", ignoring: onAvatar }],
] as const) {
  test(`does not move when the drag ${name}`, async ({}, testInfo) => {
    const userData = testInfo.outputPath("user-data");
    seed(userData, {
      window: { x: 137, y: 211 },
      avatarPath: writeAvatar(testInfo.outputPath("box.vrm")),
    });
    const { app, page, lastIgnoreCall } = await shownAvatar(userData);

    try {
      await putCursorAt(app, 1000, 1000);
      await page.mouse.move(140, 300);
      await expect.poll(lastIgnoreCall).toEqual(onAvatar);
      await page.mouse.move(press.x, press.y);
      await expect.poll(lastIgnoreCall).toEqual(press.ignoring);

      await page.mouse.down({ button: press.button });
      await putCursorAt(app, 1030, 1020);
      await page.mouse.move(press.x + 30, press.y + 20);
      await page.mouse.up({ button: press.button });

      // A real drag from the avatar afterwards shows the earlier moves were handled and ignored:
      // it starts from the untouched position.
      await putCursorAt(app, 2000, 2000);
      await page.mouse.move(140, 300);
      await expect.poll(lastIgnoreCall).toEqual(onAvatar);
      await page.mouse.down();
      await putCursorAt(app, 2001, 2002);
      await page.mouse.move(141, 301);
      await expect.poll(() => windowPosition(app)).toEqual([138, 213]);
      await page.mouse.up();
    } finally {
      await quit(app);
    }
  });
}

test("keeps the chosen avatar when the app quits", async ({}, testInfo) => {
  const userData = testInfo.outputPath("user-data");
  const avatarPath = writeAvatar(testInfo.outputPath("box.vrm"));
  const settingsFile = seed(userData, { avatarPath });
  const { app } = await shownAvatar(userData);
  await quit(app);

  const saved = JSON.parse(readFileSync(settingsFile, "utf8"));
  expect(saved.avatarPath).toBe(avatarPath);
  expect(Number.isInteger(saved.window.x)).toBe(true);
  expect(Number.isInteger(saved.window.y)).toBe(true);
});

test("exposes only its own functions to the page and ignores malformed requests", async ({}, testInfo) => {
  const userData = testInfo.outputPath("user-data");
  seed(userData, {
    window: { x: 137, y: 211 },
    avatarPath: writeAvatar(testInfo.outputPath("box.vrm")),
  });
  const { app, page, lastIgnoreCall } = await shownAvatar(userData);

  try {
    expect(
      await page.evaluate(() =>
        Object.keys((globalThis as unknown as { seien: object }).seien).sort(),
      ),
    ).toEqual(["dragEnd", "dragMove", "dragStart", "loadAvatar", "onAvatarChanged", "setHit"]);

    await page.mouse.move(140, 300);
    await expect.poll(lastIgnoreCall).toEqual(onAvatar);

    await putCursorAt(app, 1000, 1000);
    await page.evaluate(() => {
      const api = (globalThis as unknown as { seien: Record<string, (...args: unknown[]) => void> })
        .seien;
      api.setHit?.("yes");
      api.setHit?.(0);
      // A move without a drag in progress.
      api.dragMove?.();
      api.dragStart?.();
    });
    await putCursorAt(app, 1001, 1002);
    await page.evaluate(() => {
      (globalThis as unknown as { seien: Record<string, () => void> }).seien.dragMove?.();
    });

    await expect.poll(() => windowPosition(app)).toEqual([138, 213]);
    expect(await lastIgnoreCall()).toEqual(onAvatar);

    // A move after the drag has ended, followed by a fresh drag that shows where the window was.
    await page.evaluate(() => {
      (globalThis as unknown as { seien: Record<string, () => void> }).seien.dragEnd?.();
    });
    await putCursorAt(app, 1500, 1500);
    await page.evaluate(() => {
      const api = (globalThis as unknown as { seien: Record<string, () => void> }).seien;
      api.dragMove?.();
      api.dragStart?.();
    });
    await putCursorAt(app, 1510, 1520);
    await page.evaluate(() => {
      (globalThis as unknown as { seien: Record<string, () => void> }).seien.dragMove?.();
    });

    await expect.poll(() => windowPosition(app)).toEqual([148, 233]);
  } finally {
    await quit(app);
  }
});
