import { defineConfig } from "electron-vite";

export default defineConfig({
  main: {},
  preload: {
    build: {
      rolldownOptions: {
        output: {
          format: "cjs",
          entryFileNames: "[name].cjs",
        },
      },
    },
  },
  renderer: {},
});
