"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Copy, KeyRound, Loader2, LogIn, Search, Shield, ShieldOff, UserPlus, X } from "lucide-react";
import { PortalLayout } from "@/components/PortalLayout";
import { ToastProvider, useToast } from "@/components/Toast";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

const ROLES = ["Admin", "User", "InternalEmployee"] as const;
type Role = (typeof ROLES)[number];

interface AdminUser {
  username: string;
  enabled: boolean;
  status: string;
  groups: string[];
  mfaEnabled: boolean;
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
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const isInternal = user?.groups.includes("InternalEmployee") ?? false;
  const canViewUsers = (user?.isAdmin ?? false) || isInternal;
  const canManageUsers = user?.isAdmin ?? false;
  const canImpersonateUsers = canManageUsers || isInternal;
  const showActionsColumn = canManageUsers || canImpersonateUsers;

  useEffect(() => {
    if (!loading && (!user || !canViewUsers)) {
      router.replace("/");
    }
  }, [user, loading, canViewUsers, router]);

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
    if (canViewUsers) void loadUsers();
  }, [canViewUsers, loadUsers]);

  const filteredUsers = users.filter((u) =>
    u.username.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const totalPages = Math.ceil(filteredUsers.length / pageSize);
  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  if (loading || !user || !canViewUsers) {
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

  async function handleResetPassword(u: AdminUser) {
    setError(null);
    setCreatedNotice(null);
    const res = await fetch("/api/admin/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: u.username }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      temporaryPassword?: string;
    };
    if (!res.ok) {
      setError(data.error ?? "Failed to reset password");
      return;
    }
    setCreatedNotice(
      `${t("admin.resetPassword.notice")} ${data.temporaryPassword} (${u.username})`,
    );
  }

  async function handleToggleMfa(u: AdminUser) {
    // Optimistic update
    setUsers(prev => prev.map(user => 
      user.username === u.username ? { ...user, mfaEnabled: !u.mfaEnabled } : user
    ));

    try {
      const res = await fetch("/api/admin/toggle-mfa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: u.username, mfaEnabled: !u.mfaEnabled }),
      });
      if (!res.ok) {
        // Rollback on error
        await loadUsers();
      } else {
        // Add a small delay before refreshing from backend to account for Cognito consistency
        setTimeout(() => loadUsers(), 1500);
      }
    } catch (e) {
      console.error("Failed to toggle MFA:", e);
      await loadUsers();
    }
  }

  return (
    <PortalLayout>
      <ToastProvider>
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
          {canManageUsers && (
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
          )}
        </div>

        <div style={{ marginTop: "48px", maxWidth: "400px", position: "relative" }}>
          <Search
            size={18}
            style={{
              position: "absolute",
              left: "0",
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--tellian-stone)",
            }}
          />
          <input
            type="text"
            placeholder={t("admin.search.placeholder") ?? "Search users..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: "100%",
              padding: "12px 12px 12px 32px",
              backgroundColor: "transparent",
              border: "none",
              borderBottom: "1px solid var(--tellian-line)",
              fontFamily: "var(--font-inter), 'Inter', sans-serif",
              fontSize: "14px",
              color: "var(--tellian-dark)",
              outline: "none",
            }}
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              style={{
                position: "absolute",
                right: "0",
                top: "50%",
                transform: "translateY(-50%)",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "var(--tellian-stone)",
                padding: "4px",
              }}
            >
              <X size={16} />
            </button>
          )}
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
          className="hidden md:grid md:items-center"
          style={{
            gridTemplateColumns: showActionsColumn
              ? "minmax(0, 2.2fr) 140px 110px 100px minmax(360px, 2.6fr)"
              : "minmax(0, 2.2fr) 140px 110px 100px",
            gap: "24px",
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
          <span style={headerCell}>{t("admin.col.username")}</span>
          <span style={headerCell}>{t("admin.col.role")}</span>
          <span style={headerCell}>{t("admin.col.status")}</span>
          <span style={headerCell}>{t("admin.col.mfa")}</span>
          {showActionsColumn && (
            <span style={headerCell}>{t("admin.col.actions")}</span>
          )}
        </div>

        {fetching ? (
          <div style={{ padding: "48px 0" }} className="flex justify-center">
            <Loader2 className="animate-spin" />
          </div>
        ) : filteredUsers.length === 0 ? (
          <p style={{ padding: "48px 0", color: "var(--tellian-stone)" }}>
            —
          </p>
        ) : (
          paginatedUsers.map((u) => (
            <UserRow
              key={u.username}
              user={u}
              onChangeRole={(role) => handleChangeRole(u.username, role)}
              onToggle={() => handleToggleEnabled(u)}
              onToggleMfa={() => handleToggleMfa(u)}
              onImpersonate={() => handleImpersonate(u)}
              onResetPassword={() => handleResetPassword(u)}
              isSelf={u.username === user.username}
              canManage={canManageUsers}
              canImpersonate={canImpersonateUsers}
              t={t}
            />
          ))
        )}
      </div>

      {totalPages > 1 && (
        <div
          className="flex items-center justify-between"
          style={{
            marginTop: "32px",
            paddingTop: "24px",
            fontFamily: "var(--font-inter), 'Inter', sans-serif",
          }}
        >
          <div style={{ fontSize: "13px", color: "var(--tellian-stone)" }}>
            {t("admin.pagination.info")
              ?.replace("{current}", currentPage.toString())
              ?.replace("{total}", totalPages.toString()) ||
              `Page ${currentPage} of ${totalPages}`}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "40px",
                height: "40px",
                border: "1px solid var(--tellian-line)",
                background: "transparent",
                color: "var(--tellian-dark)",
                cursor: currentPage === 1 ? "not-allowed" : "pointer",
                opacity: currentPage === 1 ? 0.3 : 1,
              }}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "40px",
                height: "40px",
                border: "1px solid var(--tellian-line)",
                background: "transparent",
                color: "var(--tellian-dark)",
                cursor: currentPage === totalPages ? "not-allowed" : "pointer",
                opacity: currentPage === totalPages ? 0.3 : 1,
              }}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}

      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            void loadUsers();
          }}
          t={t}
        />
      )}
      </ToastProvider>
    </PortalLayout>
  );
}

function UserRow({
  user,
  onChangeRole,
  onToggle,
  onToggleMfa,
  onImpersonate,
  onResetPassword,
  isSelf,
  canManage,
  canImpersonate,
  t,
}: {
  user: AdminUser;
  onChangeRole: (role: Role) => void;
  onToggle: () => void;
  onToggleMfa: () => void;
  onImpersonate: () => void;
  onResetPassword: () => void;
  isSelf: boolean;
  canManage: boolean;
  canImpersonate: boolean;
  t: (key: any) => string;
}) {
  const currentRole = (user.groups[0] ?? "User") as Role;
  const canImpersonateRow =
    canImpersonate && !isSelf && user.enabled && currentRole !== "Admin";
  const roleSelectDisabled = !canManage || isSelf;
  const showActions = canManage || canImpersonate;

  return (
    <div
      className="md:grid md:items-center"
      style={{
        gridTemplateColumns: showActions
          ? "minmax(0, 2.2fr) 140px 110px 100px minmax(360px, 2.6fr)"
          : "minmax(0, 2.2fr) 140px 110px 100px",
        padding: "16px 0",
        minHeight: "64px",
        borderBottom: "1px solid var(--tellian-line)",
        gap: "24px",
        fontFamily: "var(--font-inter), 'Inter', sans-serif",
      }}
    >
      <div
        style={{
          ...rowCell,
          fontSize: "15px",
          fontWeight: 400,
          color: "var(--tellian-dark)",
          overflow: "hidden",
        }}
        title={user.username}
      >
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            display: "block",
            width: "100%",
          }}
        >
          {user.username}
        </span>
      </div>

      <div
        style={{
          ...rowCell,
          fontSize: "13px",
          color: "var(--tellian-dark)",
        }}
      >
        {!canManage ? (
          <span>{currentRole}</span>
        ) : (
          <select
            value={currentRole}
            onChange={(e) => onChangeRole(e.target.value as Role)}
            disabled={roleSelectDisabled}
            style={{
              backgroundColor: "transparent",
              border: "none",
              padding: 0,
              margin: 0,
              fontFamily: "inherit",
              fontSize: "13px",
              lineHeight: 1.2,
              color: "var(--tellian-dark)",
              cursor: roleSelectDisabled ? "not-allowed" : "pointer",
              opacity: roleSelectDisabled ? 0.5 : 1,
            }}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        )}
      </div>

      <div
        style={{
          ...rowCell,
          fontSize: "13px",
          color: user.enabled ? "var(--tellian-dark)" : "var(--tellian-stone)",
        }}
      >
        {user.enabled ? t("admin.status.enabled") : t("admin.status.disabled")}
      </div>

      <div
        style={{
          ...rowCell,
          fontSize: "13px",
          color: user.mfaEnabled ? "#059669" : "var(--tellian-stone)",
          gap: "6px",
        }}
      >
        {user.mfaEnabled ? (
          <Shield size={14} style={{ color: "#059669" }} />
        ) : (
          <ShieldOff size={14} style={{ color: "var(--tellian-stone)" }} />
        )}
        {user.mfaEnabled ? t("admin.mfa.on") : t("admin.mfa.off")}
      </div>

      {showActions && (
        <div className="mt-3 md:mt-0 flex gap-2 whitespace-nowrap items-center" style={{ minWidth: 0 }}>
          {canManage && (
            <button
              onClick={onToggle}
              disabled={isSelf}
              style={{
                background: "transparent",
                border: "1px solid var(--tellian-line)",
                padding: "0 14px",
                height: "32px",
                fontFamily: "inherit",
                fontSize: "12px",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--tellian-dark)",
                cursor: isSelf ? "not-allowed" : "pointer",
                opacity: isSelf ? 0.5 : 1,
                display: "inline-flex",
                alignItems: "center",
                lineHeight: 1,
              }}
            >
              {user.enabled
                ? t("admin.action.disable")
                : t("admin.action.enable")}
            </button>
          )}
          {canManage && (
            <button
              onClick={onToggleMfa}
              disabled={isSelf}
              title={user.mfaEnabled ? t("admin.action.mfaDisable") : t("admin.action.mfaEnable")}
              style={{
                background: "transparent",
                border: "1px solid var(--tellian-line)",
                padding: "0 10px",
                height: "32px",
                fontFamily: "inherit",
                fontSize: "12px",
                color: user.mfaEnabled ? "#059669" : "var(--tellian-stone)",
                cursor: isSelf ? "not-allowed" : "pointer",
                opacity: isSelf ? 0.5 : 1,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                lineHeight: 1,
              }}
            >
              {user.mfaEnabled ? <Shield size={16} /> : <ShieldOff size={16} />}
            </button>
          )}
          {canManage && (
            <IconButton
              onClick={onResetPassword}
              disabled={isSelf}
              title={t("admin.action.resetPassword")}
            >
              <KeyRound size={14} />
            </IconButton>
          )}
          {canImpersonate && (
            <button
              onClick={onImpersonate}
              disabled={!canImpersonateRow}
              title={t("admin.action.impersonate")}
              style={{
                background: "transparent",
                border: "1px solid var(--tellian-line)",
                padding: "0 14px",
                height: "32px",
                fontFamily: "inherit",
                fontSize: "12px",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--tellian-dark)",
                cursor: canImpersonateRow ? "pointer" : "not-allowed",
                opacity: canImpersonateRow ? 1 : 0.4,
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                lineHeight: 1,
              }}
            >
              <LogIn size={12} />
              {t("admin.action.impersonate")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function IconButton({
  onClick,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      style={{
        background: "transparent",
        border: "1px solid var(--tellian-line)",
        padding: "8px",
        height: "32px",
        width: "32px",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--tellian-dark)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {children}
    </button>
  );
}

function CreateUserModal({
  onClose,
  onCreated,
  t,
}: {
  onClose: () => void;
  onCreated: () => void;
  t: (key: any) => string;
}) {
  const toast = useToast();
  const [customerId, setCustomerId] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("User");
  const [tempPassword, setTempPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    username: string;
    temporaryPassword: string;
    role: Role;
  } | null>(null);

  const isStaff = role === "Admin" || role === "InternalEmployee";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload: {
        role: Role;
        temporaryPassword?: string;
        email?: string;
        customerId?: string;
      } = {
        role,
        temporaryPassword: tempPassword || undefined,
      };
      if (isStaff) {
        payload.email = email.trim();
      } else {
        payload.customerId = customerId.trim();
      }

      const res = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        username?: string;
        temporaryPassword?: string;
      };
      if (!res.ok) {
        const message =
          data.error?.trim() || t("admin.toast.createFailed.fallback");
        setError(message);
        toast.error(message);
        setSubmitting(false);
        return;
      }

      toast.success(t("admin.toast.created.title"));
      setResult({
        username: data.username ?? "",
        temporaryPassword: data.temporaryPassword ?? "",
        role,
      });
      setSubmitting(false);
      onCreated();
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : t("admin.toast.createFailed.fallback");
      setError(message);
      toast.error(message);
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
            {result ? t("admin.toast.created.title") : t("admin.modal.title")}
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

        {result ? (
          <CreatedCredentials result={result} onDone={onClose} t={t} />
        ) : (
        <form onSubmit={handleSubmit}>
          <div>
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
          {isStaff ? (
            <div style={{ marginTop: "20px" }}>
              <label style={modalLabel}>{t("admin.modal.email")}</label>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={modalInput}
              />
            </div>
          ) : (
            <div style={{ marginTop: "20px" }}>
              <label style={modalLabel}>{t("admin.modal.customerId")}</label>
              <input
                required
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                style={modalInput}
              />
            </div>
          )}
          <div style={{ marginTop: "20px" }}>
            <label style={modalLabel}>{t("admin.modal.tempPassword")}</label>
            <input
              type="text"
              value={tempPassword}
              onChange={(e) => setTempPassword(e.target.value)}
              style={modalInput}
            />
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
        )}
      </div>
    </div>
  );
}

function CreatedCredentials({
  result,
  onDone,
  t,
}: {
  result: { username: string; temporaryPassword: string; role: Role };
  onDone: () => void;
  t: (key: string) => string;
}) {
  return (
    <div>
      <div>
        <label style={modalLabel}>{t("admin.modal.role")}</label>
        <div style={{ ...modalInput, borderColor: "var(--tellian-line)" }}>
          {result.role}
        </div>
      </div>
      <div style={{ marginTop: "20px" }}>
        <label style={modalLabel}>{t("admin.toast.usernameLabel")}</label>
        <CredentialField value={result.username} />
      </div>
      <div style={{ marginTop: "20px" }}>
        <label style={modalLabel}>{t("admin.modal.tempPassword")}</label>
        <CredentialField value={result.temporaryPassword} />
      </div>

      <div className="flex" style={{ marginTop: "32px" }}>
        <button
          type="button"
          onClick={onDone}
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
            cursor: "pointer",
          }}
        >
          {t("admin.modal.done")}
        </button>
      </div>
    </div>
  );
}

function CredentialField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked — value remains visible.
    }
  }

  return (
    <div style={{ display: "flex", gap: "8px", alignItems: "stretch" }}>
      <code
        style={{
          flex: 1,
          minWidth: 0,
          padding: "12px",
          border: "1px solid var(--tellian-line)",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: "14px",
          color: "var(--tellian-dark)",
          backgroundColor: "var(--tellian-bg)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          display: "flex",
          alignItems: "center",
        }}
        title={value}
      >
        {value}
      </code>
      <button
        type="button"
        onClick={handleCopy}
        aria-label="Copy"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          background: "transparent",
          border: "1px solid var(--tellian-line)",
          padding: "0 14px",
          fontFamily: "var(--font-inter), 'Inter', sans-serif",
          fontSize: "11px",
          fontWeight: 500,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--tellian-dark)",
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        <Copy size={12} />
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

const headerCell: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  minWidth: 0,
};

const rowCell: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  minWidth: 0,
};

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
