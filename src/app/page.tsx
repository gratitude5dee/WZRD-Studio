import type { Metadata } from "next";

import CreatorOSLanding from "@/components/creator-os/CreatorOSLanding";
import SplinePartnerHero from "@/components/creator-os/SplinePartnerHero";

export const metadata: Metadata = {
  metadataBase: new URL("https://wzrd.tech"),
  alternates: {
    canonical: "/",
  },
  title: "WZRD.tech — Creator OS",
  description: "Creative infrastructure for generative media, artist discovery, and the work that turns a signal into culture.",
  openGraph: {
    description: "Creative infrastructure for generative media, artist discovery, and the work that turns a signal into culture.",
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
    title: "WZRD.tech — Creator OS",
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
    title: "WZRD.tech — Creator OS",
  },
};

export default function Page() {
  return (
    <>
      <SplinePartnerHero />
      <CreatorOSLanding />
    </>
  );
}
