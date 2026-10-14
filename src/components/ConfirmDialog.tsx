"use client";

import { useCallback, useEffect, useRef } from "react";
import { useI18n } from "@/lib/i18n";
import { C, sans, serif } from "@/lib/tokens";
import { DURATION } from "@/lib/motion";

/* ═══════════════════════════════════════════════════════════
   CONFIRM DIALOG — modal with focus trap + Escape.
   For destructive / sensitive actions (deactivate, PW reset,
   impersonation). role="alertdialog", aria-modal, Escape-close.
   ═══════════════════════════════════════════════════════════ */

interface Props {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open && confirmRef.current) confirmRef.current.focus();
  }, [open]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
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
    [onCancel],
  );

  if (!open) return null;

  return (
    <>
      <div
        onClick={onCancel}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 10000,
          backgroundColor: "rgba(0,0,0,0.25)",
        }}
      />
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
        onKeyDown={handleKeyDown}
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
          width: "min(420px, calc(100vw - 48px))",
          boxShadow: "0 20px 60px rgba(0,0,0,0.12)",
        }}
      >
        <h2
          id="confirm-title"
          style={{
            fontFamily: serif,
            fontSize: 22,
            lineHeight: 1.2,
            color: C.dark,
            fontWeight: 400,
            fontStyle: "italic",
            margin: 0,
          }}
        >
          {title}
        </h2>
        <p
          id="confirm-body"
          style={{
            fontFamily: sans,
            fontSize: 14,
            color: C.charcoal,
            lineHeight: 1.6,
            margin: "16px 0 0 0",
          }}
        >
          {body}
        </p>
        <div style={{ display: "flex", gap: 12, marginTop: 28, justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            disabled={busy}
            style={{
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
              cursor: busy ? "not-allowed" : "pointer",
              outline: "none",
              minHeight: 44,
              transition: `border-color ${DURATION.fast}ms ease`,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = C.dark)}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = C.line)}
          >
            {cancelLabel || t("admin.confirm.cancel")}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            disabled={busy}
            style={{
              fontFamily: sans,
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: destructive ? "#ffffff" : C.dark,
              backgroundColor: destructive ? C.error : C.button,
              border: `1px solid ${destructive ? C.error : C.button}`,
              borderRadius: 0,
              padding: "12px 20px",
              cursor: busy ? "not-allowed" : "pointer",
              opacity: busy ? 0.7 : 1,
              outline: "none",
              minHeight: 44,
              transition: `background-color ${DURATION.fast}ms ease`,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = destructive ? "#9A3A30" : C.buttonHover;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = destructive ? C.error : C.button;
            }}
          >
            {confirmLabel || t("admin.confirm.confirm")}
          </button>
        </div>
      </div>
    </>
  );
}
