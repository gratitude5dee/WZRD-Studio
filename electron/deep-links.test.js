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

  it("routes Postz OAuth completion links to /postz and preserves only safe params", () => {
    const result = resolveDeepLinkToAppUrlWithDiagnostics(
      "wzrd://postz/connected?provider=x&channel=abc123&status=success&secret=drop-me",
    );

    expect(result.appUrl).toBe("wzrd://app/postz?connected=1&provider=x&channel=abc123&status=success");
    expect(result.diagnostics).toMatchObject({
      droppedParamNames: ["secret"],
      rawRoute: "postz/connected",
    });
  });

  it("routes Postz OAuth needs_target links to /postz and preserves only safe params", () => {
    const stateId = "123e4567-e89b-12d3-a456-426614174000";
    const result = resolveDeepLinkToAppUrlWithDiagnostics(
      `wzrd://postz/connected?provider=instagram&status=needs_target&state_id=${stateId}&secret=drop-me`,
    );

    expect(result.appUrl).toBe(
      `wzrd://app/postz?connected=1&provider=instagram&status=needs_target&state_id=${stateId}`,
    );
    expect(result.diagnostics).toMatchObject({
      droppedParamNames: ["secret"],
      rawRoute: "postz/connected",
    });
  });
});
