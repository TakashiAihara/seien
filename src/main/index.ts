import { join } from "node:path";
import {
  app,
  BrowserWindow,
  Menu,
  screen,
  Tray,
  type BrowserWindowConstructorOptions,
} from "electron";

import { isReachable } from "./placement";
import { loadSettings, saveSettings } from "./settings";

// A Tray is garbage collected unless a reference outlives the creating function.
let tray: Tray | undefined;

const windowSize = { width: 400, height: 600 };

function createWindow(settingsFile: string): void {
  const settings = loadSettings(settingsFile);
  const options: BrowserWindowConstructorOptions = {
    ...windowSize,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    minimizable: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/index.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  };

  if (
    settings.window &&
    isReachable(
      { ...settings.window, ...windowSize },
      screen.getAllDisplays().map((display) => display.workArea),
    )
  ) {
    options.x = settings.window.x;
    options.y = settings.window.y;
  }

  const win = new BrowserWindow(options);

  win.on("close", () => {
    const { x, y } = win.getBounds();

    try {
      saveSettings(settingsFile, { window: { x, y } });
    } catch (error) {
      console.warn("Failed to save settings", error);
    }
  });

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(join(import.meta.dirname, "../renderer/index.html"));
  }
}

function createTray(): void {
  const icon = join(app.getAppPath(), "resources/tray.png");
  let instance: Tray;

  try {
    instance = new Tray(icon);
  } catch (error) {
    console.warn("Failed to create tray icon", error);
    return;
  }

  instance.setToolTip("seien");
  instance.setContextMenu(Menu.buildFromTemplate([{ label: "Quit", click: () => app.quit() }]));
  tray = instance;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("window-all-closed", () => {
    app.quit();
  });

  app.on("will-quit", () => {
    tray?.destroy();
  });

  void app.whenReady().then(() => {
    createTray();
    createWindow(join(app.getPath("userData"), "settings.json"));
  });
}
