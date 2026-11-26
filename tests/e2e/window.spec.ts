import { type ElectronApplication, _electron as electron, expect, test } from "@playwright/test";

function launch(userData: string): Promise<ElectronApplication> {
  // Chromium refuses to run sandboxed as root, which is how Linux CI containers run.
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
        bounds: win.getBounds(),
        contentBounds: win.getContentBounds(),
        backgroundColor: win.getBackgroundColor(),
      };
    });

    expect(info.count).toBe(1);
    expect(info.alwaysOnTop).toBe(true);
    expect(info.visible).toBe(true);
    expect(info.resizable).toBe(false);
    // A frameless window has no title bar or border, so the content fills the window.
    expect(info.contentBounds).toEqual(info.bounds);
    expect(info.bounds.width).toBeGreaterThan(100);
    expect(info.bounds.height).toBeGreaterThan(100);
    // Electron reports a transparent window as black, with or without the alpha byte depending
    // on the platform; an opaque window reports its colour (white by default).
    expect(info.backgroundColor).toMatch(/^#(00)?000000$/);

    const pageBackgrounds = await page.evaluate(() => [
      getComputedStyle(document.documentElement).backgroundColor,
      getComputedStyle(document.body).backgroundColor,
    ]);
    expect(pageBackgrounds).toEqual(["rgba(0, 0, 0, 0)", "rgba(0, 0, 0, 0)"]);
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
  await first.firstWindow();
  await first.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setPosition(137, 211);
  });
  await quit(first);

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
