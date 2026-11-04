"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { FloatingField } from "@/components/FloatingField";
import { MfaSetupSecret, SecondaryButton, validateMfaCode } from "@/components/LoginForm";
import { ToastProvider, useToast } from "@/components/Toast";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { DURATION } from "@/lib/motion";
import { C, LABEL, sans, serif } from "@/lib/tokens";

/* ═══════════════════════════════════════════════════════════
   CLIENT DASHBOARD — settings card for MFA (sidebar).
   not set up  → "Set up MFA"
   set up      → "Enable" / "Disable" + "Reset" (new QR code)
   Set-up and reset share one dialog: QR code → 6-digit code.
   MFA is off by default after activation; the customer opts in here.
   ═══════════════════════════════════════════════════════════ */

type DialogMode = "setup" | "reset";

interface MfaResponse {
  status?: "OK";
  otpauthUrl?: string;
  error?: string;
  code?: "invalidCode" | "sessionExpired" | "notSetUp";
}

async function post(path: string, body?: Record<string, unknown>): Promise<{ ok: boolean; data: MfaResponse }> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = (await res.json().catch(() => ({}))) as MfaResponse;
  return { ok: res.ok, data };
}

export function MfaSettingsCard() {
  return (
    <ToastProvider>
      <MfaSettingsCardInner />
    </ToastProvider>
  );
}

function MfaSettingsCardInner() {
  const { t } = useI18n();
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [dialog, setDialog] = useState<{ mode: DialogMode; otpauthUrl: string } | null>(null);

  const mfaEnabled = user?.mfaEnabled ?? false;
  const mfaSetUp = user?.mfaSetUp ?? false;

  const errorFor = useCallback(
    (data: MfaResponse) =>
      data.code === "sessionExpired" ? t("docs.mfa.error.session") : t("docs.mfa.error.generic"),
    [t],
  );

  const openDialog = useCallback(
    async (mode: DialogMode) => {
      setBusy(true);
      try {
        const { ok, data } = await post("/api/auth/mfa/init");
        if (ok && data.otpauthUrl) setDialog({ mode, otpauthUrl: data.otpauthUrl });
        else toast.error(errorFor(data));
      } catch {
        toast.error(t("docs.mfa.error.generic"));
      } finally {
        setBusy(false);
      }
    },
    [toast, errorFor, t],
  );

  async function toggle(enabled: boolean) {
    setBusy(true);
    try {
      const { ok, data } = await post("/api/auth/mfa/toggle", { enabled });
      if (ok) {
        await refresh();
        toast.success(enabled ? t("docs.mfa.toast.enabled") : t("docs.mfa.toast.disabled"));
        return;
      }
      if (data.code === "notSetUp") {
        // Verified token is gone (e.g. admin reset) — fall back to set-up.
        setBusy(false);
        await openDialog("setup");
        return;
      }
      toast.error(errorFor(data));
    } catch {
      toast.error(t("docs.mfa.error.generic"));
    } finally {
      setBusy(false);
    }
  }

  async function handleVerified(mode: DialogMode) {
    setDialog(null);
    await refresh();
    toast.success(mode === "reset" ? t("docs.mfa.toast.reset") : t("docs.mfa.toast.setUp"));
  }

  // Admins impersonating a customer act with their own token — hide.
  if (!user || user.impersonatedBy) return null;

  const status = mfaEnabled ? "enabled" : mfaSetUp ? "disabled" : "notSetUp";
  const statusColor = mfaEnabled ? C.success : C.stone;

  return (
    <div style={{ padding: 24, backgroundColor: C.bgSecondary, borderRadius: 8, marginTop: 24 }}>
      <span style={{ ...LABEL, display: "block", marginBottom: 16 }}>
        {t("docs.settings.headline")}
      </span>

      <span style={{ fontFamily: sans, fontSize: 15, fontWeight: 600, color: C.dark, display: "block" }}>
        {t("docs.mfa.title")}
      </span>

      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          marginTop: 8,
          fontFamily: sans,
          fontSize: 13,
          color: C.dark,
        }}
      >
        <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: statusColor, flexShrink: 0 }} />
        {t(`docs.mfa.status.${status}`)}
      </span>

      <p style={{ fontFamily: sans, fontSize: 13, color: C.stoneText, lineHeight: 1.5, margin: "10px 0 0 0" }}>
        {t(`docs.mfa.body.${status}`)}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18 }}>
        {!mfaSetUp && (
          <CardButton primary busy={busy} onClick={() => void openDialog("setup")}>
            {t("docs.mfa.setup")}
          </CardButton>
        )}
        {mfaSetUp && mfaEnabled && (
          <CardButton busy={busy} onClick={() => setConfirmDisable(true)}>
            {t("docs.mfa.disable")}
          </CardButton>
        )}
        {mfaSetUp && !mfaEnabled && (
          <CardButton primary busy={busy} onClick={() => void toggle(true)}>
            {t("docs.mfa.enable")}
          </CardButton>
        )}
        {mfaSetUp && (
          <CardButton busy={busy} onClick={() => void openDialog("reset")}>
            {t("docs.mfa.reset")}
          </CardButton>
        )}
      </div>

      <ConfirmDialog
        open={confirmDisable}
        title={t("docs.mfa.confirmDisable.title")}
        body={t("docs.mfa.confirmDisable.body")}
        confirmLabel={t("docs.mfa.disable")}
        destructive
        busy={busy}
        onConfirm={() => {
          setConfirmDisable(false);
          void toggle(false);
        }}
        onCancel={() => setConfirmDisable(false)}
      />

      {dialog && (
        <MfaSetupDialog
          mode={dialog.mode}
          otpauthUrl={dialog.otpauthUrl}
          onVerified={() => void handleVerified(dialog.mode)}
          onCancel={() => setDialog(null)}
        />
      )}
    </div>
  );
}

function CardButton({
  primary = false,
  busy,
  onClick,
  children,
}: {
  primary?: boolean;
  busy: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={primary ? "tellian-portal-cta" : "tellian-portal-mfa-btn"}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        minHeight: 48,
        width: "100%",
        fontFamily: sans,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: primary ? C.bg : C.dark,
        backgroundColor: primary ? C.purple : "transparent",
        border: `1px solid ${primary ? C.purple : C.line}`,
        borderRadius: 0,
        cursor: busy ? "not-allowed" : "pointer",
        opacity: busy ? 0.6 : 1,
        transition: `background-color ${DURATION.fast}ms ease, border-color ${DURATION.fast}ms ease`,
      }}
      onMouseEnter={(e) => {
        if (!primary) e.currentTarget.style.borderColor = C.dark;
      }}
      onMouseLeave={(e) => {
        if (!primary) e.currentTarget.style.borderColor = C.line;
      }}
    >
      {children}
      {primary && <span aria-hidden>→</span>}
    </button>
  );
}

/* QR code + verification code — same pieces as the login-time set-up. */
function MfaSetupDialog({
  mode,
  otpauthUrl,
  onVerified,
  onCancel,
}: {
  mode: DialogMode;
  otpauthUrl: string;
  onVerified: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panelRef.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const codeErr = validateMfaCode(code);
    if (codeErr) {
      setCodeError(t(codeErr));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { ok, data } = await post("/api/auth/mfa/verify", { code });
      if (ok) {
        onVerified();
        return;
      }
      if (data.code === "invalidCode") setCodeError(t("docs.mfa.error.code"));
      else if (data.code === "sessionExpired") setError(t("docs.mfa.error.session"));
      else setError(t("docs.mfa.error.generic"));
    } catch {
      setError(t("docs.mfa.error.generic"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div
        onClick={loading ? undefined : onCancel}
        aria-hidden
        style={{ position: "fixed", inset: 0, zIndex: 10000, backgroundColor: "rgba(0,0,0,0.25)" }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mfa-dialog-title"
        onKeyDown={(e) => {
          if (e.key === "Escape" && !loading) {
            e.stopPropagation();
            onCancel();
          }
        }}
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 10001,
          backgroundColor: C.bg,
          border: `1px solid ${C.line}`,
          borderRadius: 8,
          padding: 32,
          width: "min(440px, calc(100vw - 48px))",
          maxHeight: "calc(100vh - 48px)",
          overflowY: "auto",
          boxShadow: "0 20px 60px rgba(0,0,0,0.12)",
        }}
      >
        <h2
          id="mfa-dialog-title"
          style={{ fontFamily: serif, fontSize: 22, lineHeight: 1.2, color: C.dark, fontWeight: 400, fontStyle: "italic", margin: 0 }}
        >
          {mode === "reset" ? t("docs.mfa.reset.headline") : t("challenge.mfaSetup.headline")}
        </h2>
        {mode === "reset" && (
          <p style={{ fontFamily: sans, fontSize: 14, color: C.charcoal, lineHeight: 1.6, margin: "12px 0 0 0" }}>
            {t("docs.mfa.reset.subtext")}
          </p>
        )}

        {error && (
          <div
            role="alert"
            style={{
              marginTop: 16,
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

        <form onSubmit={handleSubmit} noValidate style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 20 }}>
          <MfaSetupSecret otpauthUrl={otpauthUrl} t={t} />
          <FloatingField
            id="mfaSetupCode"
            label={t("challenge.mfaSetup.label")}
            type="text"
            value={code}
            onChange={(v) => {
              setCode(v);
              if (codeError) setCodeError(null);
            }}
            autoComplete="one-time-code"
            error={codeError}
            disabled={loading}
            required
          />
          <SecondaryButton loading={loading} label={t("challenge.submit")} />
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            style={{
              width: "100%",
              minHeight: 48,
              background: "transparent",
              border: `1px solid ${C.line}`,
              borderRadius: 0,
              color: C.stone,
              fontFamily: sans,
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
              outline: "none",
            }}
          >
            {t("docs.mfa.cancel")}
          </button>
        </form>
      </div>
    </>
  );
}
