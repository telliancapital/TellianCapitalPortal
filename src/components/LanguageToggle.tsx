"use client";

import { useI18n, type Locale } from "@/lib/i18n";

const LOCALES: Locale[] = ["de", "en"];

export function LanguageToggle() {
  const { locale, setLocale } = useI18n();

  return (
    <div className="flex items-center gap-1">
      {LOCALES.map((l, i) => (
        <span key={l} className="flex items-center">
          {i > 0 && (
            <span
              style={{
                fontFamily: "var(--font-inter), 'Inter', sans-serif",
                color: "var(--tellian-line)",
                fontSize: "11px",
                userSelect: "none",
              }}
            >
              |
            </span>
          )}
          <button
            onClick={() => setLocale(l)}
            style={{
              fontFamily: "var(--font-inter), 'Inter', sans-serif",
              fontSize: "11px",
              fontWeight: locale === l ? 700 : 400,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: locale === l ? "var(--tellian-dark)" : "var(--tellian-stone)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "8px 4px",
              outline: "none",
              minWidth: "28px",
              minHeight: "36px",
              transition: "color 200ms cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            {l.toUpperCase()}
          </button>
        </span>
      ))}
    </div>
  );
}
