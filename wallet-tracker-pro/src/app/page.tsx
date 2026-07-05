import type { ReactNode } from "react";

const roadmap = [
  {
    title: "Phase 1 — Watchlist API",
    detail: "Persist tracked wallets and recent transactions in Prisma.",
  },
  {
    title: "Phase 2 — Telegram bot",
    detail: "Alert on large moves and copy-trade signals (master plan Month 2).",
  },
  {
    title: "Phase 3 — Dashboard",
    detail: "Portfolio charts and behavioral analytics in this Next.js app.",
  },
];

export default function HomePage(): ReactNode {
  return (
    <main
      style={{
        margin: "0 auto",
        maxWidth: "960px",
        padding: "2.5rem 1.5rem",
        fontFamily: "system-ui, sans-serif",
        color: "#e5e7eb",
        background: "#0b0f17",
        minHeight: "100vh",
      }}
    >
      <p style={{ color: "#94a3b8", letterSpacing: "0.08em", textTransform: "uppercase" }}>
        SolanaIdeasLab
      </p>
      <h1 style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>
        Wallet Tracker Pro
      </h1>
      <p style={{ color: "#cbd5e1", lineHeight: 1.6, maxWidth: "48rem" }}>
        Spec-heavy scaffold. Core analytics workers and API routes are not wired
        yet. See <code>BUILD-STATUS.md</code> at the repo root for current build
        state across all three projects.
      </p>

      <section style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "1.25rem" }}>Roadmap</h2>
        <ul style={{ paddingLeft: "1.25rem", lineHeight: 1.8 }}>
          {roadmap.map((item) => (
            <li key={item.title}>
              <strong>{item.title}</strong> — {item.detail}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
