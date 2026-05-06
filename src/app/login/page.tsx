"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { TellianLogo } from "@/components/TellianLogo";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useI18n } from "@/lib/i18n";

type Stage =
  | { kind: "credentials" }
  | {
      kind: "newPassword" | "mfa";
      session: string;
      customerId: string;
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
  error?: string;
}

interface MfaSetupInitResponse {
  status?: "OK";
  secretCode?: string;
  session?: string;
  otpauthUrl?: string;
  error?: string;
}

export default function LoginPage() {
  const [customerId, setCustomerId] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [setupCode, setSetupCode] = useState("");
  const [stage, setStage] = useState<Stage>({ kind: "credentials" });
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { t } = useI18n();

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
      const me = (await meRes.json()) as { mfaEnabled?: boolean };
      if (me.mfaEnabled) {
        window.location.assign("/");
        return;
      }
      const initRes = await fetch("/api/auth/optional-mfa-init", {
        method: "POST",
      });
      const initData = (await initRes.json()) as {
        secretCode?: string;
        otpauthUrl?: string;
        error?: string;
      };
      if (!initRes.ok || !initData.otpauthUrl) {
        // Couldn't generate MFA setup (likely AssociateSoftwareToken failed).
        // Just send them to the dashboard.
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

  function handleOptionalMfaSkip() {
    if (stage.kind !== "optionalMfaSetup") return;
    window.location.assign("/");
  }

  function handleAuthResponse(data: LoginResponse) {
    if (data.status === "OK") {
      void completePostLogin();
      return;
    }
    if (data.status === "PASSWORD_CHANGED") {
      setStage({ kind: "credentials" });
      setPassword("");
      setNewPassword("");
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
      void startMfaSetup(data.session, data.customerId);
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
        kind: data.challengeName === "NEW_PASSWORD_REQUIRED" ? "newPassword" : "mfa",
        session: data.session,
        customerId: data.customerId,
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
      const skipRes = await fetch("/api/auth/skip-mfa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: customerIdArg }),
      });
      if (!skipRes.ok) {
        const skipErr = (await skipRes.json()) as { error?: string };
        setError(skipErr.error ?? t("login.error"));
        setLoading(false);
        return;
      }

      // Re-issue auth with the password still in component state. If the
      // pool's MFA setting is "Optional", Cognito skips the challenge and
      // returns tokens directly. If it's still "Required", we'll get another
      // challenge — surface that so the user knows the pool config blocks it.
      const loginRes = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: customerIdArg,
          password,
        }),
      });
      const data = (await loginRes.json()) as LoginResponse;
      if (!loginRes.ok) {
        setError(data.error ?? t("login.error"));
        setLoading(false);
        return;
      }
      if (data.status === "OK") {
        window.location.assign("/");
        return;
      }
      // Still challenged → pool MFA is Required.
      setStage({ kind: "credentials" });
      setPassword("");
      setMfaCode("");
      setSetupCode("");
      setInfo(null);
      setError(t("challenge.mfaSetup.skipBlocked"));
      setLoading(false);
    } catch {
      setError(t("login.error"));
      setLoading(false);
    }
  }

  async function handleMfaSetupVerify(e: React.FormEvent) {
    e.preventDefault();
    if (stage.kind !== "mfaSetup") return;
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
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, password }),
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
          newPassword: stage.kind === "newPassword" ? newPassword : undefined,
          mfaCode: stage.kind === "mfa" ? mfaCode : undefined,
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

  return (
    <div className="flex-1 flex flex-col lg:flex-row min-h-screen">
      <div
        className="block md:hidden w-full overflow-hidden"
        style={{ height: "200px" }}
      >
        <img src="/login-hero.jpeg" alt="" className="w-full h-full object-cover" />
      </div>

      <div
        className="hidden md:block lg:hidden w-full overflow-hidden"
        style={{ height: "40vh" }}
      >
        <img src="/login-hero.jpeg" alt="" className="w-full h-full object-cover" />
      </div>

      <div className="hidden lg:block lg:w-1/2 lg:min-h-screen overflow-hidden">
        <img src="/login-hero.jpeg" alt="" className="w-full h-full object-cover" />
      </div>

      <div
        className="w-full lg:w-1/2 flex-1 flex flex-col relative px-6 py-12 md:px-12 lg:px-20"
        style={{ backgroundColor: "var(--tellian-bg)" }}
      >
        <div className="flex items-center justify-between">
          <a
            href="https://telliancapital.vercel.app/de"
            aria-label={t("login.back")}
            style={linkStyle}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--tellian-dark)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--tellian-stone)")}
          >
            <ArrowLeft size={16} />
            {t("login.back")}
          </a>
          <LanguageToggle />
        </div>

        <div
          className="flex-1 flex flex-col justify-center"
          style={{ maxWidth: "400px" }}
        >
          <div>
            <TellianLogo width={120} style={{ color: "var(--tellian-dark)" }} />
            <div
              style={{
                width: "24px",
                height: "1px",
                backgroundColor: "var(--tellian-dark)",
                marginTop: "16px",
              }}
            />
          </div>

          <span style={eyebrowStyle}>
            {stage.kind === "credentials"
              ? t("login.eyebrow")
              : stage.kind === "newPassword"
                ? t("challenge.newPassword.headline")
                : stage.kind === "mfaSetup" ||
                    stage.kind === "optionalMfaSetup"
                  ? t("challenge.mfaSetup.headline")
                  : t("challenge.mfa.headline")}
          </span>

          {stage.kind === "credentials" ? (
            <h1 style={headlineStyle}>
              {t("login.headline1")}
              <br />
              <em style={{ fontStyle: "italic", fontWeight: 300 }}>
                {t("login.headline2")}
              </em>
            </h1>
          ) : (
            <h1 style={headlineStyle}>
              {stage.kind === "newPassword"
                ? t("challenge.newPassword.headline")
                : stage.kind === "mfaSetup" ||
                    stage.kind === "optionalMfaSetup"
                  ? t("challenge.mfaSetup.headline")
                  : t("challenge.mfa.headline")}
            </h1>
          )}

          <p style={subtextStyle}>
            {stage.kind === "credentials"
              ? t("login.subtext")
              : stage.kind === "newPassword"
                ? t("challenge.newPassword.subtext")
                : stage.kind === "mfaSetup" ||
                    stage.kind === "optionalMfaSetup"
                  ? t("challenge.mfaSetup.subtext")
                  : t("challenge.mfa.subtext")}
          </p>

          {stage.kind === "credentials" ? (
            <form onSubmit={handleCredentials} style={{ marginTop: "64px" }}>
              <Field
                id="customerId"
                label={t("login.customerId.label")}
                placeholder={t("login.customerId.placeholder")}
                type="text"
                value={customerId}
                onChange={setCustomerId}
                autoComplete="username"
              />
              <div style={{ marginTop: "24px" }}>
                <Field
                  id="password"
                  label={t("login.password.label")}
                  type="password"
                  value={password}
                  onChange={setPassword}
                  autoComplete="current-password"
                />
              </div>
              <InfoText message={info} />
              <ErrorText error={error} />
              <SubmitButton loading={loading} label={t("login.submit")} />
            </form>
          ) : stage.kind === "optionalMfaSetup" ? (
            <form
              onSubmit={handleOptionalMfaVerify}
              style={{ marginTop: "48px" }}
            >
              <MfaSetupSecret otpauthUrl={stage.otpauthUrl} t={t} />
              <div style={{ marginTop: "32px" }}>
                <Field
                  id="setupCode"
                  label={t("challenge.mfaSetup.label")}
                  type="text"
                  value={setupCode}
                  onChange={setSetupCode}
                  autoComplete="one-time-code"
                />
              </div>
              <ErrorText error={error} />
              <SubmitButton loading={loading} label={t("challenge.submit")} />
              <button
                type="button"
                onClick={handleOptionalMfaSkip}
                disabled={loading}
                style={{
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
                }}
              >
                {t("challenge.mfaSetup.skip")}
              </button>
            </form>
          ) : stage.kind === "mfaSetup" ? (
            <form onSubmit={handleMfaSetupVerify} style={{ marginTop: "48px" }}>
              <MfaSetupSecret otpauthUrl={stage.otpauthUrl} t={t} />
              <div style={{ marginTop: "32px" }}>
                <Field
                  id="setupCode"
                  label={t("challenge.mfaSetup.label")}
                  type="text"
                  value={setupCode}
                  onChange={setSetupCode}
                  autoComplete="one-time-code"
                />
              </div>
              <ErrorText error={error} />
              <SubmitButton loading={loading} label={t("challenge.submit")} />
              <button
                type="button"
                onClick={handleSkipMfa}
                disabled={loading}
                style={{
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
                }}
              >
                {t("challenge.mfaSetup.skip")}
              </button>
            </form>
          ) : (
            <form onSubmit={handleChallenge} style={{ marginTop: "64px" }}>
              {stage.kind === "newPassword" ? (
                <Field
                  id="newPassword"
                  label={t("challenge.newPassword.label")}
                  type="password"
                  value={newPassword}
                  onChange={setNewPassword}
                  autoComplete="new-password"
                />
              ) : (
                <Field
                  id="mfaCode"
                  label={t("challenge.mfa.label")}
                  type="text"
                  value={mfaCode}
                  onChange={setMfaCode}
                  autoComplete="one-time-code"
                />
              )}
              <ErrorText error={error} />
              <SubmitButton loading={loading} label={t("challenge.submit")} />
              {stage.kind === "mfa" && (
                <button
                  type="button"
                  onClick={handleSkipMfa}
                  disabled={loading}
                  style={{
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
                  }}
                >
                  {t("challenge.mfaSetup.skip")}
                </button>
              )}
            </form>
          )}

          {stage.kind === "credentials" && (
            <div className="flex items-center justify-between" style={{ marginTop: "24px" }}>
              <a href="#" style={mutedLinkStyle}>
                {t("login.forgot")}
              </a>
              <a href="/signup" style={mutedLinkStyle}>
                {t("login.signup")}
              </a>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 mt-auto pt-8 pb-2">
          <span
            aria-hidden
            style={{
              display: "inline-block",
              width: "24px",
              height: "1px",
              backgroundColor: "var(--tellian-line)",
              flexShrink: 0,
            }}
          />
          <span style={footerStyle}>{t("login.footer")}</span>
        </div>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  type,
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <div>
      <label htmlFor={id} style={labelStyle}>
        {label}
      </label>
      <input
        id={id}
        type={type}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="placeholder:text-tellian-muted"
        style={inputStyle}
        onFocus={(e) =>
          (e.currentTarget.style.borderBottomColor = "var(--tellian-dark)")
        }
        onBlur={(e) =>
          (e.currentTarget.style.borderBottomColor = "var(--tellian-line)")
        }
      />
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

function InfoText({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="status" style={infoStyle}>
      {message}
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
        }}
      >
        <QRCodeSVG value={otpauthUrl} size={176} level="M" />
      </div>
    </div>
  );
}

function SubmitButton({ loading, label }: { loading: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="hover:bg-tellian-charcoal active:scale-[0.98]"
      style={{
        width: "100%",
        height: "56px",
        marginTop: "32px",
        backgroundColor: "var(--tellian-dark)",
        color: "#FFFFFF",
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
      {label}
      {loading ? (
        <Loader2 size={16} className="animate-spin" />
      ) : (
        <ArrowRight size={16} />
      )}
    </button>
  );
}

const linkStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  fontFamily: "var(--font-inter), 'Inter', sans-serif",
  fontSize: "13px",
  fontWeight: 400,
  letterSpacing: "0.05em",
  color: "var(--tellian-stone)",
  textDecoration: "none",
  transition: "color 200ms cubic-bezier(0.16, 1, 0.3, 1)",
};

const eyebrowStyle: React.CSSProperties = {
  fontFamily: "var(--font-inter), 'Inter', sans-serif",
  fontSize: "10px",
  fontWeight: 500,
  letterSpacing: "0.2em",
  textTransform: "uppercase",
  color: "var(--tellian-stone)",
  display: "block",
  marginTop: "48px",
};

const headlineStyle: React.CSSProperties = {
  fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
  fontSize: "clamp(36px, 5vw, 48px)",
  fontWeight: 300,
  color: "var(--tellian-dark)",
  margin: 0,
  marginTop: "16px",
  lineHeight: 1.1,
};

const subtextStyle: React.CSSProperties = {
  fontFamily: "var(--font-inter), 'Inter', sans-serif",
  fontSize: "14px",
  fontWeight: 400,
  color: "var(--tellian-stone)",
  lineHeight: 1.6,
  marginTop: "20px",
  marginBottom: 0,
  maxWidth: "340px",
};

const labelStyle: React.CSSProperties = {
  fontFamily: "var(--font-inter), 'Inter', sans-serif",
  fontSize: "13px",
  fontWeight: 500,
  letterSpacing: "0.05em",
  color: "var(--tellian-stone)",
  display: "block",
  marginBottom: "8px",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  backgroundColor: "transparent",
  border: "none",
  borderBottom: "1px solid var(--tellian-line)",
  borderRadius: 0,
  padding: "12px 0 10px 0",
  fontFamily: "var(--font-inter), 'Inter', sans-serif",
  fontSize: "15px",
  fontWeight: 400,
  color: "var(--tellian-dark)",
  outline: "none",
  transition: "border-color 400ms cubic-bezier(0.16, 1, 0.3, 1)",
};

const errorStyle: React.CSSProperties = {
  fontFamily: "var(--font-inter), 'Inter', sans-serif",
  fontSize: "13px",
  fontWeight: 400,
  color: "var(--tellian-charcoal)",
  marginTop: "16px",
  marginBottom: 0,
};

const infoStyle: React.CSSProperties = {
  fontFamily: "var(--font-inter), 'Inter', sans-serif",
  fontSize: "13px",
  fontWeight: 400,
  color: "var(--tellian-stone)",
  marginTop: "16px",
  marginBottom: 0,
};

const mutedLinkStyle: React.CSSProperties = {
  fontFamily: "var(--font-inter), 'Inter', sans-serif",
  fontSize: "14px",
  fontWeight: 400,
  color: "var(--tellian-stone)",
  textDecoration: "none",
};

const footerStyle: React.CSSProperties = {
  fontFamily: "var(--font-inter), 'Inter', sans-serif",
  fontSize: "11px",
  fontWeight: 500,
  letterSpacing: "0.2em",
  textTransform: "uppercase",
  color: "var(--tellian-muted)",
  whiteSpace: "nowrap",
};
