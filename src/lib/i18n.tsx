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
  "login.customerId.label": { de: "Kunden-ID", en: "Customer ID" },
  "login.customerId.placeholder": {
    de: "z. B. CUST-12345",
    en: "e.g. CUST-12345",
  },
  "login.password.label": { de: "Passwort", en: "Password" },
  "login.submit": { de: "Anmelden", en: "Sign in" },
  "login.loading": { de: "Wird geladen...", en: "Loading..." },
  "login.forgot": { de: "Passwort vergessen?", en: "Forgot password?" },
  "login.error": {
    de: "Kunden-ID oder Passwort ungültig.",
    en: "Invalid customer ID or password.",
  },
  // Challenges
  "challenge.newPassword.headline": {
    de: "Neues Passwort festlegen",
    en: "Set a new password",
  },
  "challenge.newPassword.subtext": {
    de: "Aus Sicherheitsgründen müssen Sie ein neues Passwort wählen.",
    en: "For security reasons, please choose a new password.",
  },
  "challenge.newPassword.label": { de: "Neues Passwort", en: "New password" },
  "challenge.newPassword.success": {
    de: "Passwort aktualisiert. Bitte melden Sie sich mit Ihrem neuen Passwort an.",
    en: "Password updated. Please sign in with your new password.",
  },
  "challenge.mfa.headline": {
    de: "Bestätigungscode eingeben",
    en: "Enter verification code",
  },
  "challenge.mfa.subtext": {
    de: "Geben Sie den Code aus Ihrer Authenticator-App ein.",
    en: "Enter the code from your authenticator app.",
  },
  "challenge.mfa.label": { de: "Code", en: "Code" },
  "challenge.mfaSetup.headline": {
    de: "Authenticator einrichten",
    en: "Set up authenticator",
  },
  "challenge.mfaSetup.subtext": {
    de: "Verknüpfen Sie eine Authenticator-App, um Ihr Konto zusätzlich abzusichern.",
    en: "Link an authenticator app to add an extra layer of security to your account.",
  },
  "challenge.mfaSetup.instructions": {
    de: "Scannen Sie den QR-Code mit Ihrer Authenticator-App (z. B. Google Authenticator, 1Password, Authy) und geben Sie anschliessend den angezeigten 6-stelligen Code ein.",
    en: "Scan the QR code with your authenticator app (e.g. Google Authenticator, 1Password, Authy), then enter the 6-digit code it shows.",
  },
  "challenge.mfaSetup.secret.label": {
    de: "Geheimer Schlüssel",
    en: "Secret key",
  },
  "challenge.mfaSetup.openLink": {
    de: "In Authenticator-App öffnen",
    en: "Open in authenticator app",
  },
  "challenge.mfaSetup.label": {
    de: "Bestätigungscode",
    en: "Verification code",
  },
  "challenge.mfaSetup.skip": {
    de: "Vorerst überspringen",
    en: "Skip for now",
  },
  "challenge.mfaSetup.skipped": {
    de: "MFA-Einrichtung übersprungen. Bitte erneut anmelden.",
    en: "MFA setup skipped. Please sign in again.",
  },
  "challenge.mfaSetup.skipBlocked": {
    de: "MFA ist für dieses Konto erforderlich und kann nicht übersprungen werden. Bitte wenden Sie sich an den Administrator.",
    en: "MFA is required for this account and cannot be skipped. Please contact your administrator.",
  },
  "challenge.submit": { de: "Bestätigen", en: "Confirm" },

  "login.support": { de: "Probleme beim Anmelden?", en: "Trouble signing in?" },
  "login.support.link": { de: "Support kontaktieren", en: "Contact support" },
  "login.footer": {
    de: "FINMA-lizenziert · Zürich",
    en: "FINMA-licensed · Zurich",
  },
  "login.back": { de: "Zurück", en: "Back" },

  // Portal layout
  "portal.logout": { de: "Abmelden", en: "Sign out" },
  "portal.admin": { de: "Benutzer Management", en: "User Management" },

  // Admin page
  "admin.headline": { de: "Benutzerverwaltung", en: "User management" },
  "admin.subtext": {
    de: "Mandanten erstellen, Rollen ändern und Konten deaktivieren.",
    en: "Create clients, change roles and disable accounts.",
  },
  "admin.create": { de: "Benutzer erstellen", en: "Create user" },
  "admin.col.username": { de: "Kunden-ID", en: "Customer ID" },
  "admin.col.role": { de: "Rolle", en: "Role" },
  "admin.col.status": { de: "Status", en: "Status" },
  "admin.col.actions": { de: "Aktionen", en: "Actions" },
  "admin.status.enabled": { de: "Aktiv", en: "Enabled" },
  "admin.status.disabled": { de: "Deaktiviert", en: "Disabled" },
  "admin.action.disable": { de: "Deaktivieren", en: "Disable" },
  "admin.action.enable": { de: "Aktivieren", en: "Enable" },
  "admin.action.changeRole": { de: "Rolle ändern", en: "Change role" },
  "admin.modal.title": {
    de: "Neuen Benutzer erstellen",
    en: "Create new user",
  },
  "admin.modal.customerId": { de: "Kunden-ID", en: "Customer ID" },
  "admin.modal.role": { de: "Rolle", en: "Role" },
  "admin.modal.tempPassword": {
    de: "Temporäres Passwort (optional)",
    en: "Temporary password (optional)",
  },
  "admin.modal.tempPassword.hint": {
    de: "Leer lassen, um ein sicheres Passwort zu generieren.",
    en: "Leave empty to auto-generate a secure password.",
  },
  "admin.modal.cancel": { de: "Abbrechen", en: "Cancel" },
  "admin.modal.submit": { de: "Erstellen", en: "Create" },
  "admin.created": {
    de: "Benutzer erstellt. Temporäres Passwort:",
    en: "User created. Temporary password:",
  },
  "admin.action.impersonate": {
    de: "Als Benutzer anmelden",
    en: "Login as user",
  },

  // Impersonation
  "impersonation.banner": {
    de: "Sie sehen das Portal als {target}.",
    en: "You are viewing the portal as {target}.",
  },
  "impersonation.exit": {
    de: "Impersonation beenden",
    en: "Exit impersonation",
  },

  // Documents page
  "docs.headline": { de: "Ihre Berichte", en: "Your reports" },
  "docs.count": {
    de: "{n} Dokumente verfügbar",
    en: "{n} documents available",
  },
  "docs.countMore": {
    de: "{n}+ Dokumente verfügbar",
    en: "{n}+ documents available",
  },
  "docs.loadMore": { de: "Mehr laden", en: "Load more" },
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

  // Validation
  "validation.customerId.required": {
    de: "Kunden-ID ist erforderlich.",
    en: "Customer ID is required.",
  },
  "validation.customerId.invalid": {
    de: "Bitte geben Sie eine gültige Kunden-ID ein (keine E-Mail-Adresse).",
    en: "Please enter a valid customer ID (not an email address).",
  },
  "validation.password.required": {
    de: "Passwort ist erforderlich.",
    en: "Password is required.",
  },
  "validation.password.policy": {
    de: "Mindestens 8 Zeichen mit Gross-/Kleinbuchstaben, Zahl und Sonderzeichen.",
    en: "At least 8 characters with upper- and lowercase letters, a number and a special character.",
  },
  "validation.mfaCode": {
    de: "Code muss aus 6 Ziffern bestehen.",
    en: "Code must be 6 digits.",
  },
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
