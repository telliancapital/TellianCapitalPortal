"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Copy, Loader2, Search, Shield, ShieldCheck, UserPlus, X, XCircle } from "lucide-react";
import { PortalLayout } from "@/components/PortalLayout";
import { ToastProvider, useToast } from "@/components/Toast";
import { FloatingField } from "@/components/FloatingField";
import { ProfileImageUpload } from "@/components/ProfileImageUpload";
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
}

function getDisplayName(u: AdminUser): string {
  const full = [u.firstName, u.lastName].filter(Boolean).join(" ");
  return full || "—";
}

function getDisplayId(u: AdminUser): string {
  const role = (u.groups[0] ?? "User") as Role;
  if (role === "Admin" || role === "InternalEmployee") {
    return u.email ?? "—";
  }
  return u.username;
}

export default function AdminPage() {
  const { user, loading, refresh } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [createdNotice, setCreatedNotice] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<Role[]>([]);
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
    const role = (u.groups[0] ?? "User") as Role;
    const matchesRole =
      selectedRoles.length === 0 || selectedRoles.includes(role);
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

  if (loading || !user || !canViewUsers) {
    return (
      <PortalLayout sectionLabel={t("portal.nav.userManagement")}>
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
    <PortalLayout sectionLabel={t("portal.nav.userManagement")}>
      <ToastProvider>
      <div
        style={{
          paddingTop: "clamp(32px, 5vw, 48px)",
          paddingBottom: "24px",
        }}
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1
              style={{
                fontFamily: "var(--font-lustria), 'Lustria', serif",
                fontSize: "clamp(24px, 4vw, 40px)",
                fontWeight: 400,
                color: "var(--tellian-dark)",
                letterSpacing: "-0.02em",
                lineHeight: 1.1,
                margin: 0,
              }}
            >
              <em style={{ fontStyle: "italic", fontWeight: 400 }}>
                {t("admin.headline")}
              </em>
            </h1>
            <p
              style={{
                fontFamily: "var(--font-inter), 'Inter', sans-serif",
                fontSize: "14px",
                color: "var(--tellian-stone)",
                marginTop: "8px",
                marginBottom: 0,
                lineHeight: 1.5,
              }}
            >
              {t("admin.subtext")}
            </p>
          </div>
          {canManageUsers && (
            <button
              onClick={() => setShowCreate(true)}
              className="hover:bg-tellian-button-hover"
              style={{
                backgroundColor: "var(--tellian-button)",
                color: "var(--tellian-dark)",
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

        <div
          className="flex items-end flex-wrap"
          style={{ marginTop: "24px", gap: "24px" }}
        >
          <div style={{ maxWidth: "400px", flex: "1 1 280px", position: "relative" }}>
            <Search
              size={16}
              style={{
                position: "absolute",
                left: 0,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--tellian-stone)",
                pointerEvents: "none",
              }}
            />
            <input
              type="search"
              placeholder={t("admin.search.placeholder") ?? "Search users..."}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: "100%",
                backgroundColor: "transparent",
                border: "none",
                borderBottom: "1.5px solid var(--tellian-line)",
                borderRadius: 0,
                padding: "10px 0 10px 28px",
                fontFamily: "var(--font-inter), 'Inter', sans-serif",
                fontSize: "14px",
                color: "var(--tellian-dark)",
                outline: "none",
                transition: "border-color 200ms ease",
              }}
              onFocus={(e) =>
                (e.currentTarget.style.borderBottomColor = "var(--tellian-dark)")
              }
              onBlur={(e) =>
                (e.currentTarget.style.borderBottomColor = "var(--tellian-line)")
              }
            />
          </div>

          <RoleFilterDropdown
            selectedRoles={selectedRoles}
            onChange={setSelectedRoles}
            t={t}
          />
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

      <div>
        <div
          className="hidden md:grid md:items-center"
          style={{
            gridTemplateColumns: showActionsColumn
              ? "minmax(0, 1.4fr) minmax(0, 1.8fr) 140px 110px 100px minmax(360px, 2.6fr)"
              : "minmax(0, 1.4fr) minmax(0, 1.8fr) 140px 110px 100px",
            gap: "24px",
            padding: "12px 0",
            borderBottom: "1.5px solid var(--tellian-dark)",
            fontFamily: "var(--font-inter), 'Inter', sans-serif",
            fontSize: "10px",
            fontWeight: 600,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "var(--tellian-stone)",
          }}
        >
          <span style={headerCell}>{t("admin.col.id")}</span>
          <span style={headerCell}>{t("admin.col.name")}</span>
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
              onEdit={() => setEditingUser(u)}
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
      </ToastProvider>
    </PortalLayout>
  );
}

function RoleFilterDropdown({
  selectedRoles,
  onChange,
  t,
}: {
  selectedRoles: Role[];
  onChange: (roles: Role[]) => void;
  t: (key: any) => string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
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
      ? (t("admin.filter.role.all") ?? "All roles")
      : selectedRoles.join(", ");

  return (
    <div ref={containerRef} style={{ position: "relative", minWidth: "200px" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          width: "100%",
          backgroundColor: "transparent",
          border: "none",
          borderBottom: "1.5px solid var(--tellian-line)",
          borderRadius: 0,
          padding: "10px 24px 10px 0",
          fontFamily: "var(--font-inter), 'Inter', sans-serif",
          fontSize: "14px",
          color: "var(--tellian-dark)",
          textAlign: "left",
          cursor: "pointer",
          position: "relative",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {label}
        <ChevronDown
          size={16}
          style={{
            position: "absolute",
            right: 0,
            top: "50%",
            transform: open ? "translateY(-50%) rotate(180deg)" : "translateY(-50%)",
            color: "var(--tellian-stone)",
            transition: "transform 150ms ease",
            pointerEvents: "none",
          }}
        />
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
            backgroundColor: "var(--tellian-cream, #fff)",
            border: "1px solid var(--tellian-line)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
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
                  gap: "10px",
                  padding: "10px 14px",
                  fontFamily: "var(--font-inter), 'Inter', sans-serif",
                  fontSize: "13px",
                  color: "var(--tellian-dark)",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleRole(role)}
                  style={{ cursor: "pointer" }}
                />
                {role}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

function UserRow({
  user,
  onChangeRole,
  onToggle,
  onToggleMfa,
  onImpersonate,
  onResetPassword,
  onEdit,
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
  onEdit: () => void;
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
          ? "minmax(0, 1.4fr) minmax(0, 1.8fr) 140px 110px 100px minmax(360px, 2.6fr)"
          : "minmax(0, 1.4fr) minmax(0, 1.8fr) 140px 110px 100px",
        padding: "14px 0",
        borderBottom: "1px solid var(--tellian-line)",
        gap: "24px",
        fontFamily: "var(--font-inter), 'Inter', sans-serif",
      }}
    >
      <div
        style={{
          ...rowCell,
          fontSize: "13px",
          fontWeight: 500,
          color: "var(--tellian-dark)",
          overflow: "hidden",
        }}
        title={getDisplayId(user)}
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
          {getDisplayId(user)}
        </span>
      </div>

      <div
        style={{
          ...rowCell,
          fontSize: "13px",
          color: "var(--tellian-dark)",
          overflow: "hidden",
        }}
        title={getDisplayName(user)}
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
          {getDisplayName(user)}
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

      <div style={rowCell}>
        <StatusBadge enabled={user.enabled} t={t} />
      </div>

      <div style={rowCell}>
        <MfaBadge enabled={user.mfaEnabled} t={t} />
      </div>

      {showActions && (
        <div className="mt-3 md:mt-0 flex flex-wrap gap-1 items-center" style={{ minWidth: 0 }}>
          {canManage && (
            <button onClick={onEdit} style={actionBtnStyle()}>
              {t("admin.action.edit")}
            </button>
          )}
          {canManage && (
            <button
              onClick={onToggle}
              disabled={isSelf}
              style={actionBtnStyle(isSelf)}
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
              style={actionBtnStyle(isSelf)}
            >
              {user.mfaEnabled
                ? t("admin.action.mfaDisable")
                : t("admin.action.mfaEnable")}
            </button>
          )}
          {canManage && (
            <button
              onClick={onResetPassword}
              disabled={isSelf}
              style={actionBtnStyle(isSelf)}
            >
              {t("admin.action.resetPassword")}
            </button>
          )}
          {canImpersonate && (
            <button
              onClick={onImpersonate}
              disabled={!canImpersonateRow}
              style={actionBtnStyle(!canImpersonateRow)}
            >
              {t("admin.action.impersonate")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function StatusBadge({
  enabled,
  t,
}: {
  enabled: boolean;
  t: ReturnType<typeof useI18n>["t"];
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        fontFamily: "var(--font-inter), 'Inter', sans-serif",
        fontSize: "13px",
        color: enabled ? "var(--tellian-success)" : "var(--tellian-stone)",
      }}
    >
      {enabled ? (
        <CheckCircle2 size={14} style={{ color: "var(--tellian-success)" }} />
      ) : (
        <XCircle size={14} style={{ color: "var(--tellian-stone)" }} />
      )}
      {enabled ? t("admin.status.enabled") : t("admin.status.disabled")}
    </span>
  );
}

function MfaBadge({
  enabled,
  t,
}: {
  enabled: boolean;
  t: ReturnType<typeof useI18n>["t"];
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        fontFamily: "var(--font-inter), 'Inter', sans-serif",
        fontSize: "13px",
        color: enabled ? "var(--tellian-success)" : "var(--tellian-stone)",
      }}
    >
      {enabled ? (
        <ShieldCheck size={14} style={{ color: "var(--tellian-success)" }} />
      ) : (
        <Shield size={14} style={{ color: "var(--tellian-stone)" }} />
      )}
      {enabled ? t("admin.mfa.on") : t("admin.mfa.off")}
    </span>
  );
}

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
  t: (key: any) => string;
  users: AdminUser[];
}) {
  const isEdit = Boolean(editUser);
  const toast = useToast();
  const [customerId, setCustomerId] = useState(editUser?.username ?? "");
  const [email, setEmail] = useState(editUser?.email ?? "");
  const [role, setRole] = useState<Role>(
    (editUser?.groups[0] as Role) ?? "User",
  );
  const [tempPassword, setTempPassword] = useState("");
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
  const [result, setResult] = useState<{
    username: string;
    temporaryPassword: string;
    role: Role;
  } | null>(null);

  const isStaff = role === "Admin" || role === "InternalEmployee";
  const rmCandidates = users.filter(
    (u) => u.groups.includes("Admin") || u.groups.includes("InternalEmployee"),
  );

  function validate(): boolean {
    const errors: Record<string, string> = {};
    const required = t("admin.modal.fieldRequired");
    if (!firstName.trim()) errors.firstName = required;
    if (!lastName.trim()) errors.lastName = required;
    if (!phoneNumber.trim()) errors.phoneNumber = required;
    if (!profileImageKey) errors.profileImage = required;
    if (isStaff) {
      if (!email.trim()) errors.email = required;
    } else {
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
          phoneNumber: phoneNumber.trim(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          profileImageKey,
        };
        if (isStaff) {
          payload.email = email.trim();
        } else {
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
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        if (!res.ok) {
          const message =
            data.error?.trim() || t("admin.toast.updateFailed.fallback");
          setError(message);
          toast.error(message);
          setSubmitting(false);
          return;
        }

        toast.success(t("admin.toast.updated.title"));
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
        temporaryPassword: tempPassword || undefined,
        phoneNumber: phoneNumber.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        profileImageKey,
      };
      if (isStaff) {
        payload.email = email.trim();
      } else {
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
        padding: "5vh 16px",
        overflowY: "auto",
        zIndex: 200,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: "var(--tellian-bg)",
          width: "100%",
          maxWidth: "640px",
          maxHeight: "90vh",
          overflowY: "auto",
          padding: "32px",
        }}
      >
        <div className="flex items-center justify-between" style={{ marginBottom: "24px" }}>
          <h2
            style={{
              fontFamily: "var(--font-lustria), 'Lustria', serif",
              fontSize: "24px",
              fontWeight: 400,
              fontStyle: "italic",
              color: "var(--tellian-dark)",
              margin: 0,
              lineHeight: 1.2,
            }}
          >
            {result
              ? t("admin.toast.created.title")
              : isEdit
                ? t("admin.modal.editTitle")
                : t("admin.modal.title")}
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
              disabled={isEdit}
              style={{
                ...modalInput,
                cursor: isEdit ? "not-allowed" : "pointer",
                opacity: isEdit ? 0.6 : 1,
              }}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div style={{ marginTop: "20px" }}>
            <FloatingField
              id="modal-firstName"
              label={t("admin.modal.firstName")}
              required
              value={firstName}
              onChange={setFirstName}
              error={fieldErrors.firstName}
            />
          </div>
          <div style={{ marginTop: "20px" }}>
            <FloatingField
              id="modal-lastName"
              label={t("admin.modal.lastName")}
              required
              value={lastName}
              onChange={setLastName}
              error={fieldErrors.lastName}
            />
          </div>
          <div style={{ marginTop: "20px" }}>
            <FloatingField
              id="modal-phone"
              label={t("admin.modal.phone")}
              type="tel"
              required
              value={phoneNumber}
              onChange={setPhoneNumber}
              error={fieldErrors.phoneNumber}
            />
          </div>
          <div style={{ marginTop: "20px" }}>
            <ProfileImageUpload
              label={t("admin.modal.profileImage")}
              imageKey={profileImageKey}
              onImageKeyChange={setProfileImageKey}
              disabled={submitting}
              invalidTypeMessage={t("admin.modal.image.invalidType")}
              tooLargeMessage={t("admin.modal.image.tooLarge")}
              uploadFailedMessage={t("admin.modal.image.uploadFailed")}
            />
            {fieldErrors.profileImage && (
              <p
                role="alert"
                style={{
                  fontFamily: "var(--font-inter), 'Inter', sans-serif",
                  fontSize: "12px",
                  color: "var(--tellian-error)",
                  marginTop: "6px",
                }}
              >
                {fieldErrors.profileImage}
              </p>
            )}
          </div>
          {isStaff ? (
            <div style={{ marginTop: "20px" }}>
              <FloatingField
                id="modal-email"
                label={t("admin.modal.email")}
                type="email"
                required
                value={email}
                onChange={setEmail}
                error={fieldErrors.email}
              />
            </div>
          ) : (
            <>
              <div style={{ marginTop: "20px" }}>
                <FloatingField
                  id="modal-customerId"
                  label={t("admin.modal.customerId")}
                  required
                  value={customerId}
                  onChange={setCustomerId}
                  error={fieldErrors.customerId}
                  disabled={isEdit}
                />
              </div>
              <div style={{ marginTop: "20px" }}>
                <FloatingField
                  id="modal-street"
                  label={t("admin.modal.street")}
                  required
                  value={street}
                  onChange={setStreet}
                  error={fieldErrors.street}
                />
              </div>
              <div style={{ marginTop: "20px", display: "flex", gap: "12px" }}>
                <div style={{ flex: 2 }}>
                  <FloatingField
                    id="modal-city"
                    label={t("admin.modal.city")}
                    required
                    value={city}
                    onChange={setCity}
                    error={fieldErrors.city}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <FloatingField
                    id="modal-zipCode"
                    label={t("admin.modal.zipCode")}
                    required
                    value={zipCode}
                    onChange={setZipCode}
                    error={fieldErrors.zipCode}
                  />
                </div>
              </div>
              <div style={{ marginTop: "20px" }}>
                <label style={modalLabel}>{t("admin.modal.assignedRm")}</label>
                <select
                  value={assignedRm}
                  onChange={(e) => setAssignedRm(e.target.value)}
                  style={{
                    ...modalInput,
                    borderColor: fieldErrors.assignedRm
                      ? "var(--tellian-error)"
                      : "var(--tellian-line)",
                  }}
                >
                  <option value="">—</option>
                  {rmCandidates.map((rmUser) => (
                    <option key={rmUser.username} value={rmUser.username}>
                      {`${rmUser.firstName ?? ""} ${rmUser.lastName ?? ""}`.trim() ||
                        rmUser.username}
                    </option>
                  ))}
                </select>
                {fieldErrors.assignedRm && (
                  <p
                    role="alert"
                    style={{
                      fontFamily: "var(--font-inter), 'Inter', sans-serif",
                      fontSize: "12px",
                      color: "var(--tellian-error)",
                      marginTop: "6px",
                    }}
                  >
                    {fieldErrors.assignedRm}
                  </p>
                )}
              </div>
            </>
          )}
          {!isEdit && (
            <div style={{ marginTop: "20px" }}>
              <FloatingField
                id="modal-tempPassword"
                label={t("admin.modal.tempPassword")}
                value={tempPassword}
                onChange={setTempPassword}
              />
            </div>
          )}

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
              className="hover:bg-tellian-button-hover"
              style={{
                flex: 1,
                height: "48px",
                backgroundColor: "var(--tellian-button)",
                color: "var(--tellian-dark)",
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
              {isEdit ? t("admin.modal.save") : t("admin.modal.submit")}
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
          className="hover:bg-tellian-button-hover"
          style={{
            flex: 1,
            height: "48px",
            backgroundColor: "var(--tellian-button)",
            color: "var(--tellian-dark)",
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
          borderRadius: "4px",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: "14px",
          color: "var(--tellian-dark)",
          backgroundColor: "var(--tellian-bg-secondary)",
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

function actionBtnStyle(disabled = false): React.CSSProperties {
  return {
    fontFamily: "var(--font-inter), 'Inter', sans-serif",
    fontSize: "11px",
    letterSpacing: "0.06em",
    color: disabled ? "var(--tellian-line)" : "var(--tellian-stone)",
    background: "transparent",
    border: "none",
    cursor: disabled ? "not-allowed" : "pointer",
    padding: "6px 8px",
    outline: "none",
    whiteSpace: "nowrap",
    minHeight: "32px",
    transition: "color 200ms ease",
    opacity: disabled ? 0.5 : 1,
  };
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
  borderRadius: "2px",
  padding: "12px",
  fontFamily: "var(--font-inter), 'Inter', sans-serif",
  fontSize: "14px",
  color: "var(--tellian-dark)",
  outline: "none",
};
