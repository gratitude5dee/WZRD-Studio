import { useEffect, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  DOCS_BASE_URL,
  DOCS_GROUPS,
  DOCS_SECTIONS,
  getDocsSection,
  type DocsSection,
} from './content';

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

function useDocsHead(section: DocsSection | null) {
  useEffect(() => {
    const title = section
      ? `${section.title} — WZRD Studio Docs`
      : 'WZRD Studio Documentation';
    const description = section
      ? section.description
      : 'Documentation for every WZRD Studio feature: project setup, Studio node-based generation, Timeline storyboarding, the full video Editor, distribution tools, IP Vault, credits, and the agent plugin.';
    const url = section ? `${DOCS_BASE_URL}/${section.id}` : DOCS_BASE_URL;

    document.title = title;

    const ensure = (selector: string, create: () => HTMLElement) => {
      let el = document.head.querySelector(selector) as HTMLElement | null;
      if (!el) {
        el = create();
        document.head.appendChild(el);
      }
      return el;
    };
    const meta = (name: string, content: string, attr: 'name' | 'property' = 'name') => {
      const el = ensure(`meta[${attr}="${name}"]`, () => {
        const m = document.createElement('meta');
        m.setAttribute(attr, name);
        return m;
      });
      el.setAttribute('content', content);
    };
    meta('description', description);
    meta('og:title', title, 'property');
    meta('og:description', description, 'property');
    meta('og:url', url, 'property');
    meta('og:type', 'article', 'property');

    const canonical = ensure('link[rel="canonical"]', () => {
      const l = document.createElement('link');
      l.setAttribute('rel', 'canonical');
      return l;
    });
    canonical.setAttribute('href', url);

    const ld = ensure('script[data-docs-jsonld]', () => {
      const s = document.createElement('script');
      s.setAttribute('type', 'application/ld+json');
      s.setAttribute('data-docs-jsonld', 'true');
      return s;
    });
    ld.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'TechArticle',
      headline: title,
      description,
      url,
      isPartOf: { '@type': 'WebSite', name: 'WZRD Studio Docs', url: DOCS_BASE_URL },
      publisher: { '@type': 'Organization', name: 'WZRD.tech', url: 'https://wzrd.tech' },
    });
  }, [section]);
}

function TopNav() {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[88rem] items-center justify-between px-4 sm:px-6">
        <Link to="/docs" className="flex items-center gap-2.5">
          <img src="/wzrdtechlogo.png" alt="WZRD.tech" className="h-7 w-auto" />
          <span className="text-sm font-semibold text-slate-900">Docs</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link
            to="/docs"
            className="rounded-md bg-slate-100 px-3 py-1.5 font-medium text-slate-900"
          >
            Documentation
          </Link>
          <Link
            to="/home"
            className="rounded-md px-3 py-1.5 text-slate-600 transition-colors hover:text-slate-900"
          >
            Open Studio
          </Link>
          <a
            href="https://github.com/gratitude5dee/WZRD-Studio"
            target="_blank"
            rel="noreferrer"
            className="rounded-md px-3 py-1.5 text-slate-600 transition-colors hover:text-slate-900"
          >
            GitHub
          </a>
        </nav>
      </div>
    </header>
  );
}

function SideNav({ activeId }: { activeId: string | null }) {
  const grouped = useMemo(
    () =>
      DOCS_GROUPS.map((group) => ({
        group,
        sections: DOCS_SECTIONS.filter((s) => s.group === group),
      })).filter((g) => g.sections.length > 0),
    [],
  );
  return (
    <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-60 shrink-0 overflow-y-auto py-8 pr-4 lg:block">
      <nav className="flex flex-col gap-6">
        {grouped.map(({ group, sections }) => (
          <div key={group}>
            <p className="mb-2 text-[13px] font-semibold text-slate-900">{group}</p>
            <ul className="flex flex-col border-l border-slate-200">
              {sections.map((s) => (
                <li key={s.id}>
                  <Link
                    to={`/docs/${s.id}`}
                    aria-current={activeId === s.id ? 'page' : undefined}
                    className={`-ml-px block border-l py-1 pl-4 text-[14px] transition-colors ${
                      activeId === s.id
                        ? 'border-blue-600 font-medium text-blue-600'
                        : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'
                    }`}
                  >
                    {s.navTitle ?? s.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}

function OnThisPage({ section }: { section: DocsSection }) {
  const headings = section.blocks.map((b) => b.heading).filter(Boolean) as string[];
  if (headings.length === 0) return null;
  return (
    <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-56 shrink-0 overflow-y-auto py-8 pl-4 xl:block">
      <p className="mb-2 text-[13px] font-semibold text-slate-900">On this page</p>
      <ul className="flex flex-col gap-1">
        {headings.map((h) => (
          <li key={h}>
            <a
              href={`#${slugify(h)}`}
              className="block py-0.5 text-[13px] text-slate-500 transition-colors hover:text-blue-600"
            >
              {h}
            </a>
          </li>
        ))}
      </ul>
    </aside>
  );
}

function SectionBody({ section }: { section: DocsSection }) {
  return (
    <div className="flex flex-col gap-8">
      {section.blocks.map((block, i) => (
        <div key={i}>
          {block.heading ? (
            <h2
              id={slugify(block.heading)}
              className="mb-3 scroll-mt-20 text-xl font-semibold text-slate-900"
            >
              {block.heading}
            </h2>
          ) : null}
          {block.body.map((p, j) => (
            <p key={j} className="mb-3 text-[15px] leading-7 text-slate-600">
              {p}
            </p>
          ))}
          {block.bullets ? (
            <ul className="mt-1 flex flex-col gap-2">
              {block.bullets.map((b, j) => (
                <li key={j} className="flex gap-2.5 text-[15px] leading-7 text-slate-600">
                  <span aria-hidden className="mt-[11px] size-1.5 shrink-0 rounded-full bg-blue-600/60" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {block.code ? (
            <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
              {block.code.label ? (
                <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-[12px] font-medium text-slate-500">
                  {block.code.label}
                </div>
              ) : null}
              <pre className="overflow-x-auto bg-slate-900 px-4 py-3 text-[13px] leading-6 text-slate-100">
                <code>{block.code.text}</code>
              </pre>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function PrevNext({ section }: { section: DocsSection }) {
  const index = DOCS_SECTIONS.findIndex((s) => s.id === section.id);
  const prev = index > 0 ? DOCS_SECTIONS[index - 1] : null;
  const next = index < DOCS_SECTIONS.length - 1 ? DOCS_SECTIONS[index + 1] : null;
  return (
    <div className="mt-12 flex gap-4 border-t border-slate-200 pt-6">
      {prev ? (
        <Link
          to={`/docs/${prev.id}`}
          className="group flex-1 rounded-xl border border-slate-200 p-4 transition-colors hover:border-blue-300"
        >
          <p className="text-[12px] text-slate-500">Previous</p>
          <p className="text-[14px] font-medium text-slate-900 group-hover:text-blue-600">
            {prev.navTitle ?? prev.title}
          </p>
        </Link>
      ) : (
        <div className="flex-1" />
      )}
      {next ? (
        <Link
          to={`/docs/${next.id}`}
          className="group flex-1 rounded-xl border border-slate-200 p-4 text-right transition-colors hover:border-blue-300"
        >
          <p className="text-[12px] text-slate-500">Next</p>
          <p className="text-[14px] font-medium text-slate-900 group-hover:text-blue-600">
            {next.navTitle ?? next.title}
          </p>
        </Link>
      ) : (
        <div className="flex-1" />
      )}
    </div>
  );
}

function DocsLanding() {
  return (
    <main className="min-w-0 flex-1 py-10">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
        WZRD Studio Documentation
      </h1>
      <p className="mt-4 max-w-2xl text-[15px] leading-7 text-slate-600">
        WZRD Studio is a creator operating system for AI video: go from concept to storyboard to
        generation to editing to final delivery in one workflow. These docs cover every feature —
        in the browser at studio.wzrd.tech, on desktop, and through agent harnesses.
      </p>
      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {DOCS_SECTIONS.map((s) => (
          <Link
            key={s.id}
            to={`/docs/${s.id}`}
            className="group rounded-2xl border border-slate-200 p-5 transition-colors hover:border-blue-300 hover:shadow-sm"
          >
            <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-slate-400">
              {s.group}
            </p>
            <p className="mt-1.5 text-[15px] font-semibold text-slate-900 group-hover:text-blue-600">
              {s.navTitle ?? s.title}
            </p>
            <p className="mt-1.5 text-[13.5px] leading-6 text-slate-500">{s.tagline}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}

export default function DocsPage() {
  const { sectionId } = useParams<{ sectionId?: string }>();
  const section = sectionId ? (getDocsSection(sectionId) ?? null) : null;
  useDocsHead(section);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [sectionId]);

  return (
    <div
      className="min-h-screen bg-white text-slate-900"
      style={{ fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif" }}
    >
      <TopNav />
      <div className="mx-auto flex max-w-[88rem] gap-8 px-4 sm:px-6">
        <SideNav activeId={section?.id ?? null} />
        {section ? (
          <>
            <main className="min-w-0 flex-1 py-10">
              <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-blue-600">
                {section.group}
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
                {section.title}
              </h1>
              <p className="mt-3 text-[15px] leading-7 text-slate-500">{section.tagline}</p>
              <div className="mt-8">
                <SectionBody section={section} />
              </div>
              <PrevNext section={section} />
            </main>
            <OnThisPage section={section} />
          </>
        ) : (
          <DocsLanding />
        )}
      </div>
    </div>
  );
}
