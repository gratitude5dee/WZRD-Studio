import type { Metadata } from "next";

import NativeCreatorLanding from "@/components/landing/NativeCreatorLanding";

export const metadata: Metadata = {
  metadataBase: new URL("https://wzrd.tech"),
  alternates: {
    canonical: "/",
  },
  title: "WZRD.tech — Build the World Around the Record",
  description: "Turn a reference, lyric, or treatment into artist visuals, camera-ready scenes, and release assets in one creative system.",
  openGraph: {
    description: "Turn a reference, lyric, or treatment into artist visuals, camera-ready scenes, and release assets in one creative system.",
    images: [
      {
        alt: "WZRD.tech — Creator OS",
        height: 630,
        type: "image/svg+xml",
        url: "/creator-os/og-creator-os.svg",
        width: 1200,
      },
    ],
    siteName: "WZRD.tech",
    title: "WZRD.tech — Build the World Around the Record",
    type: "website",
    url: "/",
  },
  robots: {
    follow: true,
    index: true,
  },
  twitter: {
    card: "summary_large_image",
    images: ["/creator-os/og-creator-os.svg"],
    title: "WZRD.tech — Build the World Around the Record",
  },
};

export default function Page() {
  return <NativeCreatorLanding />;
}
