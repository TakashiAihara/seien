import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type ElectronApplication, expect, test } from "@playwright/test";
import { makeVrm } from "../fixtures/make-vrm";
import { launch, quit } from "./app";

type IgnoreCall = { ignore: boolean; forward: boolean };

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

test("asks for a .vrm when no avatar is chosen", async ({}, testInfo) => {
  const app = await launch(testInfo.outputPath("user-data"));

  try {
    const page = await app.firstWindow();

    await expect(page.locator("#hint")).toBeVisible();
    await expect(page.locator("#hint")).toContainText(".vrm");
    await expect(page.locator("#hint")).toContainText("tray");
  } finally {
    await quit(app);
  }
});

for (const [name, prepare] of [
  ["is not a VRM", (path: string) => writeFileSync(path, "this is not a vrm")],
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
      await expect(page.locator("#hint")).toContainText("could not be loaded");
      await expect(page.locator("#hint")).toContainText("tray");
    } finally {
      await quit(app);
    }
  });
}

test("shows the chosen avatar and takes the mouse only on it", async ({}, testInfo) => {
  const userData = testInfo.outputPath("user-data");
  seed(userData, { avatarPath: writeAvatar(testInfo.outputPath("box.vrm")) });

  const app = await launch(userData);
  const errors: string[] = [];
  app.context().on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  app.context().on("weberror", (error) => errors.push(String(error.error())));

  try {
    const page = await app.firstWindow();
    await expect(page.locator("#hint")).toBeHidden();
    const lastIgnoreCall = await recordIgnoreCalls(app);

    // The box is 0.5 m by 1.6 m and the avatar is framed to fill the 400 by 600 window's height,
    // so it covers the centre and leaves the corners empty.
    await page.mouse.move(200, 300);
    await expect.poll(lastIgnoreCall).toEqual({ ignore: false, forward: false });

    await page.mouse.move(5, 5);
    await expect.poll(lastIgnoreCall).toEqual({ ignore: true, forward: true });

    await page.mouse.move(200, 300);
    await expect.poll(lastIgnoreCall).toEqual({ ignore: false, forward: false });

    // Loading a textured avatar goes through blob: URLs, which a too-strict CSP reports here.
    expect(errors).toEqual([]);
  } finally {
    await quit(app);
  }
});

test("moves with the mouse when dragged by the avatar and saves where it was dropped", async ({}, testInfo) => {
  const userData = testInfo.outputPath("user-data");
  const avatarPath = writeAvatar(testInfo.outputPath("box.vrm"));
  const settingsFile = seed(userData, { window: { x: 137, y: 211 }, avatarPath });

  const app = await launch(userData);

  try {
    const page = await app.firstWindow();
    await expect(page.locator("#hint")).toBeHidden();
    const lastIgnoreCall = await recordIgnoreCalls(app);
    await page.mouse.move(200, 300);
    await expect.poll(lastIgnoreCall).toEqual({ ignore: false, forward: false });

    await page.mouse.down();
    await page.mouse.move(230, 320);
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getPosition()),
      )
      .toEqual([167, 231]);
    await page.mouse.up();

    await expect
      .poll(() => JSON.parse(readFileSync(settingsFile, "utf8")))
      .toEqual({ window: { x: 167, y: 231 }, avatarPath });
  } finally {
    await quit(app);
  }
});

test("does not move when the drag starts outside the avatar", async ({}, testInfo) => {
  const userData = testInfo.outputPath("user-data");
  seed(userData, {
    window: { x: 137, y: 211 },
    avatarPath: writeAvatar(testInfo.outputPath("box.vrm")),
  });

  const app = await launch(userData);

  try {
    const page = await app.firstWindow();
    await expect(page.locator("#hint")).toBeHidden();
    const lastIgnoreCall = await recordIgnoreCalls(app);
    await page.mouse.move(200, 300);
    await expect.poll(lastIgnoreCall).toEqual({ ignore: false, forward: false });
    await page.mouse.move(5, 5);
    await expect.poll(lastIgnoreCall).toEqual({ ignore: true, forward: true });

    await page.mouse.down();
    await page.mouse.move(35, 25);
    await page.mouse.up();
    // Give a wrongly started drag the same time a real one needs to show up.
    await page.mouse.move(200, 300);
    await expect.poll(lastIgnoreCall).toEqual({ ignore: false, forward: false });

    const position = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.getPosition(),
    );
    expect(position).toEqual([137, 211]);
  } finally {
    await quit(app);
  }
});

test("keeps the chosen avatar when the app quits", async ({}, testInfo) => {
  const userData = testInfo.outputPath("user-data");
  const avatarPath = writeAvatar(testInfo.outputPath("box.vrm"));
  const settingsFile = seed(userData, { avatarPath });

  const app = await launch(userData);
  const page = await app.firstWindow();
  await expect(page.locator("#hint")).toBeHidden();
  await quit(app);

  const saved = JSON.parse(readFileSync(settingsFile, "utf8"));
  expect(saved.avatarPath).toBe(avatarPath);
  expect(Number.isInteger(saved.window.x)).toBe(true);
  expect(Number.isInteger(saved.window.y)).toBe(true);
});
