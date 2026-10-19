"use client";

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";

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

const TAPE_ARTWORK =
  "https://framerusercontent.com/images/7nIMvdwiijHasaaIcqEWgbIzU.png";

const WORDMARK = "/creator-os/wzrd-wordmark-1600.png";

const chapterBubbles = [
  { bg: "#8cc8ff", href: "https://air.wzrd.tech", hoverBg: "#aedaff", label: "air", rot: "-8deg" },
  { bg: "#f0a145", href: "/about", hoverBg: "#f5c184", label: "studio", rot: "6deg" },
  { bg: "#c5ba9e", href: "/#earth", hoverBg: "#d8cfb4", label: "earth", rot: "-6deg" },
  { bg: "#f06a47", href: "https://zap.wzrd.tech", hoverBg: "#f89d80", label: "zap", rot: "8deg" },
  { bg: "#6dc8d7", href: "https://wtr.wzrd.tech", hoverBg: "#9adde8", label: "fire+water", rot: "-4deg" },
  { bg: "#f5c184", href: "/portfolio", hoverBg: "#ffdca6", label: "portfolio", rot: "-7deg" },
  { bg: "#f1ebdd", href: "https://studio.wzrd.tech", hoverBg: "#ffffff", label: "enter studio", rot: "4deg" },
] as const;

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
        <a aria-label="WZRD.tech home" className={styles.logo} href="/">
          <img alt="WZRD.tech" className={styles.logoImage} src={WORDMARK} />
        </a>
        <nav aria-label="Chapters" className={styles.chapterNav}>
          <ul className={styles.chapterList}>
            {chapterBubbles.map((item) => (
              <li className={styles.chapterCell} key={item.label}>
                <a
                  aria-label={item.label}
                  className={styles.bubbleLink}
                  href={item.href}
                  style={
                    {
                      "--bubble-bg": item.bg,
                      "--bubble-hover-bg": item.hoverBg,
                      "--bubble-rot": item.rot,
                    } as CSSProperties
                  }
                  {...(item.href.startsWith("https://") ? { rel: "noopener", target: "_top" } : {})}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main className={styles.main}>
        <section aria-labelledby="portfolio-title" className={styles.hero}>
          <div aria-hidden="true" className={styles.heroArt}>
            <span className={styles.heroTile}>
              <img alt="" decoding="async" src={TAPE_ARTWORK} />
            </span>
            <span className={styles.heroTile}>
              <img alt="" decoding="async" src="/portfolio/portrait.png" />
            </span>
          </div>

          <h1 className={styles.heroTitle} id="portfolio-title">
            <span className={styles.heroTitleLine}>GRATITUD3/</span>
            <span className={styles.heroTitleLine}>
              Creative Director<span className={styles.heroStar}>*</span>
            </span>
          </h1>

          <div className={styles.identity}>
            <span className={styles.avatarWrap}>
              <img
                alt="Portrait of Avi Nav Rao"
                className={styles.avatar}
                decoding="async"
                src="/portfolio/avi-avatar.png"
              />
            </span>
            <span className={styles.identityName}>Avi Nav Rao</span>
            <span aria-hidden="true" className={styles.identityDot}>
              ●
            </span>
            <span className={styles.identityEns}>GRATITUD3.ETH</span>
          </div>

          <div className={styles.bio}>
            <p className={styles.bioLine}>Cognitive Architect</p>
            <p className={styles.bioLine}>AI Engineer, Designer, Producer, &amp; Filmmaker</p>
            <p className={styles.bioLine}>
              I create and develop human-centric GenAI/Web3 agents, apps, and on-chain experiences.
            </p>
          </div>

          <a className={styles.coCreate} href="mailto:gratitude@5-dee.com">
            <span aria-hidden="true" className={styles.coCreateDot} />
            Available to co-create
            <span aria-hidden="true">→</span>
          </a>
        </section>

        <section aria-label="Project gallery" className={styles.gallery}>
          <div className={styles.galleryHeader}>
            <h2 className={styles.galleryTitle}>Projects</h2>
            <p aria-live="polite" className={styles.count}>
              {visible.length === projects.length
                ? `${projects.length} projects`
                : `${visible.length} of ${projects.length} projects`}
            </p>
          </div>

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
                    <span className={styles.cardTop}>
                      <ProjectImage
                        alt={project.imageAlt ?? project.name}
                        className={styles.appIcon}
                        imageClassName={styles.appIconImage}
                        name={project.name}
                        src={project.image}
                      />
                      <span className={styles.cardMeta}>
                        <span className={styles.cardName}>{project.name}</span>
                        {project.role ? (
                          <span className={styles.cardRole}>{project.role}</span>
                        ) : null}
                        {project.categories.length > 0 ? (
                          <span className={styles.cardCategory}>
                            {project.categories.join(" · ")}
                          </span>
                        ) : null}
                      </span>
                      <span aria-hidden="true" className={styles.viewPill}>
                        View ›
                      </span>
                    </span>
                    {project.description ? (
                      <span className={styles.cardDescription}>{project.description}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className={styles.dialogContent}>
          {selected ? (
            <>
              <div className={styles.dialogTop}>
                <ProjectImage
                  alt={selected.imageAlt ?? selected.name}
                  className={styles.dialogIcon}
                  imageClassName={styles.dialogIconImage}
                  name={selected.name}
                  src={selected.image}
                />
                <DialogHeader className={styles.dialogHeader}>
                  <DialogTitle className={styles.dialogTitle}>{selected.name}</DialogTitle>
                  {selected.role ? <p className={styles.dialogRole}>{selected.role}</p> : null}
                  {selected.categories.length > 0 ? (
                    <p className={styles.dialogCategory}>{selected.categories.join(" · ")}</p>
                  ) : null}
                  {selected.url ? (
                    <a
                      className={styles.openPill}
                      href={selected.url}
                      {...(selectedIsExternal ? { rel: "noopener noreferrer", target: "_blank" } : {})}
                    >
                      Open project ↗
                    </a>
                  ) : null}
                </DialogHeader>
              </div>
              {selected.description ? (
                <section className={styles.dialogAbout}>
                  <h3 className={styles.dialogAboutTitle}>About</h3>
                  <DialogDescription className={styles.dialogDescription}>
                    {selected.description}
                  </DialogDescription>
                </section>
              ) : null}
              {selected.categories.length > 0 ? (
                <ul aria-label="Categories" className={styles.dialogTags}>
                  {selected.categories.map((c) => (
                    <li className={styles.dialogTag} key={c}>
                      {c}
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
