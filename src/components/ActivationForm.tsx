"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TellianLogo } from "@/components/TellianLogo";
import { LanguageToggle } from "@/components/LanguageToggle";
import { FloatingField } from "@/components/FloatingField";
import { PasswordField } from "@/components/PasswordField";
import {
  ErrorBanner,
  MfaSetupSecret,
  SecondaryButton,
  NEW_PASSWORD_RULES,
  validateNewPassword,
  validateMfaCode,
  eyebrowStyle,
  headlineStyle,
  introStyle,
  formStyle,
  linkStyle,
  footerStyle,
} from "@/components/LoginForm";
import { useI18n } from "@/lib/i18n";
import { C, sans } from "@/lib/tokens";

/* ═══════════════════════════════════════════════════════════
   CUSTOMER ACTIVATION — one-time link from the admin email.
   verify customer number → set password → set up MFA → portal.
   Layout mirrors LoginForm (same three zones, same hero).
   ═══════════════════════════════════════════════════════════ */

type InvalidCode = "invalid" | "expired" | "completed";

type Stage =
  | { kind: "loading" }
  | { kind: "invalid"; code: InvalidCode }
  | { kind: "verify" }
  | { kind: "password" }
  | { kind: "mfa"; otpauthUrl: string | null; needsLogin: boolean }
  | { kind: "done" };

interface StepResponse {
  status?: "OK";
  step?: "verify" | "password" | "mfa" | "completed";
  needsLogin?: boolean;
  otpauthUrl?: string;
  error?: string;
  code?: string;
}

async function post(path: string, body: Record<string, unknown>): Promise<{ ok: boolean; data: StepResponse }> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as StepResponse;
  return { ok: res.ok, data };
}

function toInvalid(code: string | undefined): InvalidCode {
  return code === "expired" || code === "completed" ? code : "invalid";
}

export default function ActivationForm({ token }: { token?: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [stage, setStage] = useState<Stage>(() =>
    token ? { kind: "loading" } : { kind: "invalid", code: "invalid" },
  );
  const [customerId, setCustomerId] = useState("");
  const [customerIdError, setCustomerIdError] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [newPasswordError, setNewPasswordError] = useState<string | null>(null);
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null);
  const [setupCode, setSetupCode] = useState("");
  const [setupCodeError, setSetupCodeError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const startMfa = useCallback(async () => {
    const { ok, data } = await post("/api/activate/mfa-init", { token });
    if (ok && data.otpauthUrl) {
      setStage({ kind: "mfa", otpauthUrl: data.otpauthUrl, needsLogin: false });
      return;
    }
    if (data.code === "needsLogin") {
      setStage({ kind: "mfa", otpauthUrl: null, needsLogin: true });
      return;
    }
    if (data.code) {
      setStage({ kind: "invalid", code: toInvalid(data.code) });
      return;
    }
    setStage({ kind: "mfa", otpauthUrl: null, needsLogin: false });
    setError(t("activate.error.generic"));
  }, [token, t]);

  /* Validate the link once on mount and resume at the right step. */
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const { ok, data } = await post("/api/activate/open", { token });
        if (cancelled) return;
        if (!ok) {
          setStage({ kind: "invalid", code: toInvalid(data.code) });
          return;
        }
        if (data.step === "mfa") {
          if (data.needsLogin) setStage({ kind: "mfa", otpauthUrl: null, needsLogin: true });
          else await startMfa();
        } else if (data.step === "password") {
          setStage({ kind: "password" });
        } else {
          setStage({ kind: "verify" });
        }
      } catch {
        if (!cancelled) setStage({ kind: "invalid", code: "invalid" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, startMfa]);

  /* Redirect to the portal shortly after completion. */
  useEffect(() => {
    if (stage.kind !== "done") return;
    const id = setTimeout(() => router.replace("/"), 1800);
    return () => clearTimeout(id);
  }, [stage.kind, router]);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    const value = customerId.trim();
    if (!value) {
      setCustomerIdError(t("validation.customerId.required"));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { ok, data } = await post("/api/activate/verify", { token, customerId: value });
      if (ok) {
        if (data.step === "mfa") await startMfa();
        else setStage({ kind: "password" });
        return;
      }
      if (data.code === "mismatch") setCustomerIdError(t("activate.verify.error"));
      else if (data.code) setStage({ kind: "invalid", code: toInvalid(data.code) });
      else setError(t("activate.error.generic"));
    } catch {
      setError(t("activate.error.generic"));
    } finally {
      setLoading(false);
    }
  }

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    const pwErr = validateNewPassword(newPassword);
    const confirmErr =
      confirmPassword !== newPassword ? "validation.password.mismatch" : null;
    setNewPasswordError(pwErr ? t(pwErr) : null);
    setConfirmPasswordError(confirmErr ? t(confirmErr) : null);
    if (pwErr || confirmErr) return;

    setLoading(true);
    setError(null);
    try {
      const { ok, data } = await post("/api/activate/set-password", {
        token,
        password: newPassword,
      });
      if (ok) {
        if (data.needsLogin) setStage({ kind: "mfa", otpauthUrl: null, needsLogin: true });
        else await startMfa();
        return;
      }
      if (data.code === "policy") setNewPasswordError(t("validation.password.policy"));
      else if (data.code === "unverified") setStage({ kind: "verify" });
      else if (data.code === "used") await startMfa();
      else if (data.code) setStage({ kind: "invalid", code: toInvalid(data.code) });
      else setError(t("activate.error.generic"));
    } catch {
      setError(t("activate.error.generic"));
    } finally {
      setLoading(false);
    }
  }

  async function handleMfa(e: React.FormEvent) {
    e.preventDefault();
    const codeErr = validateMfaCode(setupCode);
    if (codeErr) {
      setSetupCodeError(t(codeErr));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { ok, data } = await post("/api/activate/mfa-verify", { token, code: setupCode });
      if (ok) {
        setStage({ kind: "done" });
        return;
      }
      if (data.code === "needsLogin") setStage({ kind: "mfa", otpauthUrl: null, needsLogin: true });
      else if (data.code) setStage({ kind: "invalid", code: toInvalid(data.code) });
      else setSetupCodeError(t("activate.mfa.error"));
    } catch {
      setError(t("activate.error.generic"));
    } finally {
      setLoading(false);
    }
  }

  const passwordRuleResults = NEW_PASSWORD_RULES.map((r) => ({ ...r, passed: r.test(newPassword) }));

  const stepNumber =
    stage.kind === "verify" ? 1 : stage.kind === "password" ? 2 : stage.kind === "mfa" ? 3 : null;

  const headline =
    stage.kind === "loading"
      ? t("activate.loading.headline")
      : stage.kind === "invalid"
        ? t(`activate.${stage.code}.headline`)
        : stage.kind === "verify"
          ? t("activate.verify.headline")
          : stage.kind === "password"
            ? t("challenge.newPassword.headline")
            : stage.kind === "mfa"
              ? t("challenge.mfaSetup.headline")
              : t("activate.done.headline");

  const intro =
    stage.kind === "loading"
      ? null
      : stage.kind === "invalid"
        ? t(`activate.${stage.code}.body`)
        : stage.kind === "verify"
          ? t("activate.verify.subtext")
          : stage.kind === "password"
            ? t("activate.password.subtext")
            : stage.kind === "mfa"
              ? stage.needsLogin
                ? t("activate.needsLogin.body")
                : t("activate.mfa.subtext")
              : t("activate.done.body");

  const headerZone = (
    <div className="flex items-center justify-between shrink-0 py-5 md:py-7">
      <a
        href="https://telliancapital.vercel.app/de"
        style={linkStyle}
        onMouseEnter={(e) => (e.currentTarget.style.color = C.dark)}
        onMouseLeave={(e) => (e.currentTarget.style.color = C.stone)}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
          <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>{t("login.back")}</span>
      </a>
      <LanguageToggle />
    </div>
  );

  const coreZone = (
    <div className="flex-1 flex flex-col justify-start pt-2 md:pt-3" style={{ maxWidth: 420 }}>
      <TellianLogo className="h-20 md:h-[120px] mb-7 md:mb-10" />

      <span style={eyebrowStyle}>
        {t("login.eyebrow")}
        {stepNumber && (
          <span style={{ color: C.muted }}>{` · ${t("activate.step", { n: stepNumber })}`}</span>
        )}
      </span>

      <div style={{ width: 28, height: 1.5, backgroundColor: C.dark, marginTop: 16 }} />

      <h1 className="text-[clamp(28px,8vw,36px)] md:text-[clamp(36px,4vw,48px)]" style={headlineStyle}>
        <em style={{ fontStyle: "italic", fontWeight: 400 }}>{headline}</em>
      </h1>

      {intro && <p style={introStyle}>{intro}</p>}

      <ErrorBanner error={error} />

      {stage.kind === "invalid" && (
        <div style={{ marginTop: 28 }}>
          <Link href="/login" style={secondaryLinkStyle}>
            {t("activate.toLogin")} →
          </Link>
        </div>
      )}

      {stage.kind === "verify" && (
        <form onSubmit={handleVerify} noValidate style={formStyle}>
          <FloatingField
            id="customerId"
            label={t("login.customerId.label")}
            placeholder={t("login.customerId.placeholder")}
            value={customerId}
            onChange={(v) => {
              setCustomerId(v);
              if (customerIdError) setCustomerIdError(null);
            }}
            autoComplete="username"
            error={customerIdError}
            disabled={loading}
            required
          />
          <SecondaryButton loading={loading} label={t("activate.verify.submit")} />
        </form>
      )}

      {stage.kind === "password" && (
        <form onSubmit={handlePassword} noValidate style={formStyle}>
          <PasswordField
            id="newPassword"
            label={t("challenge.newPassword.label")}
            value={newPassword}
            onChange={(v) => {
              setNewPassword(v);
              if (newPasswordError) setNewPasswordError(null);
            }}
            autoComplete="new-password"
            error={newPasswordError}
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
            error={confirmPasswordError}
            disabled={loading}
          />

          <div role="group" aria-label={t("challenge.newPassword.requirements")}>
            <span style={requirementsLabelStyle}>{t("challenge.newPassword.requirements")}</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {passwordRuleResults.map((r) => (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                    {r.passed ? (
                      <path d="M5 12l5 5L20 7" stroke={C.success} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    ) : (
                      <path d="M18 6L6 18M6 6l12 12" stroke={newPassword.length > 0 ? C.error : C.line} strokeWidth="1.5" strokeLinecap="round" />
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
          </div>

          <SecondaryButton
            loading={loading}
            label={t("challenge.newPassword.submit")}
            loadingLabel={t("challenge.newPassword.loading")}
          />
        </form>
      )}

      {stage.kind === "mfa" && stage.needsLogin && (
        <div style={{ marginTop: 28 }}>
          <Link href="/login" style={secondaryLinkStyle}>
            {t("activate.toLogin")} →
          </Link>
        </div>
      )}

      {stage.kind === "mfa" && !stage.needsLogin && stage.otpauthUrl && (
        <form onSubmit={handleMfa} noValidate style={formStyle}>
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
            error={setupCodeError}
            disabled={loading}
            required
          />
          <SecondaryButton loading={loading} label={t("challenge.submit")} />
        </form>
      )}

      {stage.kind === "done" && (
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
              <path d="M5 12l5 5L20 7" stroke={C.success} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <Link href="/" style={{ ...secondaryLinkStyle, color: C.success }}>
            {t("activate.done.cta")} →
          </Link>
        </div>
      )}
    </div>
  );

  const footerZone = (
    <div
      className="flex items-center flex-wrap gap-4 shrink-0 mt-auto pb-5 md:pb-2"
      style={{ paddingTop: 24, borderTop: `1px solid ${C.line}`, justifyContent: "flex-end" }}
    >
      <div className="flex items-center" style={{ gap: 10 }}>
        <div aria-hidden style={{ width: 16, height: 1, backgroundColor: C.line, flexShrink: 0 }} />
        <span style={footerStyle}>{t("login.footer")}</span>
      </div>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col lg:flex-row min-h-screen lg:h-screen" style={{ backgroundColor: C.bg }}>
      <div className="lg:hidden w-full shrink-0 overflow-hidden h-[max(150px,22vh)] md:h-[max(200px,28vh)]">
        {/* eslint-disable-next-line @next/next/no-img-element -- static hero, full-bleed cover */}
        <img src="/login-hero.jpg" alt="" style={{ width: "100%", height: "100%", display: "block", objectFit: "cover", objectPosition: "center 18%" }} />
      </div>
      <div className="hidden lg:block lg:w-1/2 lg:h-screen shrink-0 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element -- static hero, full-bleed cover */}
        <img src="/login-hero.jpg" alt="" style={{ width: "100%", height: "100%", display: "block", objectFit: "cover", objectPosition: "center 42%" }} />
      </div>
      <div className="flex-1 flex flex-col px-6 md:px-[clamp(40px,8vw,80px)] lg:px-[clamp(48px,5vw,96px)] lg:overflow-auto lg:h-screen">
        {headerZone}
        {coreZone}
        {footerZone}
      </div>
    </div>
  );
}

const requirementsLabelStyle: React.CSSProperties = {
  fontFamily: sans,
  fontSize: 10,
  fontWeight: 500,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  color: C.stone,
  display: "block",
  marginBottom: 10,
};

const secondaryLinkStyle: React.CSSProperties = {
  fontFamily: sans,
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: C.dark,
  textDecoration: "none",
};
