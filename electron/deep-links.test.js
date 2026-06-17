import { describe, expect, it } from "vitest";
import {
  createDeepLink,
  resolveDeepLinkToAppUrl,
  resolveDeepLinkToAppUrlWithDiagnostics,
} from "./deep-links.js";

describe("deep links", () => {
  it("creates normalized deep links", () => {
    expect(createDeepLink("/auth/thirdweb/")).toBe("wzrd://auth/thirdweb");
  });

  it("routes Thirdweb auth callbacks to login and preserves only callback params", () => {
    expect(
      resolveDeepLinkToAppUrl(
        "wzrd://auth/thirdweb?next=%2Fprojects%2Fabc%2Fstudio&walletId=inApp&authProvider=google&authResult=%7B%7D&authCookie=secret&extra=drop-me#done",
      ),
    ).toBe(
      "wzrd://app/login?next=%2Fprojects%2Fabc%2Fstudio&walletId=inApp&authProvider=google&authResult=%7B%7D&authCookie=secret#done",
    );
  });

  it("drops unsafe next values from Thirdweb auth callbacks", () => {
    expect(
      resolveDeepLinkToAppUrl("wzrd://auth/thirdweb?next=https%3A%2F%2Fevil.example&walletId=inApp"),
    ).toBe("wzrd://app/login?walletId=inApp");
  });

  it("preserves auth errors and reports dropped auth callback params", () => {
    const result = resolveDeepLinkToAppUrlWithDiagnostics(
      "wzrd://auth/thirdweb?error=access_denied&error_description=Denied&authCookie=secret&extra=drop-me",
    );

    expect(result.appUrl).toBe(
      "wzrd://app/login?error=access_denied&error_description=Denied&authCookie=secret",
    );
    expect(result.diagnostics).toMatchObject({
      droppedParamNames: ["extra"],
      paramNames: ["error", "error_description", "authCookie", "extra"],
      rawRoute: "auth/thirdweb",
      resolvedRoute: "wzrd://app/login?error=[present]&error_description=[present]&authCookie=[redacted]",
    });
  });

  it("keeps billing return links unchanged", () => {
    expect(resolveDeepLinkToAppUrl("wzrd://billing/success")).toBe(
      "wzrd://app/settings/billing?checkout=success",
    );
    expect(resolveDeepLinkToAppUrl("wzrd://billing/cancel")).toBe(
      "wzrd://app/settings/billing?checkout=cancel",
    );
  });
});
