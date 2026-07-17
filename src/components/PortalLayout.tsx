"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { LanguageToggle } from "@/components/LanguageToggle";
import { TellianLogo } from "@/components/TellianLogo";

export function PortalLayout({
  children,
  sectionLabel,
}: {
  children: React.ReactNode;
  sectionLabel?: string;
}) {
  const { user, loading, logout, refresh } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [exiting, setExiting] = useState(false);

  async function handleExitImpersonation() {
    if (exiting) return;
    setExiting(true);
    try {
      const res = await fetch("/api/admin/exit-impersonation", {
        method: "POST",
      });
      if (res.ok) {
        await refresh();
        router.replace("/admin");
      }
    } finally {
      setExiting(false);
    }
  }

  const isImpersonating = Boolean(user?.impersonatedBy);
  const hasUserMgmtAccess = Boolean(
    user?.isAdmin || user?.groups.includes("InternalEmployee"),
  );
  const homeHref = hasUserMgmtAccess ? "/admin" : "/";

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  if (loading) {
    return (
      <div
        className="flex-1 flex items-center justify-center min-h-screen"
        style={{ backgroundColor: "var(--tellian-bg)" }}
      >
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div
      className="flex-1 flex flex-col min-h-screen"
      style={{ backgroundColor: "var(--tellian-bg)" }}
    >
      {isImpersonating && (
        <div
          className="flex items-center justify-between flex-wrap gap-3 shrink-0"
          style={{
            paddingLeft: "clamp(32px, 4vw, 64px)",
            paddingRight: "clamp(32px, 4vw, 64px)",
            paddingTop: "12px",
            paddingBottom: "12px",
            backgroundColor: "var(--tellian-dark)",
            color: "#FFFFFF",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-inter), 'Inter', sans-serif",
              fontSize: "13px",
              fontWeight: 400,
              letterSpacing: "0.02em",
            }}
          >
            {t("impersonation.banner", { target: user.username })}
          </span>
          <button
            onClick={handleExitImpersonation}
            disabled={exiting}
            style={{
              fontFamily: "var(--font-inter), 'Inter', sans-serif",
              fontSize: "11px",
              fontWeight: 500,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--tellian-dark)",
              backgroundColor: "#FFFFFF",
              border: "none",
              padding: "8px 16px",
              cursor: exiting ? "not-allowed" : "pointer",
              opacity: exiting ? 0.6 : 1,
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            {t("impersonation.exit")}
            {exiting && <Loader2 size={12} className="animate-spin" />}
          </button>
        </div>
      )}
      <header
        className="flex items-center justify-between shrink-0"
        style={{
          padding: "16px clamp(32px, 4vw, 64px)",
          borderBottom: "1px solid var(--tellian-line)",
          backgroundColor: "var(--tellian-bg)",
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}
      >
        <div className="flex items-center" style={{ gap: "clamp(16px, 2vw, 24px)" }}>
          <a href={homeHref} style={{ display: "inline-flex" }}>
            <TellianLogo style={{ height: "clamp(32px, 4vw, 40px)", width: "auto" }} />
          </a>
          {sectionLabel && (
            <span
              className="hidden sm:inline"
              style={{
                fontFamily: "var(--font-inter), 'Inter', sans-serif",
                fontSize: "10px",
                fontWeight: 500,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "var(--tellian-stone)",
              }}
            >
              {sectionLabel}
            </span>
          )}
        </div>
        <div className="flex items-center" style={{ gap: "clamp(12px, 2vw, 20px)" }}>
          {hasUserMgmtAccess && (
            <a
              href="/admin"
              className="hidden sm:inline"
              style={{
                fontFamily: "var(--font-inter), 'Inter', sans-serif",
                fontSize: "11px",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--tellian-stone)",
                textDecoration: "none",
                padding: "8px 0",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.color = "var(--tellian-dark)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.color = "var(--tellian-stone)")
              }
            >
              {t("portal.admin")}
            </a>
          )}
          <span
            className="hidden sm:inline"
            style={{
              fontFamily: "var(--font-inter), 'Inter', sans-serif",
              fontSize: "12px",
              color: "var(--tellian-stone)",
            }}
          >
            {user.username}
          </span>
          <button
            onClick={async () => {
              await logout();
              router.push("/login");
            }}
            style={{
              fontFamily: "var(--font-inter), 'Inter', sans-serif",
              fontSize: "11px",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--tellian-stone)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "8px 0",
              transition: "color 200ms cubic-bezier(0.16, 1, 0.3, 1)",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.color = "var(--tellian-dark)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.color = "var(--tellian-stone)")
            }
          >
            {t("portal.logout")}
          </button>
          <span
            aria-hidden
            style={{
              width: "1px",
              height: "16px",
              backgroundColor: "var(--tellian-line)",
              flexShrink: 0,
            }}
          />
          <LanguageToggle />
        </div>
      </header>

      <main
        className="flex-1"
        style={{
          paddingLeft: "clamp(32px, 4vw, 64px)",
          paddingRight: "clamp(32px, 4vw, 64px)",
        }}
      >
        {children}
      </main>
    </div>
  );
}
