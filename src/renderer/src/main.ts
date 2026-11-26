import { VRMUtils } from "@pixiv/three-vrm";

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
let loadGeneration = 0;

async function refreshAvatar(): Promise<void> {
  const generation = ++loadGeneration;
  avatar.clear();
  hint.textContent = "";
  hint.hidden = true;

  try {
    const bytes = await window.seien.loadAvatar();

    if (generation !== loadGeneration) {
      return;
    }

    if (bytes === null) {
      hint.textContent = chooseAvatarHint;
      hint.hidden = false;
      return;
    }

    const parsed = await avatar.parse(bytes);

    if (generation !== loadGeneration) {
      VRMUtils.deepDispose(parsed.scene);
      return;
    }

    avatar.show(parsed);
    hint.textContent = "";
    hint.hidden = true;
  } catch {
    if (generation !== loadGeneration) {
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
