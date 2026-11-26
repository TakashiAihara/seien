import { type ElectronApplication, _electron as electron } from "@playwright/test";

export function launch(userData: string): Promise<ElectronApplication> {
  // Chromium's sandbox does not start as root or where unprivileged user namespaces are
  // restricted, which covers the Linux machines these tests run on.
  const linuxArgs = process.platform === "linux" ? ["--no-sandbox"] : [];

  return electron.launch({
    // Test machines have no GPU, and Chromium only falls back to software WebGL when asked to.
    args: [".", `--user-data-dir=${userData}`, "--enable-unsafe-swiftshader", ...linuxArgs],
  });
}

export async function quit(app: ElectronApplication): Promise<void> {
  const closed = app.waitForEvent("close");
  // The evaluate call can reject because the process exits underneath it.
  await app.evaluate(({ app }) => app.quit()).catch(() => {});
  await closed;
}
