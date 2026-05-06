"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { LanguageToggle } from "@/components/LanguageToggle";

export function PortalLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const { t } = useI18n();
  const router = useRouter();

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
      <header
        className="flex items-center justify-between shrink-0"
        style={{
          height: "68px",
          paddingLeft: "clamp(24px, 4vw, 48px)",
          paddingRight: "clamp(24px, 4vw, 48px)",
          borderBottom: "1px solid var(--tellian-line)",
        }}
      >
        <a
          href="/"
          style={{
            fontFamily: "var(--font-inter), 'Inter', sans-serif",
            fontSize: "14px",
            fontWeight: 500,
            letterSpacing: "0.3em",
            textTransform: "uppercase",
            color: "var(--tellian-dark)",
            userSelect: "none",
            textDecoration: "none",
          }}
        >
          Tellian Capital
        </a>
        <div className="flex items-center gap-6">
          {user.isAdmin && (
            <a
              href="/admin"
              style={{
                fontFamily: "var(--font-inter), 'Inter', sans-serif",
                fontSize: "13px",
                fontWeight: 400,
                color: "var(--tellian-stone)",
                textDecoration: "none",
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
            style={{
              fontFamily: "var(--font-inter), 'Inter', sans-serif",
              fontSize: "13px",
              color: "var(--tellian-muted)",
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
              fontSize: "13px",
              fontWeight: 400,
              color: "var(--tellian-stone)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: 0,
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
          <LanguageToggle />
        </div>
      </header>

      <main
        className="flex-1"
        style={{
          maxWidth: "1024px",
          width: "100%",
          margin: "0 auto",
          paddingLeft: "clamp(24px, 4vw, 48px)",
          paddingRight: "clamp(24px, 4vw, 48px)",
        }}
      >
        {children}
      </main>
    </div>
  );
}
