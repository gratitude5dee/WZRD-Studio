"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";

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

const ORDER_STORAGE_KEY = "wzrd-portfolio-order";
const CUSTOM_STORAGE_KEY = "wzrd-portfolio-custom";

const LONG_PRESS_MS = 550;
const DRAG_SLOP_PX = 8;

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

function normalizeUrl(raw: string): string {
  const url = raw.trim();
  if (!url) return "";
  if (url.startsWith("/")) return url;
  return isExternalUrl(url) ? url : `https://${url}`;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
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
        draggable={false}
        loading="lazy"
        onError={() => setFailed(true)}
        src={src}
      />
    </div>
  );
}

interface DragState {
  name: string;
  startX: number;
  startY: number;
  x: number;
  y: number;
}

interface PressInfo {
  name: string;
  pointerId: number;
  startX: number;
  startY: number;
  target: HTMLButtonElement;
}

// Names contain spaces/symbols — keep tooltip ids DOM-safe.
function tipId(name: string): string {
  return `tip-${name.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

export default function PortfolioGallery({ projects }: { projects: PortfolioProject[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>(ALL_CATEGORY);
  const [selected, setSelected] = useState<PortfolioProject | null>(null);
  const [editing, setEditing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [orderOverride, setOrderOverride] = useState<string[]>([]);
  const [customItems, setCustomItems] = useState<PortfolioProject[]>([]);
  const [drag, setDrag] = useState<DragState | null>(null);

  const gridRef = useRef<HTMLUListElement | null>(null);
  const pressTimer = useRef<number | null>(null);
  const pressInfo = useRef<PressInfo | null>(null);
  const movedEnough = useRef(false);

  // Restore customization after hydration — localStorage is client-only.
  useEffect(() => {
    setOrderOverride(readJson<string[]>(ORDER_STORAGE_KEY, []));
    setCustomItems(readJson<PortfolioProject[]>(CUSTOM_STORAGE_KEY, []));
  }, []);

  const categories = useMemo(() => {
    const seen = new Set<string>();
    for (const project of projects) {
      for (const c of project.categories) seen.add(c);
    }
    return [ALL_CATEGORY, ...seen];
  }, [projects]);

  // CSV order is the default; the stored order array slots matching projects
  // back into place, and anything new (added later or custom) appends at the
  // end so nothing ever disappears.
  const allProjects = useMemo(() => {
    const byName = new Map<string, PortfolioProject>();
    for (const p of projects) byName.set(p.name, p);
    for (const c of customItems) byName.set(c.name, c);
    const ordered: PortfolioProject[] = [];
    const used = new Set<string>();
    for (const name of orderOverride) {
      const p = byName.get(name);
      if (p && !used.has(name)) {
        ordered.push(p);
        used.add(name);
      }
    }
    for (const p of projects) if (!used.has(p.name)) ordered.push(p);
    for (const c of customItems) if (!used.has(c.name)) ordered.push(c);
    return ordered;
  }, [projects, customItems, orderOverride]);

  const normalizedQuery = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      allProjects.filter((project) => {
        if (category !== ALL_CATEGORY && !project.categories.includes(category)) return false;
        if (!normalizedQuery) return true;
        const haystack = [project.name, project.role, project.description, ...project.categories]
          .join(" ")
          .toLowerCase();
        return haystack.includes(normalizedQuery);
      }),
    [allProjects, category, normalizedQuery],
  );

  const persistOrder = useCallback((items: PortfolioProject[]) => {
    const names = items.map((p) => p.name);
    setOrderOverride(names);
    try {
      window.localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(names));
    } catch {
      /* private mode — order just won't persist */
    }
  }, []);

  const persistCustom = useCallback((items: PortfolioProject[]) => {
    setCustomItems(items);
    try {
      window.localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(items));
    } catch {
      /* private mode */
    }
  }, []);

  const moveTile = useCallback(
    (fromName: string, toName: string) => {
      const items = [...allProjects];
      const from = items.findIndex((p) => p.name === fromName);
      const to = items.findIndex((p) => p.name === toName);
      if (from === -1 || to === -1 || from === to) return;
      const [entry] = items.splice(from, 1);
      items.splice(to, 0, entry);
      persistOrder(items);
    },
    [allProjects, persistOrder],
  );

  const clearPress = () => {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
    pressInfo.current = null;
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>, name: string) => {
    movedEnough.current = false;
    pressInfo.current = {
      name,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      target: event.currentTarget,
    };
    if (!editing) {
      // iOS behaviour: long-press enters jiggle mode AND keeps the drag live so
      // the user can keep holding and move the icon without lifting a finger.
      pressTimer.current = window.setTimeout(() => {
        setEditing(true);
        const info = pressInfo.current;
        if (info) {
          setDrag({ name: info.name, startX: info.startX, startY: info.startY, x: 0, y: 0 });
          try {
            info.target.setPointerCapture(info.pointerId);
          } catch {
            /* pointer already released */
          }
        }
      }, LONG_PRESS_MS);
      return;
    }
    setDrag({ name, startX: event.clientX, startY: event.clientY, x: 0, y: 0 });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!movedEnough.current && Math.hypot(dx, dy) > DRAG_SLOP_PX) {
      movedEnough.current = true;
    }
    if (!movedEnough.current) return;
    setDrag({ ...drag, x: dx, y: dy });
    const under = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest("[data-tile-name]");
    const target = under?.getAttribute("data-tile-name");
    if (target && target !== drag.name) moveTile(drag.name, target);
  };

  const handlePointerEnd = () => {
    clearPress();
    if (drag) setDrag(null);
  };

  const openSheet = (project: PortfolioProject) => {
    // A real drag suppresses the click that follows pointer-up.
    if (movedEnough.current) return;
    setSelected(project);
  };

  const removeCustom = (name: string) => {
    persistCustom(customItems.filter((c) => c.name !== name));
    persistOrder(allProjects.filter((p) => p.name !== name));
  };

  const resetOrder = () => {
    persistCustom([]);
    setOrderOverride([]);
    try {
      window.localStorage.removeItem(ORDER_STORAGE_KEY);
      window.localStorage.removeItem(CUSTOM_STORAGE_KEY);
    } catch {
      /* private mode */
    }
  };

  const addProject = (form: HTMLFormElement) => {
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    if (!name) return;
    const next: PortfolioProject = {
      categories: String(data.get("categories") ?? "")
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean),
      description: String(data.get("description") ?? "").trim(),
      image: String(data.get("image") ?? "").trim(),
      imageAlt: null,
      name,
      role: String(data.get("role") ?? "").trim(),
      url: normalizeUrl(String(data.get("url") ?? "")),
    };
    persistCustom([...customItems.filter((c) => c.name !== name), next]);
    setAddOpen(false);
  };

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
            <div className={styles.heroTile}>
              <img alt="" src={TAPE_ARTWORK} />
            </div>
            <div className={styles.heroTile}>
              <img alt="" src="/portfolio/portrait.png" />
            </div>
          </div>
          <h1 className={styles.heroTitle} id="portfolio-title">
            <span className={styles.heroTitleLine}>GRATITUD3/</span>
            <span className={styles.heroTitleLine}>
              Creative Director<span className={styles.heroStar}>*</span>
            </span>
          </h1>
          <div className={styles.identity}>
            <span className={styles.avatarWrap}>
              <img alt="Avi Nav Rao" className={styles.avatar} src="/portfolio/avi-avatar.png" />
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
            Available to co-create →
          </a>
        </section>

        <section aria-label="Project gallery" className={styles.gallery}>
          <div className={styles.galleryHeader}>
            <h2 className={styles.galleryTitle} id="projects-title">
              Projects
            </h2>
            <div className={styles.headerActions}>
              {editing ? (
                <>
                  <span className={styles.editHint}>Drag icons to arrange. Tap Done to save.</span>
                  <button
                    className={styles.editButton}
                    onClick={resetOrder}
                    type="button"
                  >
                    Reset
                  </button>
                  <button
                    className={styles.doneButton}
                    onClick={() => setEditing(false)}
                    type="button"
                  >
                    Done
                  </button>
                </>
              ) : (
                <>
                  <button
                    className={styles.editButton}
                    onClick={() => setAddOpen(true)}
                    type="button"
                  >
                    + Add app
                  </button>
                  <button
                    className={styles.editButton}
                    onClick={() => setEditing(true)}
                    type="button"
                  >
                    Customize
                  </button>
                </>
              )}
              <p className={styles.count}>
                {visible.length === allProjects.length
                  ? `${allProjects.length} projects`
                  : `${visible.length} of ${allProjects.length} projects`}
              </p>
            </div>
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
            <ul
              aria-label="Projects"
              className={styles.homeGrid}
              data-editing={editing}
              ref={gridRef}
            >
              {visible.map((project) => {
                const isCustom = customItems.some((c) => c.name === project.name);
                const isDragging = drag?.name === project.name;
                return (
                  <li className={styles.cell} key={project.name}>
                    <button
                      aria-describedby={tipId(project.name)}
                      aria-haspopup="dialog"
                      aria-label={project.name}
                      className={styles.appTile}
                      data-tile-name={project.name}
                      onClick={() => openSheet(project)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setEditing(true);
                      }}
                      onKeyDown={(e) => {
                        if (editing && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
                          e.preventDefault();
                          const dir = e.key === "ArrowRight" ? 1 : -1;
                          const idx = allProjects.findIndex((p) => p.name === project.name);
                          const swap = allProjects[idx + dir];
                          if (swap) moveTile(project.name, swap.name);
                        }
                      }}
                      onPointerCancel={handlePointerEnd}
                      onPointerDown={(e) => handlePointerDown(e, project.name)}
                      onPointerLeave={clearPress}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerEnd}
                      style={
                        isDragging
                          ? { transform: `translate(${drag.x}px, ${drag.y}px) scale(1.1)` }
                          : undefined
                      }
                      type="button"
                    >
                      <span className={styles.iconWrap}>
                        <ProjectImage
                          alt={project.imageAlt ?? project.name}
                          className={styles.appIcon}
                          imageClassName={styles.appIconImage}
                          name={project.name}
                          src={project.image}
                        />
                      </span>
                      <span aria-hidden="true" className={styles.tooltip} id={tipId(project.name)}>
                        <span className={styles.tooltipName}>{project.name}</span>
                        {project.role ? (
                          <span className={styles.tooltipRole}>{project.role}</span>
                        ) : null}
                      </span>
                    </button>
                    {editing && isCustom ? (
                      <span
                        aria-label={`Remove ${project.name}`}
                        className={styles.deleteBadge}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeCustom(project.name);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            removeCustom(project.name);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        ×
                      </span>
                    ) : null}
                  </li>
                );
              })}
              <li className={styles.cell}>
                <button
                  aria-haspopup="dialog"
                  aria-label="Add a project"
                  className={styles.addTile}
                  onClick={() => setAddOpen(true)}
                  type="button"
                >
                  <span className={styles.addTilePlus}>+</span>
                  <span aria-hidden="true" className={styles.tooltip}>
                    <span className={styles.tooltipName}>Add app</span>
                  </span>
                </button>
              </li>
            </ul>
          )}
          {editing ? (
            <p className={styles.editNote}>
              Hold an icon to jiggle mode — drag to rearrange, × removes apps you added.
            </p>
          ) : (
            <p className={styles.editNote}>
              Hold any icon or tap Customize to rearrange like a home screen — it remembers your layout.
            </p>
          )}
        </section>
      </main>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className={styles.dialogContent}>
          <DialogHeader className={styles.dialogHeader}>
            <DialogTitle className={styles.dialogTitle}>Add app</DialogTitle>
          </DialogHeader>
          <form className={styles.addForm} onSubmit={(e) => { e.preventDefault(); addProject(e.currentTarget); }}>
            <label className={styles.fieldLabel}>
              Name
              <input className={styles.fieldInput} name="name" required type="text" />
            </label>
            <label className={styles.fieldLabel}>
              Role
              <input className={styles.fieldInput} name="role" type="text" />
            </label>
            <label className={styles.fieldLabel}>
              Image URL
              <input className={styles.fieldInput} name="image" placeholder="https://…" type="text" />
            </label>
            <label className={styles.fieldLabel}>
              Project URL
              <input className={styles.fieldInput} name="url" placeholder="https://…" type="text" />
            </label>
            <label className={styles.fieldLabel}>
              Description
              <textarea className={styles.fieldArea} name="description" rows={3} />
            </label>
            <label className={styles.fieldLabel}>
              Categories
              <input className={styles.fieldInput} name="categories" placeholder="Comma-separated" type="text" />
            </label>
            <div className={styles.formActions}>
              <button className={styles.cancelButton} onClick={() => setAddOpen(false)} type="button">
                Cancel
              </button>
              <button className={styles.saveButton} type="submit">
                Add app
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

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
