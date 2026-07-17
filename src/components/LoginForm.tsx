"use client";

import { useState } from "react";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { TellianLogo } from "@/components/TellianLogo";
import { LanguageToggle } from "@/components/LanguageToggle";
import { FloatingField } from "@/components/FloatingField";
import { PasswordField } from "@/components/PasswordField";
import { useI18n } from "@/lib/i18n";
import { EASE, DURATION } from "@/lib/motion";

export type LoginMode = "customer" | "staff";

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
      ? "var(--tellian-error)"
      : passwordProgressFraction < 0.8
        ? "var(--tellian-warning)"
        : "var(--tellian-success)";

  async function startMfaSetup(session: string, customerIdArg: string) {
    try {
      const res = await fetch("/api/auth/mfa-setup-init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session, customerId: customerIdArg }),
      });
      const data = (await res.json()) as MfaSetupInitResponse;
      if (!res.ok || !data.secretCode || !data.session || !data.otpauthUrl) {
        setError(data.error ?? t("login.error"));
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
      setError(t("login.error"));
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
        setError(data.error ?? t("login.error"));
        setLoading(false);
        return;
      }
      window.location.assign("/");
    } catch {
      setError(t("login.error"));
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
    setError(data.error ?? t("login.error"));
    setLoading(false);
  }

  async function handleSkipMfa() {
    if (stage.kind !== "mfaSetup" && stage.kind !== "mfa") return;
    const customerIdArg = stage.customerId;
    setError(null);
    setLoading(true);
    try {
      // The skip preference is now managed entirely through Cognito attributes 
      // in the /api/auth/skip-mfa call below. We no longer use cookies.

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
        setError(skipData.error ?? t("login.error"));
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
      setError(skipData.error ?? t("login.error"));
      setLoading(false);
    } catch {
      setError(t("login.error"));
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
        setError(data.error ?? t("login.error"));
        setLoading(false);
        return;
      }
      handleAuthResponse(data);
    } catch {
      setError(t("login.error"));
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
        setError(data.error ?? t("login.error"));
        setLoading(false);
        return;
      }
      handleAuthResponse(data);
    } catch {
      setError(t("login.error"));
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
        setError(data.error ?? t("login.error"));
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
      setError(t("login.error"));
      setLoading(false);
    }
  }

  const justSavedPassword =
    stage.kind === "credentials" && info === t("challenge.newPassword.success");

  return (
    <div className="flex-1 flex flex-col lg:flex-row min-h-screen lg:h-screen lg:overflow-hidden">
      <div
        className="block md:hidden w-full overflow-hidden"
        style={{ height: "200px" }}
      >
        <img
          src="/login-hero.jpeg"
          alt=""
          className="w-full h-full object-cover"
          style={{
            objectPosition: "center 40%",
            filter: "saturate(0.7) contrast(1.02)",
          }}
        />
      </div>

      <div
        className="hidden md:block lg:hidden w-full overflow-hidden"
        style={{ height: "40vh" }}
      >
        <img
          src="/login-hero.jpeg"
          alt=""
          className="w-full h-full object-cover"
          style={{
            objectPosition: "center 40%",
            filter: "saturate(0.7) contrast(1.02)",
          }}
        />
      </div>

      <div className="hidden lg:block lg:w-1/2 lg:h-screen overflow-hidden">
        <img
          src="/login-hero.jpeg"
          alt=""
          className="w-full h-full object-cover"
          style={{
            objectPosition: "center 40%",
            filter: "saturate(0.7) contrast(1.02)",
          }}
        />
      </div>

      <div
        className="w-full lg:w-1/2 flex-1 flex flex-col relative px-6 md:px-[clamp(40px,8vw,80px)] lg:px-[clamp(48px,5vw,96px)] lg:overflow-y-auto lg:h-screen"
        style={{ backgroundColor: "var(--tellian-bg)" }}
      >
        <div
          className="flex items-center justify-between"
          style={{ padding: "clamp(20px, 3vw, 28px) 0" }}
        >
          <a
            href="https://telliancapital.vercel.app/de"
            aria-label={t("login.back")}
            style={linkStyle}
            onMouseEnter={(e) =>
              (e.currentTarget.style.color = "var(--tellian-dark)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.color = "var(--tellian-stone)")
            }
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              style={{ flexShrink: 0 }}
            >
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

        <div
          className="flex-1 flex flex-col justify-start"
          style={{ paddingTop: "clamp(8px, 1.5vw, 12px)", maxWidth: "420px" }}
        >
          <TellianLogo
            style={{
              width: "clamp(80px, 20vw, 120px)",
              height: "auto",
              marginBottom: "clamp(28px, 5vw, 40px)",
            }}
          />

          <span style={eyebrowStyle}>{t(config.eyebrowKey)}</span>

          <div
            style={{
              width: "28px",
              height: "1.5px",
              backgroundColor: "var(--tellian-dark)",
              marginTop: "16px",
            }}
          />

          <h1 style={headlineStyle}>
            <em style={{ fontStyle: "italic", fontWeight: 400 }}>
              {justSavedPassword
                ? t("challenge.newPassword.successHeadline")
                : stage.kind === "credentials"
                  ? t("login.headline")
                  : stage.kind === "newPassword"
                    ? t("challenge.newPassword.headline")
                    : stage.kind === "mfaSetup" || stage.kind === "optionalMfaSetup"
                      ? t("challenge.mfaSetup.headline")
                      : t("challenge.mfa.headline")}
            </em>
          </h1>

          <p style={subtextStyle}>
            {justSavedPassword
              ? t("challenge.newPassword.success")
              : stage.kind === "credentials"
                ? t("login.subtext")
                : stage.kind === "newPassword"
                  ? t("challenge.newPassword.subtext")
                  : stage.kind === "mfaSetup" || stage.kind === "optionalMfaSetup"
                    ? t("challenge.mfaSetup.subtext")
                    : t("challenge.mfa.subtext")}
          </p>

          {justSavedPassword && (
            <div
              style={{
                marginTop: "24px",
                display: "flex",
                alignItems: "center",
                gap: "12px",
              }}
            >
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  backgroundColor: "var(--tellian-success-bg)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Check size={16} color="var(--tellian-success)" />
              </div>
              <span
                style={{
                  fontFamily: "var(--font-inter), 'Inter', sans-serif",
                  fontSize: "13px",
                  fontWeight: 500,
                  letterSpacing: "0.05em",
                  color: "var(--tellian-success)",
                }}
              >
                {t("challenge.newPassword.saved")}
              </span>
            </div>
          )}

          {stage.kind === "credentials" ? (
            <form
              onSubmit={handleCredentials}
              noValidate
              style={{
                marginTop: "28px",
                display: "flex",
                flexDirection: "column",
                gap: "20px",
              }}
            >
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
                }}
                autoComplete={config.identifierAutoComplete}
                error={identifierError ? t(identifierError) : null}
              />
              <FloatingField
                id="password"
                label={t("login.password.label")}
                type="password"
                value={password}
                onChange={(v) => {
                  setPassword(v);
                  if (passwordError) setPasswordError(null);
                }}
                autoComplete="current-password"
                error={passwordError ? t(passwordError) : null}
              />
              <ErrorText error={error} />
              <SubmitButton loading={loading} label={t("login.submit")} />
            </form>
          ) : stage.kind === "optionalMfaSetup" ? (
            <form
              onSubmit={handleOptionalMfaVerify}
              noValidate
              style={{
                marginTop: "28px",
                display: "flex",
                flexDirection: "column",
                gap: "20px",
              }}
            >
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
              />
              <ErrorText error={error} />
              <SubmitButton loading={loading} label={t("challenge.submit")} />
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
            <form
              onSubmit={handleMfaSetupVerify}
              noValidate
              style={{
                marginTop: "28px",
                display: "flex",
                flexDirection: "column",
                gap: "20px",
              }}
            >
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
              />
              <ErrorText error={error} />
              <SubmitButton loading={loading} label={t("challenge.submit")} />
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
            <form
              onSubmit={handleChallenge}
              noValidate
              style={{
                marginTop: "28px",
                display: "flex",
                flexDirection: "column",
                gap: "20px",
              }}
            >
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
                    error={
                      confirmPasswordError ? t(confirmPasswordError) : null
                    }
                  />

                  <div
                    role="group"
                    aria-label={t("challenge.newPassword.requirements")}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-inter), 'Inter', sans-serif",
                        fontSize: "10px",
                        fontWeight: 500,
                        letterSpacing: "0.18em",
                        textTransform: "uppercase",
                        color: "var(--tellian-stone)",
                        display: "block",
                        marginBottom: "10px",
                      }}
                    >
                      {t("challenge.newPassword.requirements")}
                    </span>

                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "6px",
                      }}
                    >
                      {passwordRuleResults.map((r) => (
                        <div
                          key={r.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                          }}
                        >
                          {r.passed ? (
                            <Check
                              size={14}
                              color="var(--tellian-success)"
                              style={{ flexShrink: 0 }}
                            />
                          ) : (
                            <span
                              aria-hidden
                              style={{
                                width: 14,
                                height: 14,
                                flexShrink: 0,
                                display: "inline-block",
                                borderRadius: "50%",
                                border: `1.5px solid ${
                                  newPassword.length > 0
                                    ? "var(--tellian-error)"
                                    : "var(--tellian-line)"
                                }`,
                              }}
                            />
                          )}
                          <span
                            style={{
                              fontFamily:
                                "var(--font-inter), 'Inter', sans-serif",
                              fontSize: "12px",
                              color: r.passed
                                ? "var(--tellian-success)"
                                : newPassword.length > 0
                                  ? "var(--tellian-dark)"
                                  : "var(--tellian-stone)",
                              transition: "color 200ms ease",
                            }}
                          >
                            {t(r.labelKey)}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div style={{ marginTop: "12px" }}>
                      <div
                        style={{
                          width: "100%",
                          height: 3,
                          backgroundColor: "var(--tellian-subtle)",
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
                              newPassword.length > 0
                                ? passwordProgressColor
                                : "transparent",
                            borderRadius: 2,
                            transition: `width ${DURATION.normal}ms ${EASE.standard}, background-color ${DURATION.normal}ms ease`,
                          }}
                        />
                      </div>
                      <span
                        aria-live="polite"
                        style={{
                          fontFamily: "var(--font-inter), 'Inter', sans-serif",
                          fontSize: "11px",
                          color: "var(--tellian-stone)",
                          display: "block",
                          marginTop: "6px",
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
                />
              )}
              <ErrorText error={error} />
              <SubmitButton
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

          {/* {stage.kind === "credentials" && (
            <div style={{ marginTop: "24px" }}>
              <a href="#" style={mutedLinkStyle}>
                {t("login.forgot")}
              </a>
            </div>
          )} */}
        </div>

        <div
          className="flex items-center flex-wrap gap-4 mt-auto"
          style={{
            borderTop: "1px solid var(--tellian-line)",
            paddingTop: "24px",
            paddingBottom: "clamp(8px, 3vw, 20px)",
            justifyContent:
              stage.kind === "credentials" ? "space-between" : "flex-end",
          }}
        >
          {stage.kind === "credentials" && (
            <a
              href={config.altLink.href}
              style={mutedLinkStyle}
              onMouseEnter={(e) =>
                (e.currentTarget.style.color = "var(--tellian-dark)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.color = "var(--tellian-stone)")
              }
            >
              {t(config.altLink.labelKey)} →
            </a>
          )}
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              style={{
                display: "inline-block",
                width: "16px",
                height: "1px",
                backgroundColor: "var(--tellian-line)",
                flexShrink: 0,
              }}
            />
            <span style={footerStyle}>{t("login.footer")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ErrorText({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" style={errorStyle}>
      {error}
    </p>
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
    <div style={{ marginBottom: "8px" }}>
      <p style={{ ...subtextStyle, marginTop: 0, fontSize: "13px" }}>
        {t("challenge.mfaSetup.instructions")}
      </p>
      <div
        style={{
          marginTop: "16px",
          padding: "16px",
          backgroundColor: "#FFFFFF",
          display: "inline-block",
          border: "1px solid var(--tellian-line)",
          borderRadius: "4px",
        }}
      >
        <QRCodeSVG value={otpauthUrl} size={176} level="M" />
      </div>
    </div>
  );
}

function SubmitButton({
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
      className="hover:bg-tellian-button-hover active:scale-[0.98]"
      style={{
        width: "100%",
        height: "56px",
        marginTop: "8px",
        backgroundColor: "var(--tellian-button)",
        color: "var(--tellian-dark)",
        border: "none",
        borderRadius: 0,
        cursor: loading ? "not-allowed" : "pointer",
        opacity: loading ? 0.8 : 1,
        fontFamily: "var(--font-inter), 'Inter', sans-serif",
        fontSize: "11px",
        fontWeight: 500,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "10px",
        transition: "background-color 300ms ease-out, opacity 300ms ease-out",
      }}
    >
      {loading && loadingLabel ? loadingLabel : label}
      {loading ? (
        <Loader2 size={16} className="animate-spin" />
      ) : (
        <ArrowRight size={16} />
      )}
    </button>
  );
}

function skipButtonStyle(loading: boolean): React.CSSProperties {
  return {
    width: "100%",
    height: "48px",
    marginTop: "12px",
    background: "transparent",
    border: "1px solid var(--tellian-line)",
    color: "var(--tellian-stone)",
    fontFamily: "var(--font-inter), 'Inter', sans-serif",
    fontSize: "11px",
    fontWeight: 500,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    cursor: loading ? "not-allowed" : "pointer",
    opacity: loading ? 0.6 : 1,
  };
}

const linkStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  fontFamily: "var(--font-inter), 'Inter', sans-serif",
  fontSize: "11px",
  fontWeight: 400,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "var(--tellian-stone)",
  textDecoration: "none",
  padding: "8px 0",
  transition: "color 200ms cubic-bezier(0.16, 1, 0.3, 1)",
};

const eyebrowStyle: React.CSSProperties = {
  fontFamily: "var(--font-inter), 'Inter', sans-serif",
  fontSize: "10px",
  fontWeight: 500,
  letterSpacing: "0.22em",
  textTransform: "uppercase",
  color: "var(--tellian-stone)",
  display: "block",
};

const headlineStyle: React.CSSProperties = {
  fontFamily: "var(--font-lustria), 'Lustria', serif",
  fontSize: "clamp(28px, 6vw, 48px)",
  fontWeight: 400,
  letterSpacing: "-0.025em",
  color: "var(--tellian-dark)",
  margin: 0,
  marginTop: "16px",
  lineHeight: 1.05,
};

const subtextStyle: React.CSSProperties = {
  fontFamily: "var(--font-inter), 'Inter', sans-serif",
  fontSize: "15px",
  fontWeight: 400,
  color: "var(--tellian-charcoal)",
  lineHeight: 1.6,
  marginTop: "16px",
  marginBottom: 0,
  maxWidth: "360px",
};

const errorStyle: React.CSSProperties = {
  fontFamily: "var(--font-inter), 'Inter', sans-serif",
  fontSize: "13px",
  fontWeight: 400,
  color: "var(--tellian-error)",
  marginTop: "16px",
  marginBottom: 0,
};

const mutedLinkStyle: React.CSSProperties = {
  fontFamily: "var(--font-inter), 'Inter', sans-serif",
  fontSize: "11px",
  fontWeight: 400,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "var(--tellian-stone)",
  background: "transparent",
  textDecoration: "none",
  padding: "8px 0",
  transition: "color 200ms cubic-bezier(0.16, 1, 0.3, 1)",
};

const footerStyle: React.CSSProperties = {
  fontFamily: "var(--font-inter), 'Inter', sans-serif",
  fontSize: "9px",
  fontWeight: 500,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  color: "var(--tellian-stone)",
  whiteSpace: "nowrap",
};
