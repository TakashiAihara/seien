import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type ElectronApplication, _electron as electron, expect, test } from "@playwright/test";

function launch(userData: string): Promise<ElectronApplication> {
  // Chromium's sandbox does not start as root or where unprivileged user namespaces are
  // restricted, which covers the Linux machines these tests run on.
  const linuxArgs = process.platform === "linux" ? ["--no-sandbox"] : [];

  return electron.launch({ args: [".", `--user-data-dir=${userData}`, ...linuxArgs] });
}

async function quit(app: ElectronApplication): Promise<void> {
  const closed = app.waitForEvent("close");
  // The evaluate call can reject because the process exits underneath it.
  await app.evaluate(({ app }) => app.quit()).catch(() => {});
  await closed;
}

test("opens one frameless, transparent, always-on-top window", async ({}, testInfo) => {
  const app = await launch(testInfo.outputPath("user-data"));

  try {
    const page = await app.firstWindow();
    const info = await app.evaluate(({ BrowserWindow }) => {
      const windows = BrowserWindow.getAllWindows();
      const win = windows[0];
      if (!win) throw new Error("no window");

      return {
        count: windows.length,
        alwaysOnTop: win.isAlwaysOnTop(),
        visible: win.isVisible(),
        resizable: win.isResizable(),
        minimizable: win.isMinimizable(),
        bounds: win.getBounds(),
        contentBounds: win.getContentBounds(),
        backgroundColor: win.getBackgroundColor(),
      };
    });

    expect(info.count).toBe(1);
    expect(info.alwaysOnTop).toBe(true);
    expect(info.visible).toBe(true);
    expect(info.resizable).toBe(false);
    // Hidden from the taskbar, a minimized window would have nothing to restore it from.
    expect(info.minimizable).toBe(false);
    // A frameless window has no title bar or border, so the content fills the window. This only
    // tells the two apart where a window manager draws a frame, which Xvfb alone does not.
    expect(info.contentBounds).toEqual(info.bounds);
    expect(info.bounds.width).toBeGreaterThan(100);
    expect(info.bounds.height).toBeGreaterThan(100);
    // Electron reports a transparent window as black, with or without the alpha byte depending
    // on the platform; an opaque window reports its colour (white by default).
    expect(info.backgroundColor).toMatch(/^#(00)?000000$/);
    expect(await page.title()).toBe("seien");
  } finally {
    await quit(app);
  }
});

test("keeps the renderer away from Node", async ({}, testInfo) => {
  const app = await launch(testInfo.outputPath("user-data"));

  try {
    const page = await app.firstWindow();
    const prefs = await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) throw new Error("no window");
      // Present at runtime but missing from Electron's type definitions.
      const webContents = win.webContents as unknown as {
        getLastWebPreferences(): {
          contextIsolation: boolean;
          sandbox: boolean;
          nodeIntegration: boolean;
        };
      };
      const { contextIsolation, sandbox, nodeIntegration } = webContents.getLastWebPreferences();

      return { contextIsolation, sandbox, nodeIntegration };
    });
    expect(prefs).toEqual({ contextIsolation: true, sandbox: true, nodeIntegration: false });

    const leaked = await page.evaluate(() => ({
      require: typeof (globalThis as Record<string, unknown>).require,
      process: typeof (globalThis as Record<string, unknown>).process,
    }));
    expect(leaked).toEqual({ require: "undefined", process: "undefined" });
  } finally {
    await quit(app);
  }
});

test("reopens at the position it had when it was closed", async ({}, testInfo) => {
  const userData = testInfo.outputPath("user-data");

  const first = await launch(userData);

  try {
    await first.firstWindow();
    await first.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) throw new Error("no window");
      win.setPosition(137, 211);
    });
    // X11 applies the move asynchronously; quitting before it lands would save the old position.
    await expect
      .poll(() =>
        first.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getPosition()),
      )
      .toEqual([137, 211]);
  } finally {
    await quit(first);
  }

  const second = await launch(userData);

  try {
    await second.firstWindow();
    const position = await second.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.getPosition(),
    );

    expect(position).toEqual([137, 211]);
  } finally {
    await quit(second);
  }
});

test("ignores a saved position that is on no display", async ({}, testInfo) => {
  const userData = testInfo.outputPath("user-data");
  mkdirSync(userData, { recursive: true });
  writeFileSync(
    join(userData, "settings.json"),
    JSON.stringify({ window: { x: 54321, y: 43210 } }),
  );

  // The window system may pull an off-screen window back to an edge by itself, so the check is
  // that the window lands where a first launch puts it, not merely somewhere visible.
  const positions: (number[] | undefined)[] = [];

  for (const dir of [testInfo.outputPath("fresh-user-data"), userData]) {
    const app = await launch(dir);

    try {
      await app.firstWindow();
      positions.push(
        await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getPosition()),
      );
    } finally {
      await quit(app);
    }
  }

  expect(positions[0]).toHaveLength(2);
  expect(positions[1]).toEqual(positions[0]);
});

test("quits cleanly when the position cannot be saved", async ({}, testInfo) => {
  const userData = testInfo.outputPath("user-data");
  // A directory where the settings file belongs makes every save fail.
  mkdirSync(join(userData, "settings.json", "occupied"), { recursive: true });

  const app = await launch(userData);
  const errors: string[] = [];
  app.process().stderr?.on("data", (chunk: Buffer) => errors.push(chunk.toString()));
  await app.firstWindow();
  await quit(app);

  expect(errors.join("")).toContain("Failed to save settings");
});
