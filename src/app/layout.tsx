import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "../index.css";
import "../styles/themes/light-premium.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://wzrd.tech"),
  title: "WZRD.tech — Creator OS",
  description: "A creator operating system for turning passing signals into culture.",
  openGraph: {
    description: "A creator operating system for turning passing signals into culture.",
    siteName: "WZRD.tech",
    title: "WZRD.tech — Creator OS",
    type: "website",
    url: "/",
  },
};

export const viewport: Viewport = {
  themeColor: "#050506",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
