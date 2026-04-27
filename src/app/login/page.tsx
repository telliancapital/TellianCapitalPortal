"use client";

import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // TODO: replace with Supabase Auth when configured
    // const { error } = await supabase.auth.signInWithPassword({ email, password });
    // if (error) { setError(error.message); setLoading(false); return; }
    // router.push("/");

    // Placeholder — simulate auth delay
    await new Promise((r) => setTimeout(r, 800));
    setError("Supabase ist noch nicht konfiguriert. Bitte .env.local einrichten.");
    setLoading(false);
  }

  return (
    <div className="flex-1 flex items-center justify-center px-5">
      <div className="w-full max-w-[360px]">
        {/* Logo */}
        <h1
          className="text-center mb-12"
          style={{
            fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
            fontSize: "28px",
            fontWeight: 400,
            letterSpacing: "-0.02em",
            color: "var(--tellian-dark)",
          }}
        >
          Tellian Capital
        </h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          {/* Email */}
          <div>
            <label
              htmlFor="email"
              className="block text-[11px] uppercase tracking-[0.16em] mb-2"
              style={{ color: "var(--tellian-stone)" }}
            >
              E-Mail
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-transparent outline-none transition-colors duration-300"
              style={{
                borderBottom: `1px solid var(--tellian-line)`,
                padding: "10px 0",
                fontSize: "14px",
                color: "var(--tellian-dark)",
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
          <div>
            <label
              htmlFor="password"
              className="block text-[11px] uppercase tracking-[0.16em] mb-2"
              style={{ color: "var(--tellian-stone)" }}
            >
              Passwort
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-transparent outline-none transition-colors duration-300"
              style={{
                borderBottom: `1px solid var(--tellian-line)`,
                padding: "10px 0",
                fontSize: "14px",
                color: "var(--tellian-dark)",
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
              className="text-[13px]"
              style={{ color: "var(--tellian-error)" }}
              role="alert"
            >
              {error}
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full uppercase tracking-[0.18em] transition-colors duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: "var(--tellian-dark)",
              color: "#FFFFFF",
              fontSize: "11px",
              padding: "16px",
              border: "none",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Wird geladen..." : "Anmelden"}
          </button>
        </form>

        {/* Footer hint */}
        <p
          className="text-center mt-8 text-[11px]"
          style={{ color: "var(--tellian-muted)" }}
        >
          Probleme beim Anmelden?{" "}
          <a
            href="mailto:info@telliancapital.ch"
            className="underline underline-offset-2 transition-colors duration-300"
            style={{ color: "var(--tellian-stone)" }}
          >
            Support kontaktieren
          </a>
        </p>
      </div>
    </div>
  );
}
