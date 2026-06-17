import { describe, expect, it } from "vitest";
import {
  getThirdwebAuthCallbackIssue,
  stripThirdwebAuthCallbackParams,
} from "./auth-callback";
import { createThirdwebWallets } from "./wallets";

function walletIds(isDesktop: boolean) {
  return createThirdwebWallets({ isDesktop }).map((wallet) => wallet.id);
}

type ThirdwebWallet = ReturnType<typeof createThirdwebWallets>[number];

function walletAuthConfig(wallet: ThirdwebWallet) {
  return (wallet.getConfig() as { auth?: { mode?: string; redirectUrl?: string } }).auth;
}

describe("createThirdwebWallets", () => {
  it("keeps desktop auth to in-app and WalletConnect flows", () => {
    expect(walletIds(true)).toEqual(["inApp", "walletConnect"]);
  });

  it("uses a window redirect for desktop in-app social auth", () => {
    const [inApp] = createThirdwebWallets({
      desktopAuthReturnUrl: "wzrd://auth/thirdweb",
      isDesktop: true,
    });

    expect(walletAuthConfig(inApp)).toMatchObject({
      mode: "window",
      redirectUrl: "wzrd://auth/thirdweb",
    });
  });

  it("keeps browser extension wallets available on the web", () => {
    expect(walletIds(false)).toEqual([
      "inApp",
      "io.metamask",
      "com.coinbase.wallet",
      "me.rainbow",
      "walletConnect",
    ]);
  });

  it("keeps web in-app auth on the default popup flow", () => {
    const [inApp] = createThirdwebWallets({
      desktopAuthReturnUrl: "wzrd://auth/thirdweb",
      isDesktop: false,
    });

    expect(walletAuthConfig(inApp)).not.toMatchObject({
      mode: "window",
      redirectUrl: "wzrd://auth/thirdweb",
    });
  });
});

describe("Thirdweb auth callback helpers", () => {
  it("accepts parseable authResult values", () => {
    expect(
      getThirdwebAuthCallbackIssue(
        `?walletId=inApp&authProvider=google&authResult=${encodeURIComponent('{"storedToken":{}}')}`,
      ),
    ).toBeNull();
  });

  it("flags malformed authResult before ConnectEmbed can parse it", () => {
    expect(getThirdwebAuthCallbackIssue("?walletId=inApp&authProvider=google&authResult=%7Bnope")).toMatchObject({
      message: "Sign-in callback expired or was malformed. Try again.",
      type: "malformed",
    });
  });

  it("strips Thirdweb auth params while preserving a safe next path", () => {
    expect(
      stripThirdwebAuthCallbackParams(
        "?next=%2Fhome&walletId=inApp&authProvider=google&authCookie=secret&authResult=%7Bnope&other=value",
      ),
    ).toBe("?next=%2Fhome&other=value");
  });
});
