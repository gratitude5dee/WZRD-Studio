import type { Viewport } from "next";
import type { ReactNode } from "react";

import "../index.css";
import "../styles/themes/light-premium.css";

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
