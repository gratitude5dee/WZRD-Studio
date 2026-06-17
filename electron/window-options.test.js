import { describe, expect, it } from "vitest";
import { createMainWindowOptions } from "./window-options.js";

describe("createMainWindowOptions", () => {
  it("keeps the renderer isolated from Node and Electron internals", () => {
    const options = createMainWindowOptions({
      preloadPath: "/app/electron/preload.cjs",
      iconPath: "/app/build/icon.icns",
    });

    expect(options.webPreferences).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      preload: "/app/electron/preload.cjs",
    });
  });
});
