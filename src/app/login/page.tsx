"use client";

import { useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // Mock — simulate auth delay, log to console
    await new Promise((r) => setTimeout(r, 1500));
    console.log(`Login submitted: ${email}`);
    setError("E-Mail oder Passwort ungültig.");
    setLoading(false);
  }

  return (
    <div className="flex-1 flex flex-col lg:flex-row min-h-screen">
      {/* ── Left: Image ── */}
      {/* TODO: Asset wählen aus src/assets/ (Schweizer Berge, See, editorial) */}

      {/* Mobile: small banner (200px) */}
      <div
        className="block md:hidden w-full"
        style={{ height: "200px", backgroundColor: "var(--tellian-bg-secondary)" }}
      />

      {/* Tablet: image strip (40vh) */}
      <div
        className="hidden md:block lg:hidden w-full"
        style={{ height: "40vh", backgroundColor: "var(--tellian-bg-secondary)" }}
      />

      {/* Desktop: left half (50%) */}
      <div
        className="hidden lg:block lg:w-1/2 lg:min-h-screen"
        style={{ backgroundColor: "var(--tellian-bg-secondary)" }}
      >
        {/* When asset is chosen:
            <img src="/assets/..." alt="" className="w-full h-full object-cover" /> */}
      </div>

      {/* ── Right: Form ── */}
      <div
        className="
          w-full lg:w-1/2
          flex-1 flex flex-col justify-center items-center
          relative
          px-6 py-12
          md:px-12
          lg:px-20
        "
        style={{ backgroundColor: "var(--tellian-bg)" }}
      >
        <div className="w-full" style={{ maxWidth: "400px" }}>
          {/* 1. Wordmark */}
          <div>
            <span
              style={{
                fontFamily: "var(--font-inter), 'Inter', sans-serif",
                fontSize: "14px",
                fontWeight: 500,
                letterSpacing: "0.3em",
                textTransform: "uppercase",
                color: "var(--tellian-dark)",
                display: "block",
              }}
            >
              Tellian Capital
            </span>
            <div
              style={{
                width: "24px",
                height: "1px",
                backgroundColor: "var(--tellian-dark)",
                marginTop: "16px",
              }}
            />
          </div>

          {/* 2. Headline */}
          <h1
            style={{
              fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
              fontSize: "clamp(36px, 5vw, 48px)",
              fontWeight: 300,
              color: "var(--tellian-dark)",
              margin: 0,
              marginTop: "48px",
              lineHeight: 1.1,
            }}
          >
            Mandanten-Portal
          </h1>

          {/* 3. Form */}
          <form
            onSubmit={handleSubmit}
            style={{ marginTop: "64px" }}
          >
            {/* Email */}
            <div>
              <label
                htmlFor="email"
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
                E-Mail-Adresse
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  width: "100%",
                  height: "48px",
                  padding: "0 16px",
                  backgroundColor: "#FFFFFF",
                  border: "1px solid var(--tellian-line)",
                  borderRadius: "2px",
                  fontFamily: "var(--font-inter), 'Inter', sans-serif",
                  fontSize: "15px",
                  fontWeight: 400,
                  color: "var(--tellian-dark)",
                  outline: "none",
                  transition: "border-color 300ms cubic-bezier(0.16, 1, 0.3, 1)",
                }}
                onFocus={(e) =>
                  (e.currentTarget.style.borderColor = "var(--tellian-dark)")
                }
                onBlur={(e) =>
                  (e.currentTarget.style.borderColor = "var(--tellian-line)")
                }
              />
            </div>

            {/* Password */}
            <div style={{ marginTop: "24px" }}>
              <label
                htmlFor="password"
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
                Passwort
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: "100%",
                  height: "48px",
                  padding: "0 16px",
                  backgroundColor: "#FFFFFF",
                  border: "1px solid var(--tellian-line)",
                  borderRadius: "2px",
                  fontFamily: "var(--font-inter), 'Inter', sans-serif",
                  fontSize: "15px",
                  fontWeight: 400,
                  color: "var(--tellian-dark)",
                  outline: "none",
                  transition: "border-color 300ms cubic-bezier(0.16, 1, 0.3, 1)",
                }}
                onFocus={(e) =>
                  (e.currentTarget.style.borderColor = "var(--tellian-dark)")
                }
                onBlur={(e) =>
                  (e.currentTarget.style.borderColor = "var(--tellian-line)")
                }
              />
            </div>

            {/* Error */}
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

            {/* 4. Submit */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                height: "56px",
                marginTop: "32px",
                backgroundColor: "var(--tellian-dark)",
                color: "#FFFFFF",
                border: "none",
                borderRadius: "2px",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.8 : 1,
                fontFamily: "var(--font-inter), 'Inter', sans-serif",
                fontSize: "14px",
                fontWeight: 500,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "10px",
                transition: "opacity 300ms cubic-bezier(0.16, 1, 0.3, 1)",
              }}
            >
              Anmelden
              {loading ? (
                <Loader2
                  size={16}
                  className="animate-spin"
                  style={{ color: "#FFFFFF" }}
                />
              ) : (
                <ArrowRight size={16} style={{ color: "#FFFFFF" }} />
              )}
            </button>
          </form>

          {/* 5. Forgot password */}
          <a
            href="#"
            style={{
              display: "inline-block",
              marginTop: "24px",
              fontFamily: "var(--font-inter), 'Inter', sans-serif",
              fontSize: "14px",
              fontWeight: 400,
              color: "var(--tellian-stone)",
              textDecoration: "none",
              transition: "text-decoration 200ms",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.textDecoration = "underline")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.textDecoration = "none")
            }
          >
            Passwort vergessen?
          </a>
        </div>

        {/* 6. Footer eyebrow */}
        <div
          className="absolute bottom-8 flex justify-center lg:justify-start"
          style={{ left: 0, right: 0, paddingLeft: "inherit", paddingRight: "inherit" }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
            }}
          >
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
            <span
              style={{
                fontFamily: "var(--font-inter), 'Inter', sans-serif",
                fontSize: "11px",
                fontWeight: 500,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: "var(--tellian-muted)",
                whiteSpace: "nowrap",
              }}
            >
              FINMA-lizenziert · Zürich
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
