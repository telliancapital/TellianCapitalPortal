"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { TellianLogo } from "@/components/TellianLogo";
import { LanguageToggle } from "@/components/LanguageToggle";
import { FloatingField } from "@/components/FloatingField";
import { PasswordField } from "@/components/PasswordField";
import { useI18n } from "@/lib/i18n";
import { EASE, DURATION } from "@/lib/motion";
import { C, serif, sans } from "@/lib/tokens";

export type LoginMode = "customer" | "staff";

/* Mirrors the design portal: eyebrow size is a local constant until the
   main site exposes a shared token. */
const EYEBROW_SIZE = "10px";

type Stage =
  | { kind: "credentials" }
  | {
      kind: "newPassword" | "mfa";
      session: string;
      customerId: string;
      email?: string;
    }
  | {
      kind: "mfaSetup";
      session: string;
      customerId: string;
      secretCode: string;
      otpauthUrl: string;
    }
  | {
      kind: "optionalMfaSetup";
      otpauthUrl: string;
    };

interface LoginResponse {
  status: "OK" | "CHALLENGE" | "PASSWORD_CHANGED";
  challengeName?: string;
  session?: string;
  customerId?: string;
  email?: string;
  error?: string;
}

type ValidationKey =
  | "validation.customerId.required"
  | "validation.customerId.invalid"
  | "validation.email.required"
  | "validation.email.invalid"
  | "validation.password.required"
  | "validation.password.policy"
  | "validation.password.mismatch"
  | "validation.mfaCode";

function validateCustomerId(v: string): ValidationKey | null {
  const trimmed = v.trim();
  if (!trimmed) return "validation.customerId.required";
  if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) return "validation.customerId.invalid";
  return null;
}

function validateEmail(v: string): ValidationKey | null {
  const trimmed = v.trim();
  if (!trimmed) return "validation.email.required";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed))
    return "validation.email.invalid";
  return null;
}

function validateLoginPassword(v: string): ValidationKey | null {
  return v ? null : "validation.password.required";
}

function validateNewPassword(v: string): ValidationKey | null {
  if (!v) return "validation.password.required";
  if (v.length < 8) return "validation.password.policy";
  if (!/[A-Z]/.test(v)) return "validation.password.policy";
  if (!/[a-z]/.test(v)) return "validation.password.policy";
  if (!/[0-9]/.test(v)) return "validation.password.policy";
  if (!/[!@#$%^&*(),.?":{}|<>_\-=+[\]\\/;'`~]/.test(v))
    return "validation.password.policy";
  return null;
}

function validateMfaCode(v: string): ValidationKey | null {
  return /^\d{6}$/.test(v) ? null : "validation.mfaCode";
}

/* Mirrors the checks inside validateNewPassword — for the live checklist
   display only. validateNewPassword remains the sole gate on submission. */
const NEW_PASSWORD_RULES: {
  id: string;
  labelKey:
    | "challenge.newPassword.rule.length"
    | "challenge.newPassword.rule.uppercase"
    | "challenge.newPassword.rule.lowercase"
    | "challenge.newPassword.rule.digit"
    | "challenge.newPassword.rule.special";
  test: (v: string) => boolean;
}[] = [
  { id: "length", labelKey: "challenge.newPassword.rule.length", test: (v) => v.length >= 8 },
  { id: "uppercase", labelKey: "challenge.newPassword.rule.uppercase", test: (v) => /[A-Z]/.test(v) },
  { id: "lowercase", labelKey: "challenge.newPassword.rule.lowercase", test: (v) => /[a-z]/.test(v) },
  { id: "digit", labelKey: "challenge.newPassword.rule.digit", test: (v) => /[0-9]/.test(v) },
  {
    id: "special",
    labelKey: "challenge.newPassword.rule.special",
    test: (v) => /[!@#$%^&*(),.?":{}|<>_\-=+[\]\\/;'`~]/.test(v),
  },
];

interface MfaSetupInitResponse {
  status?: "OK";
  secretCode?: string;
  session?: string;
  otpauthUrl?: string;
  error?: string;
}

interface ModeConfig {
  loginEndpoint: string;
  identifierBodyKey: "customerId" | "email";
  identifierLabelKey: "login.customerId.label" | "login.email.label";
  identifierPlaceholderKey?:
    | "login.customerId.placeholder"
    | "login.email.placeholder";
  identifierAutoComplete: string;
  identifierType: "text" | "email";
  eyebrowKey: "login.eyebrow" | "login.staff.eyebrow";
  errorKey: "login.error" | "login.staff.error";
  validateIdentifier: (v: string) => ValidationKey | null;
  altLink: {
    href: string;
    labelKey: "login.altLink.staff" | "login.altLink.customer";
  };
}

const CUSTOMER_CONFIG: ModeConfig = {
  loginEndpoint: "/api/auth/login",
  identifierBodyKey: "customerId",
  identifierLabelKey: "login.customerId.label",
  identifierPlaceholderKey: "login.customerId.placeholder",
  identifierAutoComplete: "username",
  identifierType: "text",
  eyebrowKey: "login.eyebrow",
  errorKey: "login.error",
  validateIdentifier: validateCustomerId,
  altLink: { href: "/login/staff", labelKey: "login.altLink.staff" },
};

const STAFF_CONFIG: ModeConfig = {
  loginEndpoint: "/api/auth/staff-login",
  identifierBodyKey: "email",
  identifierLabelKey: "login.email.label",
  identifierPlaceholderKey: "login.email.placeholder",
  identifierAutoComplete: "email",
  identifierType: "email",
  eyebrowKey: "login.staff.eyebrow",
  errorKey: "login.staff.error",
  validateIdentifier: validateEmail,
  altLink: { href: "/login", labelKey: "login.altLink.customer" },
};

export default function LoginForm({ mode }: { mode: LoginMode }) {
  const config = mode === "staff" ? STAFF_CONFIG : CUSTOMER_CONFIG;
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [setupCode, setSetupCode] = useState("");
  const [stage, setStage] = useState<Stage>({ kind: "credentials" });
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [identifierError, setIdentifierError] = useState<ValidationKey | null>(
    null,
  );
  const [passwordError, setPasswordError] = useState<ValidationKey | null>(
    null,
  );
  const [newPasswordError, setNewPasswordError] =
    useState<ValidationKey | null>(null);
  const [confirmPasswordError, setConfirmPasswordError] =
    useState<ValidationKey | null>(null);
  const [mfaCodeError, setMfaCodeError] = useState<ValidationKey | null>(null);
  const [setupCodeError, setSetupCodeError] = useState<ValidationKey | null>(
    null,
  );
  const { t } = useI18n();

  const passwordRuleResults = NEW_PASSWORD_RULES.map((r) => ({
    ...r,
    passed: r.test(newPassword),
  }));
  const passedRuleCount = passwordRuleResults.filter((r) => r.passed).length;
  const passwordProgressFraction =
    passwordRuleResults.length > 0
      ? passedRuleCount / passwordRuleResults.length
      : 0;
  const passwordProgressColor =
    passwordProgressFraction < 0.4
      ? C.error
      : passwordProgressFraction < 0.8
        ? C.warning
        : C.success;

  async function startMfaSetup(session: string, customerIdArg: string) {
    try {
      const res = await fetch("/api/auth/mfa-setup-init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session, customerId: customerIdArg }),
      });
      const data = (await res.json()) as MfaSetupInitResponse;
      if (!res.ok || !data.secretCode || !data.session || !data.otpauthUrl) {
        setError(data.error ?? t(config.errorKey));
        setLoading(false);
        return;
      }
      setStage({
        kind: "mfaSetup",
        session: data.session,
        customerId: customerIdArg,
        secretCode: data.secretCode,
        otpauthUrl: data.otpauthUrl,
      });
      setInfo(null);
      setLoading(false);
    } catch {
      setError(t(config.errorKey));
      setLoading(false);
    }
  }

  async function completePostLogin() {
    try {
      const meRes = await fetch("/api/auth/me", { cache: "no-store" });
      if (!meRes.ok) {
        window.location.assign("/");
        return;
      }
      const me = (await meRes.json()) as {
        mfaEnabled?: boolean;
        mfaRequired?: boolean;
      };
      // MFA already configured by the user → straight to dashboard.
      if (me.mfaEnabled) {
        window.location.assign("/");
        return;
      }
      // Admin has not forced MFA → straight to dashboard.
      if (!me.mfaRequired) {
        window.location.assign("/");
        return;
      }
      // Admin forced MFA but user has no TOTP yet → show setup screen
      // (with a Skip button that performs a one-time bypass for this
      // session, leaving the admin's flag intact).
      const initRes = await fetch("/api/auth/optional-mfa-init", {
        method: "POST",
      });
      const initData = (await initRes.json()) as {
        secretCode?: string;
        otpauthUrl?: string;
        error?: string;
      };
      if (!initRes.ok || !initData.otpauthUrl) {
        window.location.assign("/");
        return;
      }
      setStage({
        kind: "optionalMfaSetup",
        otpauthUrl: initData.otpauthUrl,
      });
      setError(null);
      setInfo(null);
      setLoading(false);
    } catch {
      window.location.assign("/");
    }
  }

  async function handleOptionalMfaVerify(e: React.FormEvent) {
    e.preventDefault();
    if (stage.kind !== "optionalMfaSetup") return;
    const codeErr = validateMfaCode(setupCode);
    setSetupCodeError(codeErr);
    if (codeErr) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/optional-mfa-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: setupCode }),
      });
      const data = (await res.json()) as { status?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? t(config.errorKey));
        setLoading(false);
        return;
      }
      window.location.assign("/");
    } catch {
      setError(t(config.errorKey));
      setLoading(false);
    }
  }

  async function handleOptionalMfaSkip() {
    if (stage.kind !== "optionalMfaSetup") return;
    // Persist the opt-out so the user is not prompted again on every
    // future login (until admin re-enables MFA from the dashboard).
    try {
      await fetch("/api/auth/disable-mfa", { method: "POST" });
    } catch (e) {
      console.error("Failed to persist MFA skip:", e);
    }
    window.location.assign("/");
  }

  function handleAuthResponse(
    data: LoginResponse,
    options?: { passwordOverride?: string; noAutoSkip?: boolean },
  ) {
    if (data.status === "OK") {
      void completePostLogin();
      return;
    }
    if (data.status === "PASSWORD_CHANGED") {
      setStage({ kind: "credentials" });
      setPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setError(null);
      setInfo(t("challenge.newPassword.success"));
      setLoading(false);
      return;
    }
    if (
      data.status === "CHALLENGE" &&
      data.session &&
      data.customerId &&
      data.challengeName === "MFA_SETUP"
    ) {
      if (options?.noAutoSkip) {
        void startMfaSetup(data.session, data.customerId);
        return;
      }

      const checkSkip = async () => {
        try {
          const checkRes = await fetch("/api/auth/check-mfa-skip", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: data.customerId }),
          });
          const checkData = await checkRes.json();
          if (checkData.skipped) {
            // User previously skipped — authenticate via admin API
            const skipRes = await fetch("/api/auth/skip-mfa", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                customerId: data.customerId,
                password: options?.passwordOverride || password,
                mode,
              }),
            });
            const skipData = (await skipRes.json()) as LoginResponse;
            if (skipRes.ok && skipData.status === "OK") {
              window.location.assign("/");
              return;
            }
          }
        } catch (e) {
          console.error("MFA skip check failed:", e);
        }
        // Not skipped or skip failed — show MFA setup UI
        void startMfaSetup(data.session!, data.customerId!);
      };
      void checkSkip();
      return;
    }
    if (
      data.status === "CHALLENGE" &&
      data.session &&
      data.customerId &&
      (data.challengeName === "NEW_PASSWORD_REQUIRED" ||
        data.challengeName === "SOFTWARE_TOKEN_MFA")
    ) {
      setStage({
        kind:
          data.challengeName === "NEW_PASSWORD_REQUIRED"
            ? "newPassword"
            : "mfa",
        session: data.session,
        customerId: data.customerId,
        email: data.email,
      });
      setInfo(null);
      setLoading(false);
      return;
    }
    setError(data.error ?? t(config.errorKey));
    setLoading(false);
  }

  async function handleSkipMfa() {
    if (stage.kind !== "mfaSetup" && stage.kind !== "mfa") return;
    const customerIdArg = stage.customerId;
    setError(null);
    setLoading(true);
    try {
      // The skip preference is managed entirely through Cognito attributes
      // in the /api/auth/skip-mfa call below.
      const skipRes = await fetch("/api/auth/skip-mfa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: customerIdArg,
          password,
          mode,
        }),
      });
      const skipData = (await skipRes.json()) as LoginResponse;

      if (!skipRes.ok) {
        setError(skipData.error ?? t(config.errorKey));
        setLoading(false);
        return;
      }

      // On OK or if Cognito still returns MFA_SETUP (which means the admin
      // flow disabled it but the session is valid) — redirect to dashboard.
      if (
        skipData.status === "OK" ||
        skipData.challengeName === "MFA_SETUP"
      ) {
        window.location.assign("/");
        return;
      }

      // Any other unexpected challenge — show an error
      setError(skipData.error ?? t(config.errorKey));
      setLoading(false);
    } catch {
      setError(t(config.errorKey));
      setLoading(false);
    }
  }

  async function handleMfaSetupVerify(e: React.FormEvent) {
    e.preventDefault();
    if (stage.kind !== "mfaSetup") return;
    const codeErr = validateMfaCode(setupCode);
    setSetupCodeError(codeErr);
    if (codeErr) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/mfa-setup-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session: stage.session,
          customerId: stage.customerId,
          code: setupCode,
          mode,
        }),
      });
      const data = (await res.json()) as LoginResponse;
      if (!res.ok) {
        setError(data.error ?? t(config.errorKey));
        setLoading(false);
        return;
      }
      handleAuthResponse(data);
    } catch {
      setError(t(config.errorKey));
      setLoading(false);
    }
  }

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault();
    const idErr = config.validateIdentifier(identifier);
    const passwordErr = validateLoginPassword(password);
    setIdentifierError(idErr);
    setPasswordError(passwordErr);
    if (idErr || passwordErr) return;
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const res = await fetch(config.loginEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          [config.identifierBodyKey]: identifier.trim(),
          password,
        }),
      });
      const data = (await res.json()) as LoginResponse;
      if (!res.ok) {
        setError(data.error ?? t(config.errorKey));
        setLoading(false);
        return;
      }
      handleAuthResponse(data);
    } catch {
      setError(t(config.errorKey));
      setLoading(false);
    }
  }

  async function handleChallenge(e: React.FormEvent) {
    e.preventDefault();
    if (
      stage.kind === "credentials" ||
      stage.kind === "mfaSetup" ||
      stage.kind === "optionalMfaSetup"
    ) {
      return;
    }
    if (stage.kind === "newPassword") {
      const err = validateNewPassword(newPassword);
      setNewPasswordError(err);
      if (err) return;

      if (newPassword !== confirmPassword) {
        setConfirmPasswordError("validation.password.mismatch");
        return;
      }
      setConfirmPasswordError(null);
    } else {
      const err = validateMfaCode(mfaCode);
      setMfaCodeError(err);
      if (err) return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/respond-challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeName:
            stage.kind === "newPassword"
              ? "NEW_PASSWORD_REQUIRED"
              : "SOFTWARE_TOKEN_MFA",
          session: stage.session,
          customerId: stage.customerId,
          email: stage.email,
          newPassword: stage.kind === "newPassword" ? newPassword : undefined,
          mfaCode: stage.kind === "mfa" ? mfaCode : undefined,
          mode,
        }),
      });
      const data = (await res.json()) as LoginResponse;
      if (!res.ok) {
        setError(data.error ?? t(config.errorKey));
        setLoading(false);
        return;
      }

      if (stage.kind === "newPassword") {
        const p = newPassword;
        setPassword(p);
        setNewPassword("");
        setConfirmPassword("");
        handleAuthResponse(data, { passwordOverride: p });
      } else {
        handleAuthResponse(data);
      }
    } catch {
      setError(t(config.errorKey));
      setLoading(false);
    }
  }

  const justSavedPassword =
    stage.kind === "credentials" && info === t("challenge.newPassword.success");

  /* Submit turns Imperial Purple as soon as both fields are filled. */
  const credentialsReady = identifier.trim() !== "" && password !== "";

  const headline = justSavedPassword
    ? t("challenge.newPassword.successHeadline")
    : stage.kind === "credentials"
      ? t("login.headline")
      : stage.kind === "newPassword"
        ? t("challenge.newPassword.headline")
        : stage.kind === "mfaSetup" || stage.kind === "optionalMfaSetup"
          ? t("challenge.mfaSetup.headline")
          : t("challenge.mfa.headline");

  /* The design shows no intro under "Willkommen zurück." — only the
     set-password and confirmation states carry one. */
  const intro = justSavedPassword
    ? t("challenge.newPassword.success")
    : stage.kind === "credentials"
      ? null
      : stage.kind === "newPassword"
        ? t("challenge.newPassword.subtext")
        : stage.kind === "mfaSetup" || stage.kind === "optionalMfaSetup"
          ? t("challenge.mfaSetup.subtext")
          : t("challenge.mfa.subtext");

  /* ════════════════════════════════════════════════════════════
     ZONE 1 — HEADER (utility row)
     ════════════════════════════════════════════════════════════ */
  const headerZone = (
    <div className="flex items-center justify-between shrink-0 py-5 md:py-7">
      <a
        href="https://telliancapital.vercel.app/de"
        style={linkStyle}
        onMouseEnter={(e) => (e.currentTarget.style.color = C.dark)}
        onMouseLeave={(e) => (e.currentTarget.style.color = C.stone)}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
          <path
            d="M19 12H5M12 19l-7-7 7-7"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span>{t("login.back")}</span>
      </a>
      <LanguageToggle />
    </div>
  );

  /* ════════════════════════════════════════════════════════════
     ZONE 2 — CORE (Logo → Eyebrow → Headline → Form)
     ════════════════════════════════════════════════════════════ */
  const coreZone = (
    <div
      className="flex-1 flex flex-col justify-start pt-2 md:pt-3"
      style={{ maxWidth: 420 }}
    >
      <TellianLogo className="h-20 md:h-[120px] mb-7 md:mb-10" />

      <span style={eyebrowStyle}>{t(config.eyebrowKey)}</span>

      {/* Accent line — matches main site section pattern */}
      <div style={{ width: 28, height: 1.5, backgroundColor: C.dark, marginTop: 16 }} />

      <h1
        className="text-[clamp(28px,8vw,36px)] md:text-[clamp(36px,4vw,48px)]"
        style={headlineStyle}
      >
        <em style={{ fontStyle: "italic", fontWeight: 400 }}>{headline}</em>
      </h1>

      {intro && <p style={introStyle}>{intro}</p>}

      {justSavedPassword && (
        <div style={{ marginTop: 32, display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              backgroundColor: C.successBg,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M5 12l5 5L20 7"
                stroke={C.success}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <span
            style={{
              fontFamily: sans,
              fontSize: 13,
              color: C.success,
              fontWeight: 500,
              letterSpacing: "0.05em",
            }}
          >
            {t("challenge.newPassword.saved")}
          </span>
        </div>
      )}

      <ErrorBanner error={error} />

      {stage.kind === "credentials" ? (
        <form onSubmit={handleCredentials} noValidate style={formStyle}>
          <FloatingField
            id="identifier"
            label={t(config.identifierLabelKey)}
            placeholder={
              config.identifierPlaceholderKey
                ? t(config.identifierPlaceholderKey)
                : undefined
            }
            type={config.identifierType}
            value={identifier}
            onChange={(v) => {
              setIdentifier(v);
              if (identifierError) setIdentifierError(null);
              if (error) setError(null);
            }}
            autoComplete={config.identifierAutoComplete}
            error={identifierError ? t(identifierError) : null}
            disabled={loading}
            required
          />
          <FloatingField
            id="password"
            label={t("login.password.label")}
            type="password"
            value={password}
            onChange={(v) => {
              setPassword(v);
              if (passwordError) setPasswordError(null);
              if (error) setError(null);
            }}
            autoComplete="current-password"
            error={passwordError ? t(passwordError) : null}
            disabled={loading}
            required
          />
          <PrimaryButton
            loading={loading}
            ready={credentialsReady}
            label={t("login.submit")}
            loadingLabel={t("login.loading")}
          />
        </form>
      ) : stage.kind === "optionalMfaSetup" ? (
        <form onSubmit={handleOptionalMfaVerify} noValidate style={formStyle}>
          <MfaSetupSecret otpauthUrl={stage.otpauthUrl} t={t} />
          <FloatingField
            id="setupCode"
            label={t("challenge.mfaSetup.label")}
            type="text"
            value={setupCode}
            onChange={(v) => {
              setSetupCode(v);
              if (setupCodeError) setSetupCodeError(null);
            }}
            autoComplete="one-time-code"
            error={setupCodeError ? t(setupCodeError) : null}
            disabled={loading}
            required
          />
          <SecondaryButton loading={loading} label={t("challenge.submit")} />
          <button
            type="button"
            onClick={handleOptionalMfaSkip}
            disabled={loading}
            style={skipButtonStyle(loading)}
          >
            {t("challenge.mfaSetup.skip")}
          </button>
        </form>
      ) : stage.kind === "mfaSetup" ? (
        <form onSubmit={handleMfaSetupVerify} noValidate style={formStyle}>
          <MfaSetupSecret otpauthUrl={stage.otpauthUrl} t={t} />
          <FloatingField
            id="setupCode"
            label={t("challenge.mfaSetup.label")}
            type="text"
            value={setupCode}
            onChange={(v) => {
              setSetupCode(v);
              if (setupCodeError) setSetupCodeError(null);
            }}
            autoComplete="one-time-code"
            error={setupCodeError ? t(setupCodeError) : null}
            disabled={loading}
            required
          />
          <SecondaryButton loading={loading} label={t("challenge.submit")} />
          <button
            type="button"
            onClick={handleSkipMfa}
            disabled={loading}
            style={skipButtonStyle(loading)}
          >
            {t("challenge.mfaSetup.skip")}
          </button>
        </form>
      ) : (
        <form onSubmit={handleChallenge} noValidate style={formStyle}>
          {stage.kind === "newPassword" ? (
            <>
              <PasswordField
                id="newPassword"
                label={t("challenge.newPassword.label")}
                value={newPassword}
                onChange={(v) => {
                  setNewPassword(v);
                  if (newPasswordError) setNewPasswordError(null);
                }}
                autoComplete="new-password"
                error={newPasswordError ? t(newPasswordError) : null}
                disabled={loading}
              />
              <PasswordField
                id="confirmPassword"
                label={t("challenge.confirmPassword.label")}
                value={confirmPassword}
                onChange={(v) => {
                  setConfirmPassword(v);
                  if (confirmPasswordError) setConfirmPasswordError(null);
                }}
                autoComplete="new-password"
                error={confirmPasswordError ? t(confirmPasswordError) : null}
                disabled={loading}
              />

              {/* Requirements checklist */}
              <div role="group" aria-label={t("challenge.newPassword.requirements")}>
                <span
                  style={{
                    fontFamily: sans,
                    fontSize: 10,
                    fontWeight: 500,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: C.stone,
                    display: "block",
                    marginBottom: 10,
                  }}
                >
                  {t("challenge.newPassword.requirements")}
                </span>

                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {passwordRuleResults.map((r) => (
                    <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                        {r.passed ? (
                          <path
                            d="M5 12l5 5L20 7"
                            stroke={C.success}
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        ) : (
                          <path
                            d="M18 6L6 18M6 6l12 12"
                            stroke={newPassword.length > 0 ? C.error : C.line}
                            strokeWidth="1.5"
                            strokeLinecap="round"
                          />
                        )}
                      </svg>
                      <span
                        style={{
                          fontFamily: sans,
                          fontSize: 12,
                          color: r.passed ? C.success : newPassword.length > 0 ? C.dark : C.stone,
                          transition: "color 200ms ease",
                        }}
                      >
                        {t(r.labelKey)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Progress bar — "requirements met", not "strength" */}
                <div style={{ marginTop: 12 }}>
                  <div
                    style={{
                      width: "100%",
                      height: 3,
                      backgroundColor: C.subtle,
                      borderRadius: 2,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      role="progressbar"
                      aria-valuenow={passedRuleCount}
                      aria-valuemin={0}
                      aria-valuemax={passwordRuleResults.length}
                      aria-label={t("challenge.newPassword.progress", {
                        passed: passedRuleCount,
                        total: passwordRuleResults.length,
                      })}
                      style={{
                        width: `${passwordProgressFraction * 100}%`,
                        height: "100%",
                        backgroundColor:
                          newPassword.length > 0 ? passwordProgressColor : "transparent",
                        borderRadius: 2,
                        transition: `width ${DURATION.normal}ms ${EASE.standard}, background-color ${DURATION.normal}ms ease`,
                      }}
                    />
                  </div>
                  <span
                    aria-live="polite"
                    style={{
                      fontFamily: sans,
                      fontSize: 11,
                      color: C.stone,
                      display: "block",
                      marginTop: 6,
                    }}
                  >
                    {newPassword.length > 0 &&
                      t("challenge.newPassword.progress", {
                        passed: passedRuleCount,
                        total: passwordRuleResults.length,
                      })}
                  </span>
                </div>
              </div>
            </>
          ) : (
            <FloatingField
              id="mfaCode"
              label={t("challenge.mfa.label")}
              type="text"
              value={mfaCode}
              onChange={(v) => {
                setMfaCode(v);
                if (mfaCodeError) setMfaCodeError(null);
              }}
              autoComplete="one-time-code"
              error={mfaCodeError ? t(mfaCodeError) : null}
              disabled={loading}
              required
            />
          )}
          <SecondaryButton
            loading={loading}
            label={
              stage.kind === "newPassword"
                ? t("challenge.newPassword.submit")
                : t("challenge.submit")
            }
            loadingLabel={
              stage.kind === "newPassword"
                ? t("challenge.newPassword.loading")
                : undefined
            }
          />
          {stage.kind === "mfa" && (
            <button
              type="button"
              onClick={handleSkipMfa}
              disabled={loading}
              style={skipButtonStyle(loading)}
            >
              {t("challenge.mfaSetup.skip")}
            </button>
          )}
        </form>
      )}
    </div>
  );

  /* ════════════════════════════════════════════════════════════
     ZONE 3 — FOOTER (secondary, anchored at the bottom)
     ════════════════════════════════════════════════════════════ */
  const footerZone = (
    <div
      className="flex items-center flex-wrap gap-4 shrink-0 mt-auto pb-5 md:pb-2"
      style={{
        paddingTop: 24,
        borderTop: `1px solid ${C.line}`,
        justifyContent: stage.kind === "credentials" ? "space-between" : "flex-end",
      }}
    >
      {stage.kind === "credentials" && (
        <a
          href={config.altLink.href}
          style={mutedLinkStyle}
          onMouseEnter={(e) => (e.currentTarget.style.color = C.dark)}
          onMouseLeave={(e) => (e.currentTarget.style.color = C.stone)}
        >
          {t(config.altLink.labelKey)} →
        </a>
      )}
      <div className="flex items-center" style={{ gap: 10 }}>
        <div aria-hidden style={{ width: 16, height: 1, backgroundColor: C.line, flexShrink: 0 }} />
        <span style={footerStyle}>{t("login.footer")}</span>
      </div>
    </div>
  );

  /* ════════════════════════════════════════════════════════════
     LAYOUT — vertical (<1024, image strip on top) / desktop split
     ════════════════════════════════════════════════════════════ */
  return (
    <div
      className="flex-1 flex flex-col lg:flex-row min-h-screen lg:h-screen"
      style={{ backgroundColor: C.bg }}
    >
      {/* Image strip (mobile + tablet): same motif as the desktop panel, full-bleed */}
      <div className="lg:hidden w-full shrink-0 overflow-hidden h-[max(150px,22vh)] md:h-[max(200px,28vh)]">
        {/* eslint-disable-next-line @next/next/no-img-element -- static hero, full-bleed cover */}
        <img
          src="/login-hero.jpg"
          alt=""
          style={{
            width: "100%",
            height: "100%",
            display: "block",
            objectFit: "cover",
            objectPosition: "center 18%",
          }}
        />
      </div>

      {/* Desktop — left image (hard edge) */}
      <div className="hidden lg:block lg:w-1/2 lg:h-screen shrink-0 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element -- static hero, full-bleed cover */}
        <img
          src="/login-hero.jpg"
          alt=""
          style={{
            width: "100%",
            height: "100%",
            display: "block",
            objectFit: "cover",
            objectPosition: "center 42%",
          }}
        />
      </div>

      {/* Form column (3 zones) */}
      <div className="flex-1 flex flex-col px-6 md:px-[clamp(40px,8vw,80px)] lg:px-[clamp(48px,5vw,96px)] lg:overflow-auto lg:h-screen">
        {headerZone}
        {coreZone}
        {footerZone}
      </div>
    </div>
  );
}

/* Server error — bordered banner between headline and form (design). */
function ErrorBanner({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        marginTop: 24,
        padding: "12px 16px",
        backgroundColor: C.errorBg,
        border: `1px solid ${C.error}`,
        borderRadius: 4,
        fontFamily: sans,
        fontSize: 13,
        color: C.error,
        lineHeight: 1.5,
      }}
    >
      {error}
    </div>
  );
}

function MfaSetupSecret({
  otpauthUrl,
  t,
}: {
  otpauthUrl: string;
  t: ReturnType<typeof useI18n>["t"];
}) {
  return (
    <div style={{ marginBottom: 8 }}>
      <p style={{ ...introStyle, marginTop: 0, fontSize: 13 }}>
        {t("challenge.mfaSetup.instructions")}
      </p>
      <div
        style={{
          marginTop: 16,
          padding: 16,
          backgroundColor: "#FFFFFF",
          display: "inline-block",
          border: `1px solid ${C.line}`,
          borderRadius: 4,
        }}
      >
        <QRCodeSVG value={otpauthUrl} size={176} level="M" />
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      style={{
        width: 14,
        height: 14,
        border: `2px solid ${C.stone}`,
        borderTopColor: C.dark,
        borderRadius: "50%",
        animation: "portal-spin 0.8s linear infinite",
        flexShrink: 0,
      }}
    />
  );
}

/* Login submit — muted until both fields are filled, then Imperial Purple.
   Always clickable (shows field errors otherwise). */
function PrimaryButton({
  loading,
  ready,
  label,
  loadingLabel,
}: {
  loading: boolean;
  ready: boolean;
  label: string;
  loadingLabel: string;
}) {
  return (
    <button
      type="submit"
      disabled={loading}
      style={{
        fontFamily: sans,
        fontSize: 12,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        fontWeight: 600,
        color: ready ? C.bg : C.stoneText,
        backgroundColor: loading ? C.line : ready ? C.purple : "transparent",
        border: `1px solid ${loading ? C.line : ready ? C.purple : C.line}`,
        borderRadius: 0,
        padding: "16px 32px",
        cursor: loading ? "not-allowed" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        minHeight: 52,
        width: "100%",
        transition: `background-color ${DURATION.fast}ms ease, color ${DURATION.fast}ms ease, border-color ${DURATION.fast}ms ease`,
        outline: "none",
        marginTop: 8,
      }}
      onMouseEnter={(e) => {
        if (!loading)
          e.currentTarget.style.backgroundColor = ready ? C.purpleHover : C.bgSecondary;
      }}
      onMouseLeave={(e) => {
        if (!loading)
          e.currentTarget.style.backgroundColor = ready ? C.purple : "transparent";
      }}
    >
      {loading ? (
        <>
          <Spinner />
          <span>{loadingLabel}</span>
        </>
      ) : (
        <>
          <span>{label}</span>
          <span aria-hidden>→</span>
        </>
      )}
    </button>
  );
}

/* Challenge submit — Mushroom, matches main site + set-password design. */
function SecondaryButton({
  loading,
  label,
  loadingLabel,
}: {
  loading: boolean;
  label: string;
  loadingLabel?: string;
}) {
  return (
    <button
      type="submit"
      disabled={loading}
      style={{
        fontFamily: sans,
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: C.dark,
        backgroundColor: loading ? C.line : C.button,
        border: `1px solid ${loading ? C.line : C.button}`,
        borderRadius: 0,
        padding: "16px 32px",
        cursor: loading ? "not-allowed" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        minHeight: 52,
        width: "100%",
        transition: `background-color ${DURATION.fast}ms ease`,
        outline: "none",
        marginTop: 4,
      }}
      onMouseEnter={(e) => {
        if (!loading) e.currentTarget.style.backgroundColor = C.buttonHover;
      }}
      onMouseLeave={(e) => {
        if (!loading) e.currentTarget.style.backgroundColor = C.button;
      }}
    >
      {loading ? (
        <>
          <Spinner />
          <span>{loadingLabel ?? label}</span>
        </>
      ) : (
        <>
          <span>{label}</span>
          <span aria-hidden>→</span>
        </>
      )}
    </button>
  );
}

function skipButtonStyle(loading: boolean): React.CSSProperties {
  return {
    width: "100%",
    minHeight: 48,
    background: "transparent",
    border: `1px solid ${C.line}`,
    borderRadius: 0,
    color: C.stone,
    fontFamily: sans,
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    cursor: loading ? "not-allowed" : "pointer",
    opacity: loading ? 0.6 : 1,
    outline: "none",
  };
}

const formStyle: React.CSSProperties = {
  marginTop: 28,
  display: "flex",
  flexDirection: "column",
  gap: 20,
};

const linkStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontFamily: sans,
  fontSize: 11,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: C.stone,
  textDecoration: "none",
  padding: "8px 0",
  transition: `all ${DURATION.normal}ms ${EASE.standard}`,
};

const eyebrowStyle: React.CSSProperties = {
  fontFamily: sans,
  fontSize: EYEBROW_SIZE,
  fontWeight: 500,
  letterSpacing: "0.22em",
  textTransform: "uppercase",
  color: C.stone,
  display: "block",
};

const headlineStyle: React.CSSProperties = {
  fontFamily: serif,
  lineHeight: 1.05,
  color: C.dark,
  letterSpacing: "-0.025em",
  fontWeight: 400,
  margin: "16px 0 0 0",
};

const introStyle: React.CSSProperties = {
  fontFamily: sans,
  fontSize: 15,
  color: C.charcoal,
  lineHeight: 1.6,
  margin: "16px 0 0 0",
  maxWidth: 360,
};

const mutedLinkStyle: React.CSSProperties = {
  fontFamily: sans,
  fontSize: 11,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: C.stone,
  background: "transparent",
  textDecoration: "none",
  padding: "8px 0",
  textAlign: "left",
  transition: `all ${DURATION.normal}ms ${EASE.standard}`,
};

const footerStyle: React.CSSProperties = {
  fontFamily: sans,
  fontSize: 9,
  fontWeight: 500,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  color: C.stone,
  whiteSpace: "nowrap",
};
