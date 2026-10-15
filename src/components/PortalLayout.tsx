"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { LanguageToggle } from "@/components/LanguageToggle";
import { TellianLogo } from "@/components/TellianLogo";
import { C, sans } from "@/lib/tokens";
import { DURATION } from "@/lib/motion";

/* ═══════════════════════════════════════════════════════════
   PORTAL SHELL — impersonation banner + header.
   "client": wordmark logo, account menu (name → ID, sign out),
             content column capped at 1200px (design ClientDashboard).
   "admin":  square logo + section eyebrow, name, sign out
             (design AdminPage header).
   ═══════════════════════════════════════════════════════════ */

type Variant = "client" | "admin";

export function PortalLayout({
  children,
  variant = "client",
  sectionLabel,
}: {
  children: React.ReactNode;
  variant?: Variant;
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

  async function handleLogout() {
    await logout();
    router.push("/login");
  }

  const isImpersonating = Boolean(user?.impersonatedBy);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [user, loading, router]);

  if (loading) {
    return (
      <div
        className="flex-1 flex items-center justify-center min-h-screen"
        style={{ backgroundColor: C.bg }}
      >
        <span
          aria-hidden
          style={{
            width: 18,
            height: 18,
            border: `2px solid ${C.line}`,
            borderTopColor: C.dark,
            borderRadius: "50%",
            animation: "portal-spin 0.8s linear infinite",
          }}
        />
      </div>
    );
  }

  if (!user) return null;

  const displayName =
    [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username;

  return (
    <div className="flex-1 flex flex-col min-h-screen" style={{ backgroundColor: C.bg }}>
      {/* Banner and header stick together at the top. */}
      <div style={{ position: "sticky", top: 0, zIndex: 100 }}>
        {isImpersonating && (
          <div
            role="alert"
            aria-live="assertive"
            style={{
              backgroundColor: C.warning,
              color: "#ffffff",
              fontFamily: sans,
              fontSize: 13,
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 16,
              padding: "12px 24px",
              letterSpacing: "0.03em",
              flexWrap: "wrap",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden style={{ flexShrink: 0 }}>
              <path d="M12 9v4M12 17h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path
                d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
            <span>{t("impersonation.banner", { target: user.username })}</span>
            <button
              onClick={handleExitImpersonation}
              disabled={exiting}
              style={{
                fontFamily: sans,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "#ffffff",
                backgroundColor: "rgba(255,255,255,0.2)",
                border: "1px solid rgba(255,255,255,0.4)",
                borderRadius: 0,
                padding: "8px 16px",
                cursor: exiting ? "not-allowed" : "pointer",
                opacity: exiting ? 0.6 : 1,
                outline: "none",
                minHeight: 36,
              }}
            >
              {t("impersonation.exit")}
            </button>
          </div>
        )}

        {variant === "client" ? (
          <header style={{ borderBottom: `1px solid ${C.line}`, backgroundColor: C.bg }}>
            <div
              className="flex items-center justify-between px-5 py-3.5 md:px-[clamp(32px,4vw,64px)] md:py-[18px]"
              style={{ maxWidth: 1200, margin: "0 auto", boxSizing: "border-box" }}
            >
              <TellianLogo variant="wordmark" className="h-[26px] md:h-[35px]" />
              <div className="flex items-center gap-2 md:gap-4">
                <AccountMenu
                  displayName={displayName}
                  userId={user.username}
                  showLogout={!isImpersonating}
                  onLogout={handleLogout}
                />
                <div style={{ width: 1, height: 16, backgroundColor: C.line }} />
                <LanguageToggle size="dashboard" />
              </div>
            </div>
          </header>
        ) : (
          <header
            className="flex items-center justify-between px-5 md:px-[clamp(32px,4vw,64px)]"
            style={{
              paddingTop: 16,
              paddingBottom: 16,
              borderBottom: `1px solid ${C.line}`,
              backgroundColor: C.bg,
            }}
          >
            <div className="flex items-center gap-4 md:gap-6">
              <TellianLogo className="h-8 md:h-10" />
              {sectionLabel && (
                <span
                  className="hidden md:inline"
                  style={{
                    fontFamily: sans,
                    fontSize: 10,
                    fontWeight: 500,
                    letterSpacing: "0.22em",
                    textTransform: "uppercase",
                    color: C.stone,
                  }}
                >
                  {sectionLabel}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 md:gap-5">
              <span
                className="hidden md:inline"
                style={{ fontFamily: sans, fontSize: 12, color: C.stone }}
              >
                {displayName}
              </span>
              <button
                onClick={handleLogout}
                style={{
                  fontFamily: sans,
                  fontSize: 11,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: C.stone,
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: "8px 0",
                  outline: "none",
                  transition: `color ${DURATION.fast}ms ease`,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = C.dark)}
                onMouseLeave={(e) => (e.currentTarget.style.color = C.stone)}
              >
                {t("portal.logout")}
              </button>
              <div style={{ width: 1, height: 16, backgroundColor: C.line }} />
              <LanguageToggle />
            </div>
          </header>
        )}
      </div>

      <main className="flex-1 flex flex-col">{children}</main>
    </div>
  );
}

/* Account menu: name visible, ID and sign-out behind it. */
function AccountMenu({
  displayName,
  userId,
  showLogout,
  onLogout,
}: {
  displayName: string;
  userId: string;
  showLogout: boolean;
  onLogout: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("portal.nav.account")}
        className="tellian-portal-konto"
        style={{
          fontFamily: sans,
          fontSize: 13,
          color: C.dark,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 4px",
          minHeight: 44,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
        <span className="hidden md:inline">{displayName}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
          style={{
            transform: open ? "rotate(180deg)" : "none",
            transition: `transform ${DURATION.fast}ms ease`,
          }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 8px)",
            minWidth: 240,
            backgroundColor: C.bg,
            border: `1px solid ${C.line}`,
            borderRadius: 4,
            boxShadow: "0 12px 32px rgba(25, 23, 24, 0.10)",
            padding: 8,
            zIndex: 200,
          }}
        >
          <div style={{ padding: "10px 12px 12px", borderBottom: `1px solid ${C.line}` }}>
            <span style={{ fontFamily: sans, fontSize: 14, fontWeight: 600, color: C.dark, display: "block" }}>
              {displayName}
            </span>
            <span style={{ fontFamily: sans, fontSize: 12, color: C.stoneText, display: "block", marginTop: 4 }}>
              {t("portal.nav.clientId")} {userId}
            </span>
          </div>
          {showLogout && (
            <button
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
              className="tellian-portal-menupunkt"
              style={{
                fontFamily: sans,
                fontSize: 13,
                color: C.dark,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                width: "100%",
                textAlign: "left",
                padding: 12,
                marginTop: 4,
                borderRadius: 2,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              {t("portal.logout")}
            </button>
          )}
        </div>
      )}
      <style>{`
        .tellian-portal-konto:focus-visible,
        .tellian-portal-menupunkt:focus-visible { outline: 2px solid ${C.purple}; outline-offset: 2px; }
        .tellian-portal-menupunkt:hover { background-color: ${C.bgSecondary}; }
      `}</style>
    </div>
  );
}
