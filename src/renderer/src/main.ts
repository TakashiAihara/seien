import { createAvatarRenderer } from "./avatar";

const chooseAvatarHint = "Choose an avatar (.vrm) from the tray menu.";
const loadFailedHint = "The avatar could not be loaded. Choose another .vrm from the tray menu.";

const canvasElement = document.getElementById("avatar");
const hintElement = document.getElementById("hint");

if (!(canvasElement instanceof HTMLCanvasElement)) {
  throw new Error("The avatar canvas is missing");
}

if (!(hintElement instanceof HTMLDivElement)) {
  throw new Error("The hint element is missing");
}

const canvas: HTMLCanvasElement = canvasElement;
const hint: HTMLDivElement = hintElement;

const avatar = createAvatarRenderer(canvas);
let refreshGeneration = 0;

async function refreshAvatar(): Promise<void> {
  const generation = ++refreshGeneration;
  avatar.clear();

  try {
    const bytes = await window.seien.loadAvatar();

    if (bytes === null) {
      if (generation === refreshGeneration) {
        hint.textContent = chooseAvatarHint;
        hint.hidden = false;
      }

      return;
    }

    const shown = await avatar.load(bytes);

    if (!shown || generation !== refreshGeneration) {
      return;
    }

    hint.hidden = true;
  } catch {
    if (generation !== refreshGeneration) {
      return;
    }

    avatar.clear();
    hint.textContent = loadFailedHint;
    hint.hidden = false;
  }
}

window.seien.onAvatarChanged(() => {
  void refreshAvatar();
});

void refreshAvatar();
