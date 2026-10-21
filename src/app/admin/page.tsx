"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PortalLayout } from "@/components/PortalLayout";
import { ToastProvider, useToast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { FloatingField } from "@/components/FloatingField";
import { ProfileImageUpload } from "@/components/ProfileImageUpload";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { C, sans, serif, selectChevron } from "@/lib/tokens";
import { DURATION } from "@/lib/motion";
import type { ActivationState } from "@/lib/activation";

/* ═══════════════════════════════════════════════════════════
   ADMIN PAGE — Benutzerverwaltung
   Layout mirrors the design portal AdminPage; all actions go
   through the existing /api/admin/* routes (Cognito).
   ═══════════════════════════════════════════════════════════ */

const ROLES = ["Admin", "User", "InternalEmployee"] as const;
type Role = (typeof ROLES)[number];
type T = ReturnType<typeof useI18n>["t"];

interface AdminUser {
  username: string;
  enabled: boolean;
  status: string;
  groups: string[];
  mfaEnabled: boolean;
  firstName?: string;
  lastName?: string;
  email?: string;
  phoneNumber?: string;
  profileImageKey?: string;
  street?: string;
  city?: string;
  zipCode?: string;
  assignedRm?: string;
  createdAt?: string;
  activation?: ActivationState | null;
}

type ConfirmAction =
  | { type: "deactivate"; user: AdminUser }
  | { type: "activate"; user: AdminUser }
  | { type: "resetPassword"; user: AdminUser }
  | { type: "resendActivation"; user: AdminUser }
  | { type: "impersonate"; user: AdminUser };

type AccountStatus = "active" | "pending" | "inactive";

/* Activation link result (create / resend) — shown once in a dialog. */
interface ActivationResult {
  username: string;
  email: string;
  link: string | null;
  emailStatus: "SENT" | "FAILED" | "NOT_SENT";
  ttlHours: number;
}

function formatDateTime(iso: string | null | undefined, locale: string): string {
  if (!iso) return "—";
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "—";
  return new Date(ts).toLocaleString(locale === "de" ? "de-CH" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getDisplayName(u: AdminUser): string {
  const full = [u.firstName, u.lastName].filter(Boolean).join(" ");
  return full || "—";
}

function getRole(u: AdminUser): Role {
  return (u.groups[0] ?? "User") as Role;
}

function getDisplayId(u: AdminUser): string {
  const role = getRole(u);
  if (role === "Admin" || role === "InternalEmployee") {
    return u.email ?? "—";
  }
  return u.username;
}

/* Cognito: disabled → inactive; FORCE_CHANGE_PASSWORD (temporary
   password not yet replaced) → pending; otherwise active. */
function getAccountStatus(u: AdminUser): AccountStatus {
  if (!u.enabled) return "inactive";
  if (u.status === "FORCE_CHANGE_PASSWORD") return "pending";
  return "active";
}

function roleLabel(role: Role, t: T): string {
  switch (role) {
    case "Admin":
      return t("admin.role.Admin");
    case "InternalEmployee":
      return t("admin.role.InternalEmployee");
    default:
      return t("admin.role.User");
  }
}

/* Temporary password generated in the browser (design: shown with copy /
   regenerate) and sent to /api/admin/create-user. Guarantees every class
   the Cognito policy expects. */
function generateTempPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%";
  const all = upper + lower + digits + symbols;
  const bytes = new Uint8Array(14);
  crypto.getRandomValues(bytes);
  const required = [
    upper[bytes[0] % upper.length],
    lower[bytes[1] % lower.length],
    digits[bytes[2] % digits.length],
    symbols[bytes[3] % symbols.length],
  ];
  const rest = Array.from(bytes.slice(4), (b) => all[b % all.length]);
  return [...required, ...rest].join("");
}

const selectStyle: React.CSSProperties = {
  fontFamily: sans,
  fontSize: 13,
  color: C.dark,
  backgroundColor: "transparent",
  border: `1px solid ${C.line}`,
  borderRadius: 2,
  padding: "6px 28px 6px 8px",
  cursor: "pointer",
  outline: "none",
  appearance: "none",
  minHeight: 36,
  backgroundImage: selectChevron(),
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 8px center",
};

const labelStyle: React.CSSProperties = {
  fontFamily: sans,
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: C.stone,
  display: "block",
  marginBottom: 6,
};

const modalSelectStyle: React.CSSProperties = {
  fontFamily: sans,
  fontSize: 14,
  color: C.dark,
  backgroundColor: "transparent",
  border: `1px solid ${C.line}`,
  borderRadius: 2,
  padding: "10px 32px 10px 12px",
  width: "100%",
  outline: "none",
  appearance: "none",
  cursor: "pointer",
  height: 48,
  backgroundImage: selectChevron(),
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 12px center",
};

function actionBtnStyle(disabled = false): React.CSSProperties {
  return {
    fontFamily: sans,
    fontSize: 11,
    letterSpacing: "0.06em",
    color: disabled ? C.line : C.stone,
    background: "transparent",
    border: "none",
    cursor: disabled ? "not-allowed" : "pointer",
    padding: "6px 8px",
    outline: "none",
    whiteSpace: "nowrap",
    minHeight: 32,
    transition: `color ${DURATION.fast}ms ease`,
    opacity: disabled ? 0.5 : 1,
  };
}

const dialogStyle: React.CSSProperties = {
  position: "fixed",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  zIndex: 10001,
  backgroundColor: C.bg,
  border: `1px solid ${C.line}`,
  borderRadius: 8,
  boxShadow: "0 20px 60px rgba(0,0,0,0.12)",
};

const backdropStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 10000,
  backgroundColor: "rgba(0,0,0,0.25)",
};

const mushroomBtn = (busy = false): React.CSSProperties => ({
  fontFamily: sans,
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: C.dark,
  backgroundColor: busy ? C.line : C.button,
  border: `1px solid ${busy ? C.line : C.button}`,
  borderRadius: 0,
  padding: "12px 20px",
  cursor: busy ? "not-allowed" : "pointer",
  outline: "none",
  minHeight: 44,
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  transition: `background-color ${DURATION.fast}ms ease`,
});

const ghostBtn: React.CSSProperties = {
  fontFamily: sans,
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: C.stone,
  backgroundColor: "transparent",
  border: `1px solid ${C.line}`,
  borderRadius: 0,
  padding: "12px 20px",
  cursor: "pointer",
  outline: "none",
  minHeight: 44,
};

export default function AdminPage() {
  const { t } = useI18n();
  return (
    <PortalLayout variant="admin" sectionLabel={t("portal.nav.userManagement")}>
      <ToastProvider>
        <AdminContent />
      </ToastProvider>
    </PortalLayout>
  );
}

function AdminContent() {
  const { user, loading, refresh } = useAuth();
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<Role[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  /* Generated password shown once after a reset — dialog with copy button */
  const [resetPwResult, setResetPwResult] = useState<{ username: string; tempPw: string } | null>(null);
  /* New activation link after a resend — dialog with copy button */
  const [activationResult, setActivationResult] = useState<ActivationResult | null>(null);
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
      const sorted = [...data.users].sort((a, b) => {
        const bTime = b.createdAt ? Date.parse(b.createdAt) : 0;
        const aTime = a.createdAt ? Date.parse(a.createdAt) : 0;
        return bTime - aTime;
      });
      setUsers(sorted);
    } catch {
      setError("Failed to load");
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    if (canViewUsers) void loadUsers();
  }, [canViewUsers, loadUsers]);

  const filteredUsers = users.filter((u) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      u.username.toLowerCase().includes(term) ||
      getDisplayName(u).toLowerCase().includes(term) ||
      (u.email ?? "").toLowerCase().includes(term);
    const matchesRole =
      selectedRoles.length === 0 || selectedRoles.includes(getRole(u));
    return matchesSearch && matchesRole;
  });

  const totalPages = Math.ceil(filteredUsers.length / pageSize);
  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedRoles]);

  async function handleChangeRole(u: AdminUser, newRole: Role) {
    const res = await fetch("/api/admin/change-role", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: u.username, newRole }),
    });
    if (res.ok) {
      toast.success(t("admin.toast.roleChanged", { id: getDisplayId(u), role: roleLabel(newRole, t) }));
      await loadUsers();
    } else {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(data.error ?? "Failed to change role");
    }
  }

  async function handleToggleEnabled(u: AdminUser) {
    const res = await fetch("/api/admin/disable-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: u.username, enabled: !u.enabled }),
    });
    if (res.ok) {
      toast.success(
        u.enabled
          ? t("admin.toast.deactivated", { id: getDisplayId(u) })
          : t("admin.toast.activated", { id: getDisplayId(u) }),
      );
      await loadUsers();
    } else {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(data.error ?? "Failed to update user");
    }
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
      toast.error(data.error ?? "Failed to start impersonation");
      return;
    }
    await refresh();
    router.replace("/");
  }

  async function handleResetPassword(u: AdminUser) {
    setError(null);
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
      toast.error(data.error ?? "Failed to reset password");
      return;
    }
    setResetPwResult({ username: u.username, tempPw: data.temporaryPassword ?? "" });
    void loadUsers();
  }

  async function handleResendActivation(u: AdminUser) {
    setError(null);
    const res = await fetch("/api/admin/resend-activation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: u.username }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      email?: string;
      activationLink?: string | null;
      activationEmail?: ActivationResult["emailStatus"];
      ttlHours?: number;
    };
    if (!res.ok) {
      toast.error(data.error ?? "Failed to resend activation link");
      return;
    }
    toast.success(t("admin.toast.resent", { id: getDisplayId(u) }));
    setActivationResult({
      username: u.username,
      email: data.email ?? u.email ?? "",
      link: data.activationLink ?? null,
      emailStatus: data.activationEmail ?? "NOT_SENT",
      ttlHours: data.ttlHours ?? 48,
    });
    void loadUsers();
  }

  async function handleToggleMfa(u: AdminUser) {
    // Optimistic update
    setUsers((prev) =>
      prev.map((x) => (x.username === u.username ? { ...x, mfaEnabled: !u.mfaEnabled } : x)),
    );
    try {
      const res = await fetch("/api/admin/toggle-mfa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: u.username, mfaEnabled: !u.mfaEnabled }),
      });
      if (!res.ok) {
        // Rollback on error
        await loadUsers();
        toast.error("Failed to update MFA");
      } else {
        toast.success(
          u.mfaEnabled
            ? t("admin.toast.mfaDisabled", { id: getDisplayId(u) })
            : t("admin.toast.mfaEnabled", { id: getDisplayId(u) }),
        );
        // Small delay before refreshing to account for Cognito consistency
        setTimeout(() => loadUsers(), 1500);
      }
    } catch (e) {
      console.error("Failed to toggle MFA:", e);
      await loadUsers();
    }
  }

  async function handleConfirm() {
    if (!confirm) return;
    const { type, user: target } = confirm;
    setConfirmBusy(true);
    try {
      if (type === "deactivate" || type === "activate") await handleToggleEnabled(target);
      else if (type === "resetPassword") await handleResetPassword(target);
      else if (type === "resendActivation") await handleResendActivation(target);
      else if (type === "impersonate") await handleImpersonate(target);
    } finally {
      setConfirmBusy(false);
      setConfirm(null);
    }
  }

  const confirmTitle = confirm
    ? confirm.type === "deactivate"
      ? t("admin.confirm.deactivateTitle")
      : confirm.type === "activate"
        ? t("admin.confirm.activateTitle")
        : confirm.type === "resetPassword"
          ? t("admin.confirm.resetTitle")
          : confirm.type === "resendActivation"
            ? t("admin.confirm.resendTitle")
            : t("admin.confirm.impersonateTitle")
    : "";
  const confirmBody = confirm
    ? confirm.type === "deactivate"
      ? t("admin.confirm.deactivateBody", { id: getDisplayId(confirm.user) })
      : confirm.type === "activate"
        ? t("admin.confirm.activateBody", { id: getDisplayId(confirm.user) })
        : confirm.type === "resetPassword"
          ? t("admin.confirm.resetBody", { id: getDisplayId(confirm.user) })
          : confirm.type === "resendActivation"
            ? t("admin.confirm.resendBody", { id: getDisplayId(confirm.user) })
            : t("admin.confirm.impersonateBody", { id: getDisplayId(confirm.user) })
    : "";

  if (loading || !user || !canViewUsers) {
    return (
      <div style={{ padding: "96px 0", textAlign: "center" }}>
        <span style={{ fontFamily: sans, fontSize: 14, color: C.stone, fontStyle: "italic" }}>
          {t("admin.table.loading")}
        </span>
      </div>
    );
  }

  const rowProps = (u: AdminUser) => {
    const role = getRole(u);
    const isSelf = u.username === user.username;
    return {
      user: u,
      role,
      isSelf,
      canManage: canManageUsers,
      canImpersonate: canImpersonateUsers,
      canImpersonateRow: canImpersonateUsers && !isSelf && u.enabled && role !== "Admin",
      canResendRow:
        canManageUsers && role === "User" && u.enabled && u.activation?.stage !== "completed",
      onEdit: () => setEditingUser(u),
      onToggle: () => setConfirm({ type: u.enabled ? "deactivate" : "activate", user: u }),
      onToggleMfa: () => handleToggleMfa(u),
      onResetPw: () => setConfirm({ type: "resetPassword", user: u }),
      onResend: () => setConfirm({ type: "resendActivation", user: u }),
      onImpersonate: () => setConfirm({ type: "impersonate", user: u }),
      onChangeRole: (r: Role) => handleChangeRole(u, r),
      t,
    };
  };

  return (
    <>
      {/* ── TITLE AREA ── */}
      <div className="flex flex-wrap items-start md:items-end justify-between gap-4 px-5 pt-8 pb-6 md:px-[clamp(32px,4vw,64px)] md:pt-12 md:pb-8">
        <div>
          <h1
            className="text-[clamp(24px,7vw,32px)] md:text-[clamp(32px,3vw,40px)]"
            style={{
              fontFamily: serif,
              lineHeight: 1.1,
              color: C.dark,
              letterSpacing: "-0.02em",
              fontWeight: 400,
              margin: 0,
            }}
          >
            <em style={{ fontStyle: "italic", fontWeight: 400 }}>{t("admin.headline")}</em>
          </h1>
          <p style={{ fontFamily: sans, fontSize: 14, color: C.stone, margin: "8px 0 0 0", lineHeight: 1.5 }}>
            {t("admin.subtext")}
          </p>
        </div>
        {canManageUsers && (
          <button
            onClick={() => setShowCreate(true)}
            style={{
              fontFamily: sans,
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: C.dark,
              backgroundColor: C.button,
              border: `1px solid ${C.button}`,
              borderRadius: 0,
              padding: "14px 24px",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              minHeight: 48,
              outline: "none",
              flexShrink: 0,
              transition: `background-color ${DURATION.fast}ms ease`,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = C.buttonHover)}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = C.button)}
          >
            <span aria-hidden>+</span>
            <span>{t("admin.create")}</span>
          </button>
        )}
      </div>

      {/* ── SEARCH + ROLE FILTER ── */}
      <div className="flex flex-wrap items-end gap-6 px-5 pb-6 md:px-[clamp(32px,4vw,64px)]">
        <div style={{ position: "relative", maxWidth: 400, flex: "1 1 280px" }}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
            style={{
              position: "absolute",
              left: 0,
              top: "50%",
              transform: "translateY(-50%)",
              color: C.stone,
              pointerEvents: "none",
            }}
          >
            <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.5" />
            <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t("admin.search.placeholder")}
            aria-label={t("admin.search.placeholder")}
            style={{
              fontFamily: sans,
              fontSize: 14,
              color: C.dark,
              backgroundColor: "transparent",
              border: "none",
              borderBottom: `1.5px solid ${C.line}`,
              borderRadius: 0,
              padding: "10px 0 10px 28px",
              outline: "none",
              width: "100%",
              transition: `border-color ${DURATION.fast}ms ease`,
            }}
            onFocus={(e) => (e.currentTarget.style.borderBottomColor = C.dark)}
            onBlur={(e) => (e.currentTarget.style.borderBottomColor = C.line)}
          />
        </div>
        <RoleFilterDropdown selectedRoles={selectedRoles} onChange={setSelectedRoles} t={t} />
      </div>

      {/* ── TABLE / CARDS — loading, error, empty, loaded ── */}
      <div className="px-5 pb-12 md:px-[clamp(32px,4vw,64px)]">
        {fetching && (
          <div style={{ padding: "64px 0", textAlign: "center" }}>
            <span style={{ fontFamily: sans, fontSize: 14, color: C.stone, fontStyle: "italic" }}>
              {t("admin.table.loading")}
            </span>
          </div>
        )}

        {!fetching && error && (
          <div
            role="alert"
            style={{
              padding: "48px 24px",
              textAlign: "center",
              backgroundColor: C.errorBg,
              border: `1px solid ${C.error}`,
              borderRadius: 4,
            }}
          >
            <span style={{ fontFamily: sans, fontSize: 14, color: C.error }}>
              {t("admin.table.error")} {error}
            </span>
          </div>
        )}

        {!fetching && !error && filteredUsers.length === 0 && (
          <div style={{ padding: "64px 0", textAlign: "center" }}>
            <span style={{ fontFamily: sans, fontSize: 14, color: C.stone, fontStyle: "italic" }}>
              {t("admin.table.empty")}
            </span>
          </div>
        )}

        {!fetching && !error && filteredUsers.length > 0 && (
          <>
            {/* MOBILE / TABLET (<1024): cards */}
            <div className="flex flex-col gap-4 lg:hidden">
              {paginatedUsers.map((u) => (
                <UserCard key={u.username} {...rowProps(u)} showActions={showActionsColumn} />
              ))}
            </div>

            {/* DESKTOP: table */}
            <div className="hidden lg:block" style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
                <thead>
                  <tr style={{ borderBottom: `1.5px solid ${C.dark}` }}>
                    {[
                      t("admin.col.id"),
                      t("admin.col.role"),
                      t("admin.col.status"),
                      t("admin.col.mfa"),
                      t("admin.col.activation"),
                      ...(showActionsColumn ? [t("admin.col.actions")] : []),
                    ].map((col, i) => (
                      <th
                        key={i}
                        scope="col"
                        style={{
                          fontFamily: sans,
                          fontSize: 10,
                          fontWeight: 600,
                          letterSpacing: "0.2em",
                          textTransform: "uppercase",
                          color: C.stone,
                          textAlign: "left",
                          padding: "12px 16px 12px 0",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedUsers.map((u) => (
                    <UserTableRow key={u.username} {...rowProps(u)} showActions={showActionsColumn} />
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div
                className="flex items-center justify-between"
                style={{ marginTop: 32, paddingTop: 24, fontFamily: sans }}
              >
                <div style={{ fontSize: 13, color: C.stone }}>
                  {t("admin.pagination.info", { current: currentPage, total: totalPages })}
                </div>
                <div className="flex gap-2">
                  <PageButton
                    label="Previous page"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    direction="prev"
                  />
                  <PageButton
                    label="Next page"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    direction="next"
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── CONFIRM DIALOG ── */}
      <ConfirmDialog
        open={confirm !== null}
        title={confirmTitle}
        body={confirmBody}
        destructive={confirm?.type === "deactivate"}
        busy={confirmBusy}
        onConfirm={handleConfirm}
        onCancel={() => {
          if (!confirmBusy) setConfirm(null);
        }}
      />

      {/* ── CREATE / EDIT USER MODAL ── */}
      {(showCreate || editingUser) && (
        <CreateUserModal
          editUser={editingUser}
          onClose={() => {
            setShowCreate(false);
            setEditingUser(null);
          }}
          onCreated={() => {
            setCurrentPage(1);
            void loadUsers();
          }}
          onUpdated={() => {
            void loadUsers();
          }}
          t={t}
          users={users}
        />
      )}

      {/* ── PASSWORD RESET RESULT — shown once, lives only in this dialog ── */}
      {resetPwResult && (
        <CredentialsDialog
          title={t("admin.resetPassword.notice")}
          body={t("admin.resetPassword.body", { id: resetPwResult.username })}
          fields={[{ label: t("admin.modal.tempPassword"), value: resetPwResult.tempPw }]}
          onClose={() => setResetPwResult(null)}
          t={t}
        />
      )}

      {/* ── RESENT ACTIVATION LINK — shown once ── */}
      {activationResult && (
        <ActivationLinkDialog
          title={t("admin.resend.headline")}
          result={activationResult}
          onClose={() => setActivationResult(null)}
          t={t}
        />
      )}
    </>
  );
}

/* Create/resend result: the link is the credential here. Emailed or not,
   the admin can always copy it. */
function ActivationLinkDialog({
  title,
  result,
  onClose,
  t,
}: {
  title: string;
  result: ActivationResult;
  onClose: () => void;
  t: T;
}) {
  const vars = { id: result.username, email: result.email, hours: result.ttlHours };
  return (
    <CredentialsDialog
      title={title}
      body={
        result.emailStatus === "SENT"
          ? t("admin.created.customerBody", vars)
          : t("admin.created.customerBodyNotSent", vars)
      }
      fields={result.link ? [{ label: t("admin.activation.linkLabel"), value: result.link }] : []}
      onClose={onClose}
      t={t}
    />
  );
}

/* ═══════════════════════════════════════════════════════════
   ROW COMPONENTS (desktop table row + mobile card)
   ═══════════════════════════════════════════════════════════ */

interface RowProps {
  user: AdminUser;
  role: Role;
  isSelf: boolean;
  canManage: boolean;
  canImpersonate: boolean;
  canImpersonateRow: boolean;
  canResendRow: boolean;
  showActions: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onToggleMfa: () => void;
  onResetPw: () => void;
  onResend: () => void;
  onImpersonate: () => void;
  onChangeRole: (r: Role) => void;
  t: T;
}

function RoleCell({ user, role, canManage, isSelf, onChangeRole, t }: RowProps) {
  if (!canManage) {
    return <span style={{ fontFamily: sans, fontSize: 13, color: C.dark }}>{roleLabel(role, t)}</span>;
  }
  const disabled = isSelf;
  return (
    <select
      value={role}
      onChange={(e) => onChangeRole(e.target.value as Role)}
      disabled={disabled}
      aria-label={`${t("admin.col.role")}: ${getDisplayId(user)}`}
      style={{
        ...selectStyle,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {roleLabel(r, t)}
        </option>
      ))}
    </select>
  );
}

function UserTableRow(props: RowProps) {
  const { user, showActions } = props;
  const td: React.CSSProperties = { padding: "14px 16px 14px 0", verticalAlign: "middle" };
  return (
    <tr style={{ borderBottom: `1px solid ${C.line}` }}>
      <td style={td}>
        <span style={{ fontFamily: sans, fontSize: 13, fontWeight: 500, color: C.dark, display: "block" }}>
          {getDisplayId(user)}
        </span>
        <span style={{ fontFamily: sans, fontSize: 12, color: C.stone, display: "block", marginTop: 2 }}>
          {getDisplayName(user)}
        </span>
      </td>
      <td style={td}>
        <RoleCell {...props} />
      </td>
      <td style={td}>
        <StatusBadge user={user} t={props.t} />
      </td>
      <td style={td}>
        <MfaBadge user={user} t={props.t} />
      </td>
      <td style={td}>
        <ActivationCell user={user} role={props.role} t={props.t} />
      </td>
      {showActions && (
        <td style={{ padding: "14px 0", verticalAlign: "middle" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            <ActionButtons {...props} />
          </div>
        </td>
      )}
    </tr>
  );
}

function UserCard(props: RowProps) {
  const { user, showActions, t } = props;
  const metaLabel: React.CSSProperties = {
    fontFamily: sans,
    fontSize: 10,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    color: C.stone,
    display: "block",
    marginBottom: 4,
  };
  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 6, padding: 20, backgroundColor: C.bg }}>
      <div style={{ marginBottom: 12 }}>
        <span style={{ fontFamily: sans, fontSize: 14, fontWeight: 600, color: C.dark, display: "block" }}>
          {getDisplayId(user)}
        </span>
        <span style={{ fontFamily: sans, fontSize: 13, color: C.stone, display: "block", marginTop: 2 }}>
          {getDisplayName(user)}
        </span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 20px", marginBottom: showActions ? 16 : 0 }}>
        <div>
          <span style={metaLabel}>{t("admin.col.role")}</span>
          <RoleCell {...props} />
        </div>
        <div>
          <span style={metaLabel}>{t("admin.col.status")}</span>
          <StatusBadge user={user} t={t} />
        </div>
        <div>
          <span style={metaLabel}>{t("admin.col.mfa")}</span>
          <MfaBadge user={user} t={t} />
        </div>
        <div>
          <span style={metaLabel}>{t("admin.col.activation")}</span>
          <ActivationCell user={user} role={props.role} t={t} />
        </div>
      </div>
      {showActions && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, borderTop: `1px solid ${C.line}`, paddingTop: 12 }}>
          <ActionButtons {...props} />
        </div>
      )}
    </div>
  );
}

function ActionButtons({
  user,
  isSelf,
  canManage,
  canImpersonate,
  canImpersonateRow,
  canResendRow,
  onEdit,
  onToggle,
  onToggleMfa,
  onResetPw,
  onResend,
  onImpersonate,
  t,
}: RowProps) {
  const id = getDisplayId(user);
  return (
    <>
      {canManage && (
        <button onClick={onEdit} style={actionBtnStyle()} aria-label={`${t("admin.action.edit")}: ${id}`}>
          {t("admin.action.edit")}
        </button>
      )}
      {canResendRow && (
        <button
          onClick={onResend}
          style={actionBtnStyle()}
          aria-label={`${t("admin.action.resendActivation")}: ${id}`}
        >
          {t("admin.action.resendActivation")}
        </button>
      )}
      {canManage && (
        <button
          onClick={onToggle}
          disabled={isSelf}
          style={actionBtnStyle(isSelf)}
          aria-label={`${user.enabled ? t("admin.action.disable") : t("admin.action.enable")}: ${id}`}
        >
          {user.enabled ? t("admin.action.disable") : t("admin.action.enable")}
        </button>
      )}
      {canManage && (
        <button
          onClick={onToggleMfa}
          disabled={isSelf}
          style={actionBtnStyle(isSelf)}
          aria-label={`${user.mfaEnabled ? t("admin.action.mfaDisable") : t("admin.action.mfaEnable")}: ${id}`}
        >
          {user.mfaEnabled ? t("admin.action.mfaDisable") : t("admin.action.mfaEnable")}
        </button>
      )}
      {canManage && (
        <button
          onClick={onResetPw}
          disabled={isSelf || !user.enabled}
          style={actionBtnStyle(isSelf || !user.enabled)}
          aria-label={`${t("admin.action.resetPassword")}: ${id}`}
        >
          {t("admin.action.resetPassword")}
        </button>
      )}
      {canImpersonate && (
        <button
          onClick={onImpersonate}
          disabled={!canImpersonateRow}
          style={actionBtnStyle(!canImpersonateRow)}
          aria-label={`${t("admin.action.impersonate")}: ${id}`}
        >
          {t("admin.action.impersonate")}
        </button>
      )}
    </>
  );
}

function StatusBadge({ user, t }: { user: AdminUser; t: T }) {
  const status = getAccountStatus(user);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {status === "active" ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden style={{ flexShrink: 0, color: C.success }}>
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 12l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : status === "pending" ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden style={{ flexShrink: 0, color: C.warning }}>
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
          <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden style={{ flexShrink: 0, color: C.error }}>
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
          <path d="M15 9l-6 6M9 9l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )}
      <span style={{ fontFamily: sans, fontSize: 13, color: C.dark }}>
        {status === "active"
          ? t("admin.status.enabled")
          : status === "pending"
            ? t("admin.status.pending")
            : t("admin.status.disabled")}
      </span>
      {status === "pending" && (
        <span style={{ fontFamily: sans, fontSize: 10, color: C.warning, fontWeight: 500, marginLeft: 4 }}>
          (PW)
        </span>
      )}
    </span>
  );
}

/* Activation progress (customers) + last sign-in (everyone). Stage comes
   from the custom:act* attributes read by /api/admin/users. */
function ActivationCell({ user, role, t }: { user: AdminUser; role: Role; t: T }) {
  const { locale } = useI18n();
  const a = user.activation ?? null;
  const stage = a?.stage ?? "none";
  const isCustomer = role === "User";

  const stageColor =
    stage === "completed"
      ? C.success
      : stage === "expired" || a?.emailStatus === "FAILED"
        ? C.error
        : stage === "none"
          ? C.stone
          : C.warning;

  const metaLine =
    a?.lastLoginAt
      ? t("admin.activation.lastLogin", { date: formatDateTime(a.lastLoginAt, locale) })
      : isCustomer && a?.expiresAt && (stage === "sent" || stage === "opened" || stage === "verified")
        ? t("admin.activation.expires", { date: formatDateTime(a.expiresAt, locale) })
        : t("admin.activation.neverLoggedIn");

  const stageLabel = isCustomer ? t(`admin.activation.${stage}`) : null;
  const emailNote =
    isCustomer && stage !== "completed" && stage !== "none"
      ? a?.emailStatus === "FAILED"
        ? t("admin.activation.emailFailed")
        : a?.emailStatus === "NOT_SENT"
          ? t("admin.activation.emailNotSent")
          : null
      : null;

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 2 }}>
      {stageLabel && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: sans, fontSize: 13, color: C.dark }}>
          <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: stageColor, flexShrink: 0 }} />
          {stageLabel}
          {emailNote && (
            <span style={{ fontSize: 10, color: C.error, fontWeight: 500, marginLeft: 2 }}>({emailNote})</span>
          )}
        </span>
      )}
      <span style={{ fontFamily: sans, fontSize: 11, color: C.stone, whiteSpace: "nowrap" }}>{metaLine}</span>
    </span>
  );
}

function MfaBadge({ user, t }: { user: AdminUser; t: T }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontFamily: sans,
        fontSize: 13,
        color: user.mfaEnabled ? C.success : C.stone,
      }}
    >
      {user.mfaEnabled ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      )}
      <span>{user.mfaEnabled ? t("admin.mfa.on") : t("admin.mfa.off")}</span>
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════
   ROLE FILTER (multi-select) — styled like the design selects
   ═══════════════════════════════════════════════════════════ */

function RoleFilterDropdown({
  selectedRoles,
  onChange,
  t,
}: {
  selectedRoles: Role[];
  onChange: (roles: Role[]) => void;
  t: T;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  function toggleRole(role: Role) {
    onChange(
      selectedRoles.includes(role)
        ? selectedRoles.filter((r) => r !== role)
        : [...selectedRoles, role],
    );
  }

  const label =
    selectedRoles.length === 0
      ? t("admin.filter.role.all")
      : selectedRoles.map((r) => roleLabel(r, t)).join(", ");

  return (
    <div ref={containerRef} style={{ position: "relative", minWidth: 220 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("admin.filter.role.label")}
        style={{
          ...selectStyle,
          minHeight: 40,
          width: "100%",
          textAlign: "left",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </button>

      {open && (
        <div
          role="listbox"
          aria-multiselectable="true"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            zIndex: 20,
            minWidth: "100%",
            backgroundColor: C.bg,
            border: `1px solid ${C.line}`,
            borderRadius: 4,
            boxShadow: "0 12px 32px rgba(25, 23, 24, 0.10)",
            padding: 4,
          }}
        >
          {ROLES.map((role) => {
            const checked = selectedRoles.includes(role);
            return (
              <label
                key={role}
                role="option"
                aria-selected={checked}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  fontFamily: sans,
                  fontSize: 13,
                  color: C.dark,
                  cursor: "pointer",
                  borderRadius: 2,
                  whiteSpace: "nowrap",
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleRole(role)}
                  style={{ cursor: "pointer", accentColor: C.purple }}
                />
                {roleLabel(role, t)}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   CREATE / EDIT USER MODAL
   ═══════════════════════════════════════════════════════════ */

function CreateUserModal({
  onClose,
  onCreated,
  onUpdated,
  editUser,
  t,
  users,
}: {
  onClose: () => void;
  onCreated: () => void;
  onUpdated: () => void;
  editUser?: AdminUser | null;
  t: T;
  users: AdminUser[];
}) {
  const isEdit = Boolean(editUser);
  const toast = useToast();
  const modalRef = useRef<HTMLDivElement>(null);
  const [customerId, setCustomerId] = useState(editUser?.username ?? "");
  const [email, setEmail] = useState(editUser?.email ?? "");
  const [role, setRole] = useState<Role>((editUser?.groups[0] as Role) ?? "User");
  const [tempPassword, setTempPassword] = useState(() => generateTempPassword());
  const [copied, setCopied] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState(editUser?.phoneNumber ?? "");
  const [firstName, setFirstName] = useState(editUser?.firstName ?? "");
  const [lastName, setLastName] = useState(editUser?.lastName ?? "");
  const [profileImageKey, setProfileImageKey] = useState<string | null>(
    editUser?.profileImageKey ?? null,
  );
  const [street, setStreet] = useState(editUser?.street ?? "");
  const [city, setCity] = useState(editUser?.city ?? "");
  const [zipCode, setZipCode] = useState(editUser?.zipCode ?? "");
  const [assignedRm, setAssignedRm] = useState(editUser?.assignedRm ?? "");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<
    | { kind: "staff"; username: string; temporaryPassword: string }
    | { kind: "customer"; activation: ActivationResult }
    | null
  >(null);

  const isStaff = role === "Admin" || role === "InternalEmployee";
  const rmCandidates = users.filter(
    (u) => u.groups.includes("Admin") || u.groups.includes("InternalEmployee"),
  );

  /* Focus first control on open */
  useEffect(() => {
    const first = modalRef.current?.querySelector<HTMLElement>("select, input, button");
    first?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        if (!submitting) onClose();
      }
      if (e.key === "Tab" && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [onClose, submitting],
  );

  function handleCopy() {
    navigator.clipboard
      .writeText(tempPassword)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        // Clipboard blocked — value remains visible.
      });
  }

  function validate(): boolean {
    const errors: Record<string, string> = {};
    const required = t("admin.modal.fieldRequired");
    if (!firstName.trim()) errors.firstName = required;
    if (!lastName.trim()) errors.lastName = required;
    if (!phoneNumber.trim()) errors.phoneNumber = required;
    if (!profileImageKey) errors.profileImage = required;
    if (!email.trim()) errors.email = required;
    if (!isStaff) {
      if (!customerId.trim()) errors.customerId = required;
      if (!street.trim()) errors.street = required;
      if (!city.trim()) errors.city = required;
      if (!zipCode.trim()) errors.zipCode = required;
      if (!assignedRm) errors.assignedRm = required;
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setError(null);
    try {
      if (isEdit && editUser) {
        const payload: {
          username: string;
          email?: string;
          phoneNumber: string;
          firstName: string;
          lastName: string;
          profileImageKey: string | null;
          street?: string;
          city?: string;
          zipCode?: string;
          assignedRm?: string;
        } = {
          username: editUser.username,
          email: email.trim(),
          phoneNumber: phoneNumber.trim(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          profileImageKey,
        };
        if (!isStaff) {
          payload.street = street.trim();
          payload.city = city.trim();
          payload.zipCode = zipCode.trim();
          payload.assignedRm = assignedRm;
        }

        const res = await fetch("/api/admin/update-user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          const message = data.error?.trim() || t("admin.toast.updateFailed.fallback");
          setError(message);
          toast.error(message);
          setSubmitting(false);
          return;
        }

        toast.success(t("admin.toast.updated.title", { id: getDisplayId(editUser) }));
        setSubmitting(false);
        onUpdated();
        onClose();
        return;
      }

      const payload: {
        role: Role;
        temporaryPassword?: string;
        email?: string;
        customerId?: string;
        phoneNumber: string;
        firstName: string;
        lastName: string;
        profileImageKey: string | null;
        street?: string;
        city?: string;
        zipCode?: string;
        assignedRm?: string;
      } = {
        role,
        temporaryPassword: isStaff ? tempPassword || undefined : undefined,
        email: email.trim(),
        phoneNumber: phoneNumber.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        profileImageKey,
      };
      if (!isStaff) {
        payload.customerId = customerId.trim();
        payload.street = street.trim();
        payload.city = city.trim();
        payload.zipCode = zipCode.trim();
        payload.assignedRm = assignedRm;
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
        activationLink?: string | null;
        activationEmail?: ActivationResult["emailStatus"];
        ttlHours?: number;
      };
      if (!res.ok) {
        const message = data.error?.trim() || t("admin.toast.createFailed.fallback");
        setError(message);
        toast.error(message);
        setSubmitting(false);
        return;
      }

      const createdId = isStaff ? email.trim() : (data.username ?? customerId.trim());
      toast.success(t("admin.toast.created.title", { id: createdId }));
      if (isStaff) {
        setResult({
          kind: "staff",
          username: data.username ?? "",
          temporaryPassword: data.temporaryPassword ?? tempPassword,
        });
      } else {
        setResult({
          kind: "customer",
          activation: {
            username: data.username ?? customerId.trim(),
            email: email.trim(),
            link: data.activationLink ?? null,
            emailStatus: data.activationEmail ?? "NOT_SENT",
            ttlHours: data.ttlHours ?? 48,
          },
        });
      }
      setSubmitting(false);
      onCreated();
    } catch (err) {
      const message =
        err instanceof Error && err.message ? err.message : t("admin.toast.createFailed.fallback");
      setError(message);
      toast.error(message);
      setSubmitting(false);
    }
  }

  if (result?.kind === "customer") {
    return (
      <ActivationLinkDialog
        title={t("admin.created.headline")}
        result={result.activation}
        onClose={onClose}
        t={t}
      />
    );
  }
  if (result?.kind === "staff") {
    return (
      <CredentialsDialog
        title={t("admin.created.headline")}
        body={t("admin.created.body", { id: result.username })}
        fields={[
          { label: t("admin.toast.usernameLabel"), value: result.username },
          { label: t("admin.modal.tempPassword"), value: result.temporaryPassword },
        ]}
        onClose={onClose}
        t={t}
      />
    );
  }

  const busyLabel = isEdit ? t("admin.modal.saving") : t("admin.modal.creating");
  const submitLabel = isEdit ? t("admin.modal.save") : t("admin.modal.submit");

  return (
    <>
      <div onClick={() => !submitting && onClose()} style={backdropStyle} />
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-title"
        onKeyDown={handleKeyDown}
        style={{
          ...dialogStyle,
          width: "min(560px, calc(100vw - 32px))",
          maxHeight: "calc(100vh - 48px)",
          overflowY: "auto",
        }}
      >
        {/* Header */}
        <div style={{ padding: "28px 32px 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2
              id="create-title"
              style={{ fontFamily: serif, fontSize: 24, fontWeight: 400, fontStyle: "italic", color: C.dark, margin: 0, lineHeight: 1.2 }}
            >
              {isEdit ? t("admin.modal.editTitle") : t("admin.modal.title")}
            </h2>
            <p style={{ fontFamily: sans, fontSize: 13, color: C.stone, margin: "8px 0 0 0", lineHeight: 1.5 }}>
              {isEdit ? t("admin.modal.editSubtitle") : t("admin.modal.subtitle")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("admin.modal.cancel")}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: 8,
              outline: "none",
              lineHeight: 0,
              flexShrink: 0,
              marginTop: -4,
              marginRight: -8,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M18 6L6 18M6 6l12 12" stroke={C.dark} strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate style={{ padding: "24px 32px 32px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Role */}
            <div>
              <label htmlFor="modal-role" style={labelStyle}>
                {t("admin.modal.role")} *
              </label>
              <select
                id="modal-role"
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                disabled={isEdit}
                style={{ ...modalSelectStyle, cursor: isEdit ? "not-allowed" : "pointer", opacity: isEdit ? 0.6 : 1 }}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {roleLabel(r, t)}
                  </option>
                ))}
              </select>
            </div>

            {/* Identity: Client ID (clients only) + Email (everyone —
                customers receive their activation link there) */}
            {!isStaff && (
              <FloatingField
                id="modal-customerId"
                label={t("admin.modal.customerId")}
                placeholder={t("admin.modal.customerId.placeholder")}
                required
                value={customerId}
                onChange={setCustomerId}
                error={fieldErrors.customerId}
                disabled={isEdit || submitting}
                autoComplete="off"
              />
            )}
            <FloatingField
              id="modal-email"
              label={t("admin.modal.email")}
              type="email"
              required
              value={email}
              onChange={setEmail}
              error={fieldErrors.email}
              disabled={submitting}
              autoComplete="off"
            />

            {/* Temporary password — generated, not typed. Customers set
                their own password through the activation link instead. */}
            {!isEdit && isStaff && (
              <div>
                <label style={labelStyle}>{t("admin.modal.tempPassword")}</label>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    border: `1px solid ${C.line}`,
                    borderRadius: 2,
                    padding: "0 8px 0 12px",
                    height: 48,
                    backgroundColor: C.bgSecondary,
                  }}
                >
                  <code
                    style={{
                      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                      fontSize: 14,
                      color: C.dark,
                      flex: 1,
                      letterSpacing: "0.05em",
                      userSelect: "all",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {tempPassword}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopy}
                    aria-label={copied ? t("admin.modal.copied") : t("admin.modal.copy")}
                    style={{
                      fontFamily: sans,
                      fontSize: 10,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: copied ? C.success : C.stone,
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      padding: "8px 6px",
                      outline: "none",
                      minHeight: 32,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {copied ? t("admin.modal.copied") : t("admin.modal.copy")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTempPassword(generateTempPassword());
                      setCopied(false);
                    }}
                    aria-label={t("admin.modal.generate")}
                    style={{
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      padding: 6,
                      outline: "none",
                      lineHeight: 0,
                      color: C.stone,
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M23 4v6h-6M1 20v-6h6" />
                      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                    </svg>
                  </button>
                </div>
              </div>
            )}

            {/* Name row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <FloatingField
                id="modal-firstName"
                label={t("admin.modal.firstName")}
                required
                value={firstName}
                onChange={setFirstName}
                error={fieldErrors.firstName}
                disabled={submitting}
              />
              <FloatingField
                id="modal-lastName"
                label={t("admin.modal.lastName")}
                required
                value={lastName}
                onChange={setLastName}
                error={fieldErrors.lastName}
                disabled={submitting}
              />
            </div>

            {/* Phone */}
            <FloatingField
              id="modal-phone"
              label={t("admin.modal.phone")}
              type="tel"
              required
              value={phoneNumber}
              onChange={setPhoneNumber}
              error={fieldErrors.phoneNumber}
              disabled={submitting}
            />

            {/* Profile image */}
            <div>
              <ProfileImageUpload
                label={`${t("admin.modal.profileImage")} *`}
                imageKey={profileImageKey}
                onImageKeyChange={setProfileImageKey}
                disabled={submitting}
                invalidTypeMessage={t("admin.modal.image.invalidType")}
                tooLargeMessage={t("admin.modal.image.tooLarge")}
                uploadFailedMessage={t("admin.modal.image.uploadFailed")}
                uploadLabel={t("admin.modal.image.upload")}
                replaceLabel={t("admin.modal.image.replace")}
                removeLabel={t("admin.modal.image.remove")}
              />
              {fieldErrors.profileImage && (
                <span role="alert" style={{ fontFamily: sans, fontSize: 12, color: C.error, display: "block", marginTop: 6 }}>
                  {fieldErrors.profileImage}
                </span>
              )}
            </div>

            {!isStaff && (
              <>
                {/* Address */}
                <FloatingField
                  id="modal-street"
                  label={t("admin.modal.street")}
                  required
                  value={street}
                  onChange={setStreet}
                  error={fieldErrors.street}
                  disabled={submitting}
                />

                {/* ZIP + City */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 16 }}>
                  <FloatingField
                    id="modal-zipCode"
                    label={t("admin.modal.zipCode")}
                    required
                    value={zipCode}
                    onChange={setZipCode}
                    error={fieldErrors.zipCode}
                    disabled={submitting}
                  />
                  <FloatingField
                    id="modal-city"
                    label={t("admin.modal.city")}
                    required
                    value={city}
                    onChange={setCity}
                    error={fieldErrors.city}
                    disabled={submitting}
                  />
                </div>

                {/* Assigned RM */}
                <div>
                  <label htmlFor="modal-rm" style={labelStyle}>
                    {t("admin.modal.assignedRm")} *
                  </label>
                  <select
                    id="modal-rm"
                    value={assignedRm}
                    onChange={(e) => setAssignedRm(e.target.value)}
                    disabled={submitting}
                    style={{
                      ...modalSelectStyle,
                      borderColor: fieldErrors.assignedRm ? C.error : C.line,
                    }}
                  >
                    <option value="">{t("admin.modal.rmNone")}</option>
                    {rmCandidates.map((rmUser) => (
                      <option key={rmUser.username} value={rmUser.username}>
                        {`${rmUser.firstName ?? ""} ${rmUser.lastName ?? ""}`.trim() || rmUser.username}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.assignedRm && (
                    <span role="alert" style={{ fontFamily: sans, fontSize: 12, color: C.error, display: "block", marginTop: 6 }}>
                      {fieldErrors.assignedRm}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>

          {error && (
            <div
              role="alert"
              style={{
                marginTop: 20,
                padding: "12px 16px",
                backgroundColor: C.errorBg,
                border: `1px solid ${C.error}`,
                borderRadius: 4,
                fontFamily: sans,
                fontSize: 13,
                color: C.error,
                lineHeight: 1.5,
              }}
            >
              {error}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: 12, marginTop: 32, justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} disabled={submitting} style={ghostBtn}>
              {t("admin.modal.cancel")}
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={mushroomBtn(submitting)}
              onMouseEnter={(e) => {
                if (!submitting) e.currentTarget.style.backgroundColor = C.buttonHover;
              }}
              onMouseLeave={(e) => {
                if (!submitting) e.currentTarget.style.backgroundColor = C.button;
              }}
            >
              {submitting ? busyLabel : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   CREDENTIALS DIALOG — generated secrets with copy button.
   Values live only in this dialog state — dismissed = gone.
   ═══════════════════════════════════════════════════════════ */

function CredentialsDialog({
  title,
  body,
  fields,
  onClose,
  t,
}: {
  title: string;
  body: string;
  fields: { label: string; value: string }[];
  onClose: () => void;
  t: T;
}) {
  return (
    <>
      <div onClick={onClose} style={backdropStyle} />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="credentials-title"
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
        style={{ ...dialogStyle, padding: 32, width: "min(440px, calc(100vw - 48px))" }}
      >
        <h2
          id="credentials-title"
          style={{ fontFamily: serif, fontSize: 22, fontWeight: 400, fontStyle: "italic", color: C.dark, margin: 0, lineHeight: 1.2 }}
        >
          {title}
        </h2>
        <p style={{ fontFamily: sans, fontSize: 14, color: C.charcoal, lineHeight: 1.6, margin: "12px 0 0 0" }}>
          {body}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 20 }}>
          {fields.map((f) => (
            <div key={f.label}>
              {fields.length > 1 && <label style={labelStyle}>{f.label}</label>}
              <CredentialField value={f.value} t={t} />
            </div>
          ))}
        </div>

        <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} autoFocus style={mushroomBtn()}>
            {t("admin.modal.done")}
          </button>
        </div>
      </div>
    </>
  );
}

function CredentialField({ value, t }: { value: string; t: T }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard
      .writeText(value)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        // Clipboard blocked — value remains visible.
      });
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "12px 16px",
        backgroundColor: C.bgSecondary,
        border: `1px solid ${C.line}`,
        borderRadius: 4,
      }}
    >
      <code
        title={value}
        style={{
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 16,
          fontWeight: 500,
          color: C.dark,
          flex: 1,
          minWidth: 0,
          letterSpacing: "0.06em",
          userSelect: "all",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </code>
      <button
        type="button"
        onClick={handleCopy}
        style={{
          fontFamily: sans,
          fontSize: 11,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: copied ? C.success : C.stone,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: "8px 10px",
          outline: "none",
          whiteSpace: "nowrap",
          minHeight: 36,
        }}
      >
        {copied ? t("admin.modal.copied") : t("admin.modal.copy")}
      </button>
    </div>
  );
}

function PageButton({
  label,
  disabled,
  onClick,
  direction,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  direction: "prev" | "next";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 40,
        height: 40,
        border: `1px solid ${C.line}`,
        borderRadius: 2,
        background: "transparent",
        color: C.dark,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.3 : 1,
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
        {direction === "prev" ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 6l6 6-6 6" />}
      </svg>
    </button>
  );
}
