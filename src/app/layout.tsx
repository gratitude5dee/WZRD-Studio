import type { ReactNode } from "react";

import "../index.css";
import "../styles/themes/light-premium.css";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
