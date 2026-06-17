import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearDesktopThirdwebAuthNext,
  consumeDesktopThirdwebAuthNext,
  getDesktopThirdwebAuthReturnUrl,
  rememberDesktopThirdwebAuthNext,
} from "./desktop";

function installDesktopBridge() {
  Object.defineProperty(window, "wzrdDesktop", {
    configurable: true,
    value: {
      getDeepLink: (path: string) => `wzrd://${path.replace(/^\/+/, "").replace(/\/+$/, "")}`,
      isDesktop: true,
      openExternal: vi.fn(),
      platform: "darwin",
    },
  });
}

describe("desktop auth return URLs", () => {
  afterEach(() => {
    clearDesktopThirdwebAuthNext();
    Object.defineProperty(window, "wzrdDesktop", {
      configurable: true,
      value: undefined,
    });
  });

  it("builds the Thirdweb auth callback deep link", () => {
    installDesktopBridge();

    expect(getDesktopThirdwebAuthReturnUrl()).toBe("wzrd://auth/thirdweb");
  });

  it("keeps the Thirdweb auth callback deep link bare", () => {
    installDesktopBridge();

    expect(getDesktopThirdwebAuthReturnUrl("/projects/abc/studio?tab=timeline")).toBe("wzrd://auth/thirdweb");
  });

  it("stores and consumes a safe desktop auth next path outside the callback URL", () => {
    installDesktopBridge();

    expect(rememberDesktopThirdwebAuthNext("/projects/abc/studio?tab=timeline")).toBe(
      "/projects/abc/studio?tab=timeline",
    );
    expect(consumeDesktopThirdwebAuthNext()).toBe("/projects/abc/studio?tab=timeline");
    expect(consumeDesktopThirdwebAuthNext()).toBeNull();
  });

  it("does not store unsafe desktop auth next values", () => {
    installDesktopBridge();

    expect(rememberDesktopThirdwebAuthNext("https://example.com/capture")).toBeNull();
    expect(rememberDesktopThirdwebAuthNext("//example.com/capture")).toBeNull();
    expect(consumeDesktopThirdwebAuthNext()).toBeNull();
  });
});
