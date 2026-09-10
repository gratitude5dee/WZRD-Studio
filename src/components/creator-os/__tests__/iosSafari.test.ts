import { describe, expect, it } from "vitest";

import { isIOSSafari } from "@/components/creator-os/iosSafari";

describe("isIOSSafari", () => {
  it.each([
    ["iPhone Safari", { platform: "iPhone", maxTouchPoints: 5, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1" }, true],
    ["iPad Safari", { platform: "iPad", maxTouchPoints: 5, userAgent: "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1" }, true],
    ["iPad desktop mode", { platform: "MacIntel", maxTouchPoints: 5, userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15" }, true],
    ["macOS Safari", { platform: "MacIntel", maxTouchPoints: 0, userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15" }, false],
    ["Android Chrome", { platform: "Linux armv8l", maxTouchPoints: 5, userAgent: "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36" }, false],
    ["desktop Chrome", { platform: "MacIntel", maxTouchPoints: 0, userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/537.36 Chrome/130.0 Safari/537.36" }, false],
  ])("recognizes %s", (_label, navigatorDetails, expected) => {
    expect(isIOSSafari(navigatorDetails)).toBe(expected);
  });
});
