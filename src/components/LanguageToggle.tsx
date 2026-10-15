"use client";

import { useI18n, type Locale } from "@/lib/i18n";
import { C, sans } from "@/lib/tokens";
import { DURATION, EASE } from "@/lib/motion";

const LOCALES: Locale[] = ["de", "en"];

/* "default": login / admin header (11px). "dashboard": client header
   (12px, 44px tap target, stoneText for contrast). */
export function LanguageToggle({ size = "default" }: { size?: "default" | "dashboard" }) {
  const { locale, setLocale } = useI18n();
  const dash = size === "dashboard";

  return (
    <div className="flex items-center" style={{ gap: dash ? 2 : 4 }}>
      {LOCALES.map((l, i) => (
        <span key={l} className="flex items-center" style={{ gap: dash ? 2 : 4 }}>
          {i > 0 && (
            <span
              aria-hidden
              style={{
                fontFamily: sans,
                fontSize: dash ? 12 : 11,
                color: C.line,
                userSelect: "none",
              }}
            >
              |
            </span>
          )}
          <button
            onClick={() => setLocale(l)}
            aria-pressed={locale === l}
            style={{
              fontFamily: sans,
              fontSize: dash ? 12 : 11,
              fontWeight: locale === l ? 700 : 400,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: locale === l ? C.dark : dash ? C.stoneText : C.stone,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: dash ? "8px 6px" : "8px 4px",
              outline: "none",
              minWidth: dash ? undefined : 28,
              minHeight: dash ? 44 : 36,
              transition: `all ${DURATION.normal}ms ${EASE.standard}`,
            }}
          >
            {l.toUpperCase()}
          </button>
        </span>
      ))}
    </div>
  );
}
