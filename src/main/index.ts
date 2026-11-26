import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  screen,
  Tray,
  type BrowserWindowConstructorOptions,
} from "electron";

import { isReachable } from "./placement";
import { loadSettings, saveSettings, type Settings } from "./settings";

// A Tray is garbage collected unless a reference outlives the creating function.
let tray: Tray | undefined;

const windowSize = { width: 400, height: 600 };

function persistSettings(settingsFile: string, settings: Settings): void {
  try {
    saveSettings(settingsFile, settings);
  } catch (error) {
    console.warn("Failed to save settings", error);
  }
}

function setHit(win: BrowserWindow, hit: boolean): void {
  if (hit) {
    win.setIgnoreMouseEvents(false);
  } else {
    // forward: true is implemented only on Windows and macOS. On Linux an ignoring window receives
    // no mouse moves at all, so click-through cannot be left once entered. Windows is the target.
    win.setIgnoreMouseEvents(true, { forward: true });
  }
}

function createWindow(settingsFile: string) {
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
  setHit(win, false);

  function saveWindowPosition(): void {
    const { x, y } = win.getBounds();
    settings.window = { x, y };
    persistSettings(settingsFile, settings);
  }

  ipcMain.handle("seien:load-avatar", async () => {
    const avatarPath = settings.avatarPath;

    if (avatarPath === undefined) {
      return null;
    }

    const bytes = await readFile(avatarPath);

    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  });

  ipcMain.on("seien:set-hit", (_event, hit: unknown) => {
    if (typeof hit !== "boolean") {
      return;
    }

    setHit(win, hit);
  });

  ipcMain.on("seien:drag-by", (_event, dx: unknown, dy: unknown) => {
    if (
      typeof dx !== "number" ||
      typeof dy !== "number" ||
      !Number.isFinite(dx) ||
      !Number.isFinite(dy)
    ) {
      return;
    }

    const { x, y } = win.getBounds();
    win.setPosition(x + Math.round(dx), y + Math.round(dy));
  });

  ipcMain.on("seien:drag-end", () => {
    saveWindowPosition();
  });

  win.on("close", saveWindowPosition);

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(join(import.meta.dirname, "../renderer/index.html"));
  }

  return { win, settings };
}

async function chooseAvatar(
  win: BrowserWindow,
  settingsFile: string,
  settings: Settings,
): Promise<void> {
  const result = await dialog.showOpenDialog(win, {
    properties: ["openFile"],
    filters: [{ name: "VRM avatar", extensions: ["vrm"] }],
  });

  if (result.canceled) {
    return;
  }

  const avatarPath = result.filePaths[0];

  if (avatarPath === undefined) {
    return;
  }

  settings.avatarPath = avatarPath;
  persistSettings(settingsFile, settings);
  win.webContents.send("seien:avatar-changed");
}

function createTray(win: BrowserWindow, settingsFile: string, settings: Settings): void {
  const icon = join(app.getAppPath(), "resources/tray.png");
  let instance: Tray;

  try {
    instance = new Tray(icon);
  } catch (error) {
    console.warn("Failed to create tray icon", error);
    return;
  }

  instance.setToolTip("seien");
  instance.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Choose avatar (.vrm)…",
        click: () => void chooseAvatar(win, settingsFile, settings),
      },
      { label: "Quit", click: () => app.quit() },
    ]),
  );
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
    const settingsFile = join(app.getPath("userData"), "settings.json");
    const mainWindow = createWindow(settingsFile);
    createTray(mainWindow.win, settingsFile, mainWindow.settings);
  });
}
