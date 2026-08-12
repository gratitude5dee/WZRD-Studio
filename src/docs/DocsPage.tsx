import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { DOCS_GROUPS, DOCS_SECTIONS, type DocsSection } from './content';

function SectionArticle({ section }: { section: DocsSection }) {
  return (
    <article id={section.id} className="scroll-mt-24 border-b border-border/60 pb-12 last:border-b-0">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {section.group}
      </p>
      <h2 className="mt-1 text-2xl font-semibold text-foreground">{section.title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{section.tagline}</p>
      <div className="mt-6 flex flex-col gap-6">
        {section.blocks.map((block, i) => (
          <div key={i}>
            {block.heading ? (
              <h3 className="mb-2 text-base font-semibold text-foreground">{block.heading}</h3>
            ) : null}
            {block.body.map((p, j) => (
              <p key={j} className="mb-2 text-sm leading-6 text-muted-foreground">
                {p}
              </p>
            ))}
            {block.bullets ? (
              <ul className="mt-2 flex flex-col gap-1.5">
                {block.bullets.map((b, j) => (
                  <li key={j} className="flex gap-2 text-sm leading-6 text-muted-foreground">
                    <span aria-hidden className="mt-[9px] size-1 shrink-0 rounded-full bg-primary/70" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {block.code ? (
              <div className="mt-3 overflow-hidden rounded-lg border border-border/60 bg-muted/40">
                {block.code.label ? (
                  <div className="border-b border-border/60 px-3 py-1.5 text-[11px] text-muted-foreground">
                    {block.code.label}
                  </div>
                ) : null}
                <pre className="overflow-x-auto px-3 py-2 text-[12.5px] text-foreground">
                  <code>{block.code.text}</code>
                </pre>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </article>
  );
}

export default function DocsPage() {
  const location = useLocation();
  const [activeId, setActiveId] = useState<string>(DOCS_SECTIONS[0].id);

  const grouped = useMemo(
    () =>
      DOCS_GROUPS.map((group) => ({
        group,
        sections: DOCS_SECTIONS.filter((s) => s.group === group),
      })).filter((g) => g.sections.length > 0),
    [],
  );

  useEffect(() => {
    const hash = location.hash.replace('#', '');
    if (hash) {
      const el = document.getElementById(hash);
      if (el) {
        el.scrollIntoView({ block: 'start' });
        setActiveId(hash);
      }
    }
  }, [location.hash]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
            break;
          }
        }
      },
      { rootMargin: '-15% 0px -70% 0px' },
    );
    for (const section of DOCS_SECTIONS) {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <div className="dark min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-baseline gap-2">
            <Link to="/" className="text-sm font-semibold tracking-tight text-foreground">
              WZRD<span className="text-primary">.tech</span>
            </Link>
            <span className="text-sm text-muted-foreground">Docs</span>
          </div>
          <nav className="flex items-center gap-4 text-sm">
            <Link to="/home" className="text-muted-foreground transition-colors hover:text-foreground">
              Open Studio
            </Link>
            <a
              href="https://github.com/gratitude5dee/WZRD-Studio"
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              GitHub
            </a>
          </nav>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-10 px-4 py-10 sm:px-6">
        <aside className="sticky top-24 hidden h-[calc(100vh-8rem)] w-56 shrink-0 overflow-y-auto md:block">
          <nav className="flex flex-col gap-5">
            {grouped.map(({ group, sections }) => (
              <div key={group}>
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  {group}
                </p>
                <ul className="flex flex-col">
                  {sections.map((s) => (
                    <li key={s.id}>
                      <a
                        href={`#${s.id}`}
                        aria-current={activeId === s.id ? 'true' : undefined}
                        className={`block rounded-md px-2 py-1 text-[13px] transition-colors ${
                          activeId === s.id
                            ? 'bg-muted text-foreground'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {s.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mb-12">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              WZRD Studio documentation
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Everything the app can do — from project setup and storyboarding to node-based
              generation, full video editing, distribution, and building on WZRD with agents.
            </p>
          </div>
          <div className="flex flex-col gap-12">
            {DOCS_SECTIONS.map((section) => (
              <SectionArticle key={section.id} section={section} />
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
