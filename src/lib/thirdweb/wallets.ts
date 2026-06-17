import { inAppWallet, createWallet } from "thirdweb/wallets";
import { getDesktopThirdwebAuthReturnUrl, isDesktopRuntime } from "@/lib/desktop";

const authOptions = ["google", "apple", "discord", "email", "passkey", "phone"] as const;

type ThirdwebWalletOptions =
  | boolean
  | {
      isDesktop?: boolean;
      desktopAuthReturnUrl?: string | null;
    };

function createInAppWallet(desktopAuthReturnUrl?: string | null) {
  return inAppWallet({
    auth: {
      options: [...authOptions],
      ...(desktopAuthReturnUrl
        ? {
            mode: "window" as const,
            redirectUrl: desktopAuthReturnUrl,
          }
        : {}),
    },
  });
}

export function createThirdwebWallets(options: ThirdwebWalletOptions = {}) {
  const isDesktop = typeof options === "boolean" ? options : options.isDesktop ?? isDesktopRuntime();
  const desktopAuthReturnUrl =
    typeof options === "boolean"
      ? getDesktopThirdwebAuthReturnUrl()
      : options.desktopAuthReturnUrl ?? (isDesktop ? getDesktopThirdwebAuthReturnUrl() : null);

  const inApp = createInAppWallet(isDesktop ? desktopAuthReturnUrl : null);
  const walletConnect = createWallet("walletConnect");

  if (isDesktop) {
    return [inApp, walletConnect];
  }

  return [
    inApp,
    createWallet("io.metamask"),
    createWallet("com.coinbase.wallet"),
    createWallet("me.rainbow"),
    walletConnect,
  ];
}

export const wallets = createThirdwebWallets();
