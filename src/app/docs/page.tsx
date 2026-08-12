import type { Metadata } from "next";

import { DOCS_BASE_URL, DOCS_SECTIONS } from "@/docs/content";
import RouteShellPage from "@/next/RouteShellPage";

export const metadata: Metadata = {
  title: "Documentation — WZRD Studio",
  description:
    "Documentation for every WZRD Studio feature: project setup, Studio node-based generation, Timeline storyboarding, the full video Editor, Kanvas AI studios, distribution tools, IP Vault, credits, and the agent plugin.",
  alternates: { canonical: DOCS_BASE_URL },
  openGraph: {
    title: "Documentation — WZRD Studio",
    description:
      "Documentation for every WZRD Studio feature, from project setup to agent harness integration.",
    url: DOCS_BASE_URL,
    type: "website",
  },
  robots: { follow: true, index: true },
};

export default function Page() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "WZRD Studio Documentation",
    url: DOCS_BASE_URL,
    publisher: { "@type": "Organization", name: "WZRD.tech", url: "https://wzrd.tech" },
    hasPart: DOCS_SECTIONS.map((s) => ({
      "@type": "TechArticle",
      headline: s.title,
      description: s.description,
      url: `${DOCS_BASE_URL}/${s.id}`,
    })),
  };
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <RouteShellPage />
    </>
  );
}
