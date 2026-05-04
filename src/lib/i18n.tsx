"use client";

import { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode } from "react";

export type Locale = "de" | "en";

const translations = {
  // Login page
  "login.eyebrow": { de: "Mandanten-Portal", en: "Client Portal" },
  "login.headline1": { de: "Willkommen", en: "Welcome" },
  "login.headline2": { de: "zurück.", en: "back." },
  "login.subtext": {
    de: "Melden Sie sich an, um auf Ihre Performance-Reports und Quartalsberichte zuzugreifen.",
    en: "Sign in to access your performance reports and quarterly statements.",
  },
  "login.email.label": { de: "E-Mail-Adresse", en: "Email address" },
  "login.email.placeholder": { de: "name@beispiel.ch", en: "name@example.ch" },
  "login.password.label": { de: "Passwort", en: "Password" },
  "login.submit": { de: "Anmelden", en: "Sign in" },
  "login.loading": { de: "Wird geladen...", en: "Loading..." },
  "login.forgot": { de: "Passwort vergessen?", en: "Forgot password?" },
  "login.error": {
    de: "E-Mail oder Passwort ungültig.",
    en: "Invalid email or password.",
  },
  "login.support": { de: "Probleme beim Anmelden?", en: "Trouble signing in?" },
  "login.support.link": { de: "Support kontaktieren", en: "Contact support" },
  "login.footer": {
    de: "FINMA-lizenziert · Zürich",
    en: "FINMA-licensed · Zurich",
  },
  "login.back": { de: "Zurück", en: "Back" },

  // Portal layout
  "portal.logout": { de: "Abmelden", en: "Sign out" },

  // Documents page
  "docs.headline": { de: "Ihre Berichte", en: "Your reports" },
  "docs.count": {
    de: "{n} Dokumente verfügbar",
    en: "{n} documents available",
  },
  "docs.download": { de: "Herunterladen", en: "Download" },
  "docs.empty.headline": {
    de: "Keine Berichte verfügbar.",
    en: "No reports available.",
  },
  "docs.empty.subtitle": {
    de: "Sobald neue Dokumente bereitstehen, werden sie hier angezeigt.",
    en: "New documents will appear here once they are ready.",
  },

  // Document types
  "type.Quartalsbericht": { de: "Quartalsbericht", en: "Quarterly report" },
  "type.Monatsbericht": { de: "Monatsbericht", en: "Monthly report" },
} as const;

type TranslationKey = keyof typeof translations;

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>("de");

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) => {
      const entry = translations[key];
      if (!entry) return key;
      let text: string = entry[locale] ?? entry.de;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          text = text.replace(`{${k}}`, String(v));
        }
      }
      return text;
    },
    [locale],
  );

  return <I18nContext value={{ locale, setLocale, t }}>{children}</I18nContext>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
