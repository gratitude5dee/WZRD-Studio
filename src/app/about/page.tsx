import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About — WZRD.tech",
  description: "WZRD.tech is creative infrastructure for artists, studios, and intelligent tools.",
};

const principles = [
  ["01", "Make", "A generative media studio for turning a fragment into a finished signal."],
  ["02", "Move", "Tools and intelligence that keep the work portable across the rooms where culture happens."],
  ["03", "Own", "Creative infrastructure that keeps authorship, context, and possibility close to the creator."],
] as const;

export default function AboutPage() {
  return (
    <main
      style={{
        background: "radial-gradient(circle at 80% 0%, #223d78 0%, transparent 28%), #05070a",
        color: "#f1ebdd",
        fontFamily: "Newsreader, Georgia, serif",
        minHeight: "100svh",
        overflow: "hidden",
      }}
    >
      <header
        style={{
          alignItems: "center",
          display: "flex",
          fontFamily: "'Azeret Mono', ui-monospace, Consolas, monospace",
          justifyContent: "space-between",
          padding: "1.4rem clamp(1.15rem, 4.5vw, 4rem)",
          position: "relative",
          zIndex: 1,
        }}
      >
        <a aria-label="WZRD.tech home" href="/" style={{ color: "inherit", fontSize: "0.8rem", letterSpacing: "0.14em", textDecoration: "none" }}>
          WZRD.tech
        </a>
        <a
          href="https://studio.wzrd.tech"
          style={{ color: "inherit", fontSize: "0.68rem", letterSpacing: "0.11em", textDecoration: "none", textTransform: "uppercase" }}
        >
          Enter Studio ↗
        </a>
      </header>

      <section
        style={{
          display: "grid",
          gap: "3rem",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 20rem), 1fr))",
          minHeight: "calc(100svh - 5.5rem)",
          padding: "clamp(5rem, 12vw, 11rem) clamp(1.15rem, 8vw, 9rem) clamp(5rem, 10vw, 8rem)",
          position: "relative",
        }}
      >
        <div style={{ alignSelf: "center", maxWidth: "43rem", position: "relative", zIndex: 1 }}>
          <p style={{ color: "#8cc8ff", fontFamily: "'Azeret Mono', ui-monospace, Consolas, monospace", fontSize: "0.72rem", letterSpacing: "0.14em", margin: "0 0 1.4rem", textTransform: "uppercase" }}>
            About / WZRD Studio
          </p>
          <h1 style={{ fontSize: "clamp(3.4rem, 9vw, 8.2rem)", fontWeight: 400, letterSpacing: "-0.075em", lineHeight: 0.84, margin: 0 }}>
            Infrastructure for the work that becomes culture.
          </h1>
        </div>
        <div style={{ alignSelf: "end", maxWidth: "29rem", position: "relative", zIndex: 1 }}>
          <p style={{ color: "rgba(241,235,221,0.8)", fontSize: "clamp(1.15rem, 2vw, 1.5rem)", lineHeight: 1.42, margin: 0 }}>
            WZRD connects the people, tools, and rooms behind a release — so a creative signal can travel further without losing its point of view.
          </p>
        </div>
      </section>

      <section
        style={{
          borderTop: "1px solid rgba(241,235,221,0.2)",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 16rem), 1fr))",
          margin: "0 clamp(1.15rem, 4.5vw, 4rem)",
        }}
      >
        {principles.map(([index, title, copy]) => (
          <article key={index} style={{ borderRight: "1px solid rgba(241,235,221,0.14)", minHeight: "17rem", padding: "2rem clamp(1.3rem, 3vw, 3rem) 3rem" }}>
            <p style={{ color: "#f0a145", fontFamily: "'Azeret Mono', ui-monospace, Consolas, monospace", fontSize: "0.72rem", letterSpacing: "0.12em", margin: "0 0 4rem" }}>
              {index}
            </p>
            <h2 style={{ fontSize: "clamp(2rem, 3.2vw, 3.25rem)", fontWeight: 400, letterSpacing: "-0.06em", margin: 0 }}>{title}</h2>
            <p style={{ color: "rgba(241,235,221,0.66)", fontSize: "1.05rem", lineHeight: 1.45, margin: "1rem 0 0", maxWidth: "24rem" }}>{copy}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
