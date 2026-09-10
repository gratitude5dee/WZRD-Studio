"use client";

import { useEffect, useState } from "react";

export type NavigatorDetails = Pick<Navigator, "platform" | "userAgent" | "maxTouchPoints">;

/**
 * Safari on iPad can advertise a desktop macOS platform. Touch points are the
 * reliable discriminator for that otherwise Mac-looking user agent.
 */
export function isIOSSafari(navigatorDetails: NavigatorDetails): boolean {
  const { platform = "", userAgent = "", maxTouchPoints = 0 } = navigatorDetails;
  const iosDevice = /iPad|iPhone|iPod/.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1);
  const safariWebKit = /AppleWebKit/.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA/.test(userAgent);

  return iosDevice && safariWebKit;
}

/**
 * `null` is deliberate: expensive visual enhancements must wait until the
 * browser has been classified, rather than briefly booting on an iPhone.
 */
export function useIOSSafari(): boolean | null {
  const [iosSafari, setIosSafari] = useState<boolean | null>(null);

  useEffect(() => {
    setIosSafari(isIOSSafari(navigator));
  }, []);

  return iosSafari;
}
