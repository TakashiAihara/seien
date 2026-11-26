import { contextBridge, ipcRenderer } from "electron";

import type { SeienApi } from "../shared/api";

const api: SeienApi = {
  loadAvatar: () => ipcRenderer.invoke("seien:load-avatar"),

  onAvatarChanged: (listener) => {
    ipcRenderer.on("seien:avatar-changed", () => listener());
  },

  setHit: (hit) => {
    ipcRenderer.send("seien:set-hit", hit);
  },

  dragBy: (dx, dy) => {
    ipcRenderer.send("seien:drag-by", dx, dy);
  },

  dragEnd: () => {
    ipcRenderer.send("seien:drag-end");
  },
};

contextBridge.exposeInMainWorld("seien", api);
