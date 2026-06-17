import { describe, expect, it } from "vitest";

import { appRoutes, getRouteEntry, isRegisteredRoute } from "./routes";

describe("Sourcify and Postz routes", () => {
  it("registers the canonical top-level pages", () => {
    expect(appRoutes.sourcify).toBe("/sourcify");
    expect(appRoutes.postz).toBe("/postz");

    expect(isRegisteredRoute("/sourcify")).toBe(true);
    expect(isRegisteredRoute("/postz")).toBe(true);
    expect(getRouteEntry("/sourcify")?.category).toBe("core");
    expect(getRouteEntry("/postz")?.category).toBe("core");
  });
});
