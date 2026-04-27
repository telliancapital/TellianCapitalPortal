"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { TellianLogo } from "@/components/TellianLogo";
import { useAuth } from "@/lib/auth";

// TODO: replace mock auth guard with real Supabase middleware

export default function DocumentsPage() {
  const { isAuthenticated, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated) router.push("/login");
  }, [isAuthenticated, router]);
  // TODO: fetch documents from Supabase Storage
  // const { data } = await supabase.storage.from("docs").list(userId);
  const documents = [
    { name: "Quartalsbericht Q1 2026.pdf", date: "2026-03-31" },
    { name: "Vermögensübersicht 2025.pdf", date: "2026-01-15" },
    { name: "Mandatsvertrag.pdf", date: "2025-06-01" },
  ];

  if (!isAuthenticated) return null;

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <header
        className="flex items-center justify-between px-6 md:px-10"
        style={{
          height: "64px",
          borderBottom: "1px solid var(--tellian-line)",
        }}
      >
        <TellianLogo width={90} style={{ color: "var(--tellian-dark)" }} />
        <button
          className="uppercase tracking-[0.16em] transition-colors duration-300"
          style={{
            fontSize: "10px",
            color: "var(--tellian-stone)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
          }}
          onClick={() => { logout(); router.push("/login"); }}
        >
          Abmelden
        </button>
      </header>

      {/* Content */}
      <main className="flex-1 px-6 md:px-10 py-10 max-w-[680px]">
        <h1
          style={{
            fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
            fontSize: "clamp(28px, 4vw, 40px)",
            fontWeight: 400,
            letterSpacing: "-0.02em",
            color: "var(--tellian-dark)",
            margin: 0,
          }}
        >
          Ihre Dokumente
        </h1>
        <p
          className="mt-3 mb-10"
          style={{
            fontSize: "14px",
            color: "var(--tellian-stone)",
            lineHeight: 1.6,
          }}
        >
          Hier finden Sie alle Unterlagen zu Ihrem Mandat.
        </p>

        {/* Document list */}
        <ul className="flex flex-col" style={{ gap: 0 }}>
          {documents.map((doc) => (
            <li
              key={doc.name}
              className="flex items-center justify-between py-4"
              style={{ borderBottom: "0.5px solid var(--tellian-line)" }}
            >
              <div className="flex flex-col gap-1 min-w-0 mr-4">
                <span
                  className="truncate"
                  style={{
                    fontSize: "14px",
                    fontWeight: 400,
                    color: "var(--tellian-dark)",
                  }}
                >
                  {doc.name}
                </span>
                <span style={{ fontSize: "11px", color: "var(--tellian-muted)" }}>
                  {new Date(doc.date).toLocaleDateString("de-CH")}
                </span>
              </div>
              <a
                href="#"
                className="shrink-0 uppercase tracking-[0.16em] transition-colors duration-300"
                style={{
                  fontSize: "10px",
                  color: "var(--tellian-stone)",
                  textDecoration: "none",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.color = "var(--tellian-dark)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.color = "var(--tellian-stone)")
                }
              >
                Herunterladen ↓
              </a>
            </li>
          ))}
        </ul>

        {documents.length === 0 && (
          <p
            className="text-center py-16"
            style={{ fontSize: "14px", color: "var(--tellian-muted)" }}
          >
            Noch keine Dokumente verfügbar.
          </p>
        )}
      </main>

      {/* Footer */}
      <footer
        className="px-6 md:px-10 py-6 text-center"
        style={{
          fontSize: "9px",
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--tellian-muted)",
          opacity: 0.6,
        }}
      >
        Tellian Capital AG — Zürich
      </footer>
    </div>
  );
}
