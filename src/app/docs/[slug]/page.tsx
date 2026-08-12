import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DOCS_BASE_URL, DOCS_SECTIONS, getDocsSection } from "@/docs/content";
import RouteShellPage from "@/next/RouteShellPage";

interface Props {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return DOCS_SECTIONS.map((s) => ({ slug: s.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const section = getDocsSection(slug);
  if (!section) return { title: "Docs — WZRD Studio" };
  return {
    title: `${section.title} — WZRD Studio Docs`,
    description: section.description,
    alternates: { canonical: `${DOCS_BASE_URL}/${section.id}` },
    openGraph: {
      title: `${section.title} — WZRD Studio Docs`,
      description: section.description,
      url: `${DOCS_BASE_URL}/${section.id}`,
      type: "article",
    },
    robots: { follow: true, index: true },
  };
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  const section = getDocsSection(slug);
  if (!section) notFound();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: `${section.title} — WZRD Studio Docs`,
    description: section.description,
    url: `${DOCS_BASE_URL}/${section.id}`,
    isPartOf: { "@type": "WebSite", name: "WZRD Studio Docs", url: DOCS_BASE_URL },
    publisher: { "@type": "Organization", name: "WZRD.tech", url: "https://wzrd.tech" },
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
