import type { Metadata } from "next";

import PortfolioGallery from "./PortfolioGallery";
import { portfolioProjects } from "./projects";

export const metadata: Metadata = {
  metadataBase: new URL("https://wzrd.tech"),
  alternates: {
    canonical: "/portfolio",
  },
  title: "Portfolio — WZRD.tech",
  description:
    "Selected work from WZRD.tech and 5-Dee Studios — films, AI systems, hackathon builds, and releases across the creator stack.",
  openGraph: {
    description:
      "Selected work from WZRD.tech and 5-Dee Studios — films, AI systems, hackathon builds, and releases across the creator stack.",
    siteName: "WZRD.tech",
    title: "Portfolio — WZRD.tech",
    type: "website",
    url: "/portfolio",
  },
  robots: {
    follow: true,
    index: true,
  },
  twitter: {
    card: "summary_large_image",
    title: "Portfolio — WZRD.tech",
  },
};

export default function PortfolioPage() {
  return <PortfolioGallery projects={portfolioProjects} />;
}
