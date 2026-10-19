"use client";

import { useMemo, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import styles from "./portfolio.module.css";
import type { PortfolioProject } from "./projects";

const ALL_CATEGORY = "All";

function isExternalUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function ProjectImage({
  alt,
  className,
  imageClassName,
  name,
  src,
}: {
  alt: string;
  className?: string;
  imageClassName?: string;
  name: string;
  src: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div aria-hidden="true" className={className} data-fallback="true">
        <span className={styles.imageFallback}>{name.trim().charAt(0).toUpperCase() || "·"}</span>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* next/image is unoptimized in this app; a plain img keeps the remote
          asset untouched and lets the lazy/fallback behaviour stay explicit. */}
      <img
        alt={alt}
        className={imageClassName}
        decoding="async"
        loading="lazy"
        onError={() => setFailed(true)}
        src={src}
      />
    </div>
  );
}

export default function PortfolioGallery({ projects }: { projects: PortfolioProject[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>(ALL_CATEGORY);
  const [selected, setSelected] = useState<PortfolioProject | null>(null);

  const categories = useMemo(() => {
    const seen = new Set<string>();
    for (const project of projects) {
      for (const c of project.categories) seen.add(c);
    }
    return [ALL_CATEGORY, ...seen];
  }, [projects]);

  const normalizedQuery = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      projects.filter((project) => {
        if (category !== ALL_CATEGORY && !project.categories.includes(category)) return false;
        if (!normalizedQuery) return true;
        const haystack = [project.name, project.role, project.description, ...project.categories]
          .join(" ")
          .toLowerCase();
        return haystack.includes(normalizedQuery);
      }),
    [projects, category, normalizedQuery],
  );

  const selectedIsExternal = selected ? isExternalUrl(selected.url) : false;

  return (
    <div className={styles.root}>
      <header className={styles.siteHeader}>
        <a aria-label="WZRD.tech home" className={styles.wordmark} href="/">
          WZRD.tech
        </a>
        <a className={styles.enterLink} href="https://studio.wzrd.tech">
          Enter Studio ↗
        </a>
      </header>

      <main className={styles.main}>
        <p className={styles.kicker}>Portfolio / WZRD Studio</p>
        <h1 className={styles.title}>Selected work</h1>
        <p className={styles.lede}>
          Films, AI systems, hackathon builds, and releases — the work that turns a signal into
          culture.
        </p>
        <p aria-live="polite" className={styles.count}>
          {visible.length === projects.length
            ? `${projects.length} projects`
            : `${visible.length} of ${projects.length} projects`}
        </p>

        <div className={styles.controls}>
          <label className={styles.searchLabel} htmlFor="portfolio-search">
            Search projects
          </label>
          <input
            autoComplete="off"
            className={styles.search}
            id="portfolio-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name, role, description, or category"
            type="search"
            value={query}
          />
          <div aria-label="Filter by category" className={styles.filters} role="group">
            {categories.map((c) => (
              <button
                aria-pressed={category === c}
                className={styles.filterButton}
                data-active={category === c}
                key={c}
                onClick={() => setCategory(c)}
                type="button"
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {visible.length === 0 ? (
          <p className={styles.empty}>No projects match that search.</p>
        ) : (
          <ul className={styles.grid}>
            {visible.map((project) => (
              <li className={styles.cell} key={project.name}>
                <button
                  aria-haspopup="dialog"
                  className={styles.card}
                  onClick={() => setSelected(project)}
                  type="button"
                >
                  <ProjectImage
                    alt={project.imageAlt ?? project.name}
                    className={styles.cardImageWrap}
                    imageClassName={styles.cardImage}
                    name={project.name}
                    src={project.image}
                  />
                  <span className={styles.cardBody}>
                    <span className={styles.cardName}>{project.name}</span>
                    {project.role ? <span className={styles.cardRole}>{project.role}</span> : null}
                    {project.description ? (
                      <span className={styles.cardDescription}>{project.description}</span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>

      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className={styles.dialogContent}>
          {selected ? (
            <>
              <ProjectImage
                alt={selected.imageAlt ?? selected.name}
                className={styles.dialogImageWrap}
                imageClassName={styles.dialogImage}
                name={selected.name}
                src={selected.image}
              />
              <DialogHeader className={styles.dialogHeader}>
                <DialogTitle className={styles.dialogTitle}>{selected.name}</DialogTitle>
                {selected.role ? <p className={styles.dialogRole}>{selected.role}</p> : null}
                {selected.description ? (
                  <DialogDescription className={styles.dialogDescription}>
                    {selected.description}
                  </DialogDescription>
                ) : null}
              </DialogHeader>
              {selected.categories.length > 0 ? (
                <ul aria-label="Categories" className={styles.dialogTags}>
                  {selected.categories.map((c) => (
                    <li className={styles.dialogTag} key={c}>
                      {c}
                    </li>
                  ))}
                </ul>
              ) : null}
              {selected.url ? (
                <a
                  className={styles.openLink}
                  href={selected.url}
                  {...(selectedIsExternal ? { rel: "noopener noreferrer", target: "_blank" } : {})}
                >
                  Open project ↗
                </a>
              ) : null}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
