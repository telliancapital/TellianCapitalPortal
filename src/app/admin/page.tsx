"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn, Loader2, UserPlus, X } from "lucide-react";
import { PortalLayout } from "@/components/PortalLayout";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

const ROLES = ["Admin", "User", "InternalEmployee"] as const;
type Role = (typeof ROLES)[number];

interface AdminUser {
  username: string;
  enabled: boolean;
  status: string;
  groups: string[];
}

export default function AdminPage() {
  const { user, loading, refresh } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createdNotice, setCreatedNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && (!user || !user.isAdmin)) {
      router.replace("/");
    }
  }, [user, loading, router]);

  const loadUsers = useCallback(async () => {
    setFetching(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Failed to load");
        setUsers([]);
        return;
      }
      const data = (await res.json()) as { users: AdminUser[] };
      setUsers(data.users);
    } catch {
      setError("Failed to load");
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    if (user?.isAdmin) void loadUsers();
  }, [user, loadUsers]);

  if (loading || !user || !user.isAdmin) {
    return (
      <PortalLayout>
        <div style={{ padding: "96px 0" }} className="flex justify-center">
          <Loader2 className="animate-spin" />
        </div>
      </PortalLayout>
    );
  }

  async function handleChangeRole(username: string, newRole: Role) {
    const res = await fetch("/api/admin/change-role", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, newRole }),
    });
    if (res.ok) await loadUsers();
  }

  async function handleToggleEnabled(u: AdminUser) {
    const res = await fetch("/api/admin/disable-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: u.username, enabled: !u.enabled }),
    });
    if (res.ok) await loadUsers();
  }

  async function handleImpersonate(u: AdminUser) {
    setError(null);
    const res = await fetch("/api/admin/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: u.username }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "Failed to start impersonation");
      return;
    }
    await refresh();
    router.replace("/");
  }

  return (
    <PortalLayout>
      <div
        style={{
          paddingTop: "clamp(48px, 8vh, 96px)",
          paddingBottom: "clamp(32px, 5vh, 64px)",
        }}
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1
              style={{
                fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
                fontSize: "clamp(36px, 5vw, 56px)",
                fontWeight: 300,
                color: "var(--tellian-dark)",
                letterSpacing: "-0.02em",
                lineHeight: 1.1,
                margin: 0,
              }}
            >
              {t("admin.headline")}
            </h1>
            <p
              style={{
                fontFamily: "var(--font-inter), 'Inter', sans-serif",
                fontSize: "16px",
                color: "var(--tellian-stone)",
                marginTop: "12px",
                marginBottom: 0,
              }}
            >
              {t("admin.subtext")}
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            style={{
              backgroundColor: "var(--tellian-dark)",
              color: "#FFFFFF",
              border: "none",
              borderRadius: 0,
              padding: "14px 24px",
              fontFamily: "var(--font-inter), 'Inter', sans-serif",
              fontSize: "11px",
              fontWeight: 500,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <UserPlus size={16} />
            {t("admin.create")}
          </button>
        </div>
      </div>

      {createdNotice && (
        <div
          style={{
            marginBottom: "24px",
            padding: "16px",
            border: "1px solid var(--tellian-line)",
            fontFamily: "var(--font-inter), 'Inter', sans-serif",
            fontSize: "14px",
            color: "var(--tellian-dark)",
          }}
        >
          {createdNotice}
        </div>
      )}

      {error && (
        <p
          role="alert"
          style={{
            fontFamily: "var(--font-inter), 'Inter', sans-serif",
            color: "var(--tellian-charcoal)",
          }}
        >
          {error}
        </p>
      )}

      <div
        style={{
          borderTop: "1px solid var(--tellian-line)",
          borderBottom: "1px solid var(--tellian-line)",
        }}
      >
        <div
          className="hidden md:grid"
          style={{
            gridTemplateColumns: "2fr 1.5fr 1fr 1.5fr",
            padding: "16px 0",
            borderBottom: "1px solid var(--tellian-line)",
            fontFamily: "var(--font-inter), 'Inter', sans-serif",
            fontSize: "11px",
            fontWeight: 500,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--tellian-stone)",
          }}
        >
          <span>{t("admin.col.username")}</span>
          <span>{t("admin.col.role")}</span>
          <span>{t("admin.col.status")}</span>
          <span>{t("admin.col.actions")}</span>
        </div>

        {fetching ? (
          <div style={{ padding: "48px 0" }} className="flex justify-center">
            <Loader2 className="animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <p style={{ padding: "48px 0", color: "var(--tellian-stone)" }}>
            —
          </p>
        ) : (
          users.map((u) => (
            <UserRow
              key={u.username}
              user={u}
              onChangeRole={(role) => handleChangeRole(u.username, role)}
              onToggle={() => handleToggleEnabled(u)}
              onImpersonate={() => handleImpersonate(u)}
              isSelf={u.username === user.username}
              t={t}
            />
          ))
        )}
      </div>

      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={(message) => {
            setCreatedNotice(message);
            setShowCreate(false);
            void loadUsers();
          }}
          t={t}
        />
      )}
    </PortalLayout>
  );
}

function UserRow({
  user,
  onChangeRole,
  onToggle,
  onImpersonate,
  isSelf,
  t,
}: {
  user: AdminUser;
  onChangeRole: (role: Role) => void;
  onToggle: () => void;
  onImpersonate: () => void;
  isSelf: boolean;
  t: (key: any) => string;
}) {
  const currentRole = (user.groups[0] ?? "User") as Role;
  const canImpersonate =
    !isSelf && user.enabled && currentRole !== "Admin";

  return (
    <div
      className="md:grid md:items-center"
      style={{
        gridTemplateColumns: "2fr 1.5fr 1fr 1.5fr",
        padding: "20px 0",
        borderBottom: "1px solid var(--tellian-line)",
        gap: "16px",
        fontFamily: "var(--font-inter), 'Inter', sans-serif",
      }}
    >
      <div
        style={{
          fontSize: "15px",
          fontWeight: 400,
          color: "var(--tellian-dark)",
        }}
      >
        {user.username}
      </div>

      <div>
        <select
          value={currentRole}
          onChange={(e) => onChangeRole(e.target.value as Role)}
          disabled={isSelf}
          style={{
            backgroundColor: "transparent",
            border: "1px solid var(--tellian-line)",
            padding: "8px 12px",
            fontFamily: "inherit",
            fontSize: "13px",
            color: "var(--tellian-dark)",
            cursor: isSelf ? "not-allowed" : "pointer",
            opacity: isSelf ? 0.5 : 1,
          }}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      <div
        style={{
          fontSize: "13px",
          color: user.enabled ? "var(--tellian-dark)" : "var(--tellian-stone)",
        }}
      >
        {user.enabled ? t("admin.status.enabled") : t("admin.status.disabled")}
      </div>

      <div className="mt-3 md:mt-0 flex gap-2 whitespace-nowrap">
        <button
          onClick={onToggle}
          disabled={isSelf}
          style={{
            background: "transparent",
            border: "1px solid var(--tellian-line)",
            padding: "8px 16px",
            fontFamily: "inherit",
            fontSize: "12px",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--tellian-dark)",
            cursor: isSelf ? "not-allowed" : "pointer",
            opacity: isSelf ? 0.5 : 1,
          }}
        >
          {user.enabled ? t("admin.action.disable") : t("admin.action.enable")}
        </button>
        <button
          onClick={onImpersonate}
          disabled={!canImpersonate}
          title={t("admin.action.impersonate")}
          style={{
            background: "transparent",
            border: "1px solid var(--tellian-line)",
            padding: "8px 16px",
            fontFamily: "inherit",
            fontSize: "12px",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--tellian-dark)",
            cursor: canImpersonate ? "pointer" : "not-allowed",
            opacity: canImpersonate ? 1 : 0.4,
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <LogIn size={12} />
          {t("admin.action.impersonate")}
        </button>
      </div>
    </div>
  );
}

function CreateUserModal({
  onClose,
  onCreated,
  t,
}: {
  onClose: () => void;
  onCreated: (message: string) => void;
  t: (key: any) => string;
}) {
  const [customerId, setCustomerId] = useState("");
  const [role, setRole] = useState<Role>("User");
  const [tempPassword, setTempPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          role,
          temporaryPassword: tempPassword || undefined,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        username?: string;
        temporaryPassword?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Error");
        setSubmitting(false);
        return;
      }
      onCreated(
        `${t("admin.created")} ${data.temporaryPassword} (${data.username})`,
      );
    } catch {
      setError("Error");
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        zIndex: 50,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "var(--tellian-bg)",
          width: "100%",
          maxWidth: "480px",
          padding: "32px",
        }}
      >
        <div className="flex items-center justify-between" style={{ marginBottom: "24px" }}>
          <h2
            style={{
              fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
              fontSize: "28px",
              fontWeight: 400,
              color: "var(--tellian-dark)",
              margin: 0,
            }}
          >
            {t("admin.modal.title")}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--tellian-stone)",
            }}
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div>
            <label style={modalLabel}>{t("admin.modal.customerId")}</label>
            <input
              required
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              style={modalInput}
            />
          </div>
          <div style={{ marginTop: "20px" }}>
            <label style={modalLabel}>{t("admin.modal.role")}</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              style={modalInput}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div style={{ marginTop: "20px" }}>
            <label style={modalLabel}>{t("admin.modal.tempPassword")}</label>
            <input
              type="text"
              value={tempPassword}
              onChange={(e) => setTempPassword(e.target.value)}
              style={modalInput}
            />
            <p
              style={{
                marginTop: "6px",
                fontSize: "12px",
                color: "var(--tellian-muted)",
              }}
            >
              {t("admin.modal.tempPassword.hint")}
            </p>
          </div>

          {error && (
            <p
              role="alert"
              style={{
                marginTop: "16px",
                fontSize: "13px",
                color: "var(--tellian-charcoal)",
              }}
            >
              {error}
            </p>
          )}

          <div className="flex gap-3" style={{ marginTop: "32px" }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                height: "48px",
                background: "transparent",
                border: "1px solid var(--tellian-line)",
                color: "var(--tellian-dark)",
                fontFamily: "inherit",
                fontSize: "11px",
                fontWeight: 500,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              {t("admin.modal.cancel")}
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{
                flex: 1,
                height: "48px",
                backgroundColor: "var(--tellian-dark)",
                color: "#FFFFFF",
                border: "none",
                fontFamily: "inherit",
                fontSize: "11px",
                fontWeight: 500,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                cursor: submitting ? "not-allowed" : "pointer",
                opacity: submitting ? 0.7 : 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
              }}
            >
              {t("admin.modal.submit")}
              {submitting && <Loader2 size={14} className="animate-spin" />}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const modalLabel: React.CSSProperties = {
  display: "block",
  marginBottom: "8px",
  fontFamily: "var(--font-inter), 'Inter', sans-serif",
  fontSize: "13px",
  fontWeight: 500,
  letterSpacing: "0.05em",
  color: "var(--tellian-stone)",
};

const modalInput: React.CSSProperties = {
  width: "100%",
  backgroundColor: "transparent",
  border: "1px solid var(--tellian-line)",
  padding: "12px",
  fontFamily: "var(--font-inter), 'Inter', sans-serif",
  fontSize: "14px",
  color: "var(--tellian-dark)",
  outline: "none",
};
