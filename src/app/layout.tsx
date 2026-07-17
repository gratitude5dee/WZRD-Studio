import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import PwaRegistration from "@/components/pwa/PwaRegistration";

import "../index.css";
import "../styles/themes/light-premium.css";

export const metadata: Metadata = {
  applicationName: "WZRD",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "WZRD",
  },
  icons: {
    apple: [
      {
        sizes: "180x180",
        type: "image/png",
        url: "/brand/wzrd-icon-180.png",
      },
    ],
    icon: [
      { sizes: "16x16", type: "image/png", url: "/brand/wzrd-icon-16.png" },
      { sizes: "32x32", type: "image/png", url: "/brand/wzrd-icon-32.png" },
      { sizes: "48x48", type: "image/png", url: "/brand/wzrd-icon-48.png" },
      { sizes: "any", type: "image/x-icon", url: "/favicon.ico" },
    ],
    shortcut: "/favicon.ico",
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  colorScheme: "dark",
  initialScale: 1,
  themeColor: "#050506",
  viewportFit: "cover",
  width: "device-width",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {children}
        <PwaRegistration />
      </body>
    </html>
  );
}
