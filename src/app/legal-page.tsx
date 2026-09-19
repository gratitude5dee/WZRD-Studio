import type { ReactNode } from "react";

type Section = { id: string; title: string; body: ReactNode };

export const LEGAL_EFFECTIVE_DATE = "September 19, 2026";
export const LEGAL_CONTACT_EMAIL = "hello@wzrd.tech";

export function LegalPage({ title, summary, sections }: { title: string; summary: string; sections: Section[] }) {
  return (
    <main className="min-h-screen bg-[#07090c] px-5 py-20 text-[#f5f7fa] sm:px-8 sm:py-28">
      <article className="mx-auto w-full max-w-4xl rounded-3xl border border-white/10 bg-white/[0.035] p-6 shadow-[0_2rem_6rem_rgba(0,0,0,.32)] sm:p-12">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-200/80">Air by WZRD Tech</p>
        <h1 className="mt-4 max-w-xl font-serif text-5xl leading-[.9] tracking-[-.06em] text-white sm:text-7xl">{title}</h1>
        <p className="mt-6 max-w-2xl text-base leading-7 text-white/70">{summary}</p>
        <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 border-t border-white/10 pt-4 font-mono text-[10px] uppercase tracking-[.13em] text-white/45">
          <span>Effective {LEGAL_EFFECTIVE_DATE}</span>
          <span>WZRD Tech, Inc.</span>
          <span>Version 2026-09-19</span>
        </div>
        <nav aria-label={`${title} contents`} className="mt-10 rounded-2xl border border-sky-100/10 bg-sky-200/[.045] p-5">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[.16em] text-sky-100/70">On this page</p>
          <ol className="mt-3 grid gap-x-8 gap-y-2 text-sm text-white/70 sm:grid-cols-2">
            {sections.map((section) => <li key={section.id}><a className="underline decoration-white/25 underline-offset-4 hover:text-white" href={`#${section.id}`}>{section.title}</a></li>)}
          </ol>
        </nav>
        <div className="mt-10 text-[15px] leading-7 text-white/75">
          {sections.map((section) => (
            <section className="border-t border-white/10 py-8 first:border-t-0 first:pt-0" id={section.id} key={section.id}>
              <h2 className="font-serif text-3xl tracking-[-.04em] text-white">{section.title}</h2>
              <div className="mt-3 max-w-3xl space-y-3">{section.body}</div>
            </section>
          ))}
        </div>
        <p className="mt-3 border-l-2 border-sky-300/70 bg-sky-200/[.04] px-4 py-3 text-sm leading-6 text-white/65">These policies cover AIR’s current private beta. WZRD Tech will update them before material changes to product features, data practices, payments, or applicable legal requirements.</p>
        <p className="mt-8 flex gap-5 text-sm text-white/55"><a className="hover:text-white" href="/">WZRD.tech</a><a className="hover:text-white" href="https://air.wzrd.tech">Air</a></p>
      </article>
    </main>
  );
}
