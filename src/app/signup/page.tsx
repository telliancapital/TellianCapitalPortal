"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { TellianLogo } from "@/components/TellianLogo";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useI18n } from "@/lib/i18n";

export default function SignupPage() {
  const [customerId, setCustomerId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { t } = useI18n();
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        if (res.status === 409) {
          setError(t("signup.error.exists"));
        } else {
          setError(data.error ?? t("login.error"));
        }
        setLoading(false);
        return;
      }
      router.push(`/login?signup=ok`);
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
            href="/login"
            aria-label={t("login.back")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              fontFamily: "var(--font-inter), 'Inter', sans-serif",
              fontSize: "13px",
              fontWeight: 400,
              letterSpacing: "0.05em",
              color: "var(--tellian-stone)",
              textDecoration: "none",
            }}
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

          <span
            style={{
              fontFamily: "var(--font-inter), 'Inter', sans-serif",
              fontSize: "10px",
              fontWeight: 500,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "var(--tellian-stone)",
              display: "block",
              marginTop: "48px",
            }}
          >
            {t("signup.eyebrow")}
          </span>

          <h1
            style={{
              fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
              fontSize: "clamp(36px, 5vw, 48px)",
              fontWeight: 300,
              color: "var(--tellian-dark)",
              margin: 0,
              marginTop: "16px",
              lineHeight: 1.1,
            }}
          >
            {t("signup.headline1")}
            <br />
            <em style={{ fontStyle: "italic", fontWeight: 300 }}>
              {t("signup.headline2")}
            </em>
          </h1>

          <p
            style={{
              fontFamily: "var(--font-inter), 'Inter', sans-serif",
              fontSize: "14px",
              fontWeight: 400,
              color: "var(--tellian-stone)",
              lineHeight: 1.6,
              marginTop: "20px",
              marginBottom: 0,
              maxWidth: "340px",
            }}
          >
            {t("signup.subtext")}
          </p>

          <form onSubmit={handleSubmit} style={{ marginTop: "64px" }}>
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
                autoComplete="new-password"
              />
            </div>

            {error && (
              <p
                role="alert"
                style={{
                  fontFamily: "var(--font-inter), 'Inter', sans-serif",
                  fontSize: "13px",
                  fontWeight: 400,
                  color: "var(--tellian-charcoal)",
                  marginTop: "16px",
                  marginBottom: 0,
                }}
              >
                {error}
              </p>
            )}

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
              }}
            >
              {t("signup.submit")}
              {loading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <ArrowRight size={16} />
              )}
            </button>
          </form>

          <p
            style={{
              marginTop: "24px",
              fontFamily: "var(--font-inter), 'Inter', sans-serif",
              fontSize: "14px",
              color: "var(--tellian-stone)",
            }}
          >
            {t("signup.haveAccount")}{" "}
            <a
              href="/login"
              style={{ color: "var(--tellian-dark)", textDecoration: "none" }}
            >
              {t("signup.login")}
            </a>
          </p>
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
      <label
        htmlFor={id}
        style={{
          fontFamily: "var(--font-inter), 'Inter', sans-serif",
          fontSize: "13px",
          fontWeight: 500,
          letterSpacing: "0.05em",
          color: "var(--tellian-stone)",
          display: "block",
          marginBottom: "8px",
        }}
      >
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
        style={{
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
        }}
      />
    </div>
  );
}
