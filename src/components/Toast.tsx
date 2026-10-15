"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { C, sans } from "@/lib/tokens";

/* ═══════════════════════════════════════════════════════════
   FEEDBACK TOAST — bottom-centred flash (design AdminPage).
   aria-live, auto-dismiss, one specific line per message.
   ═══════════════════════════════════════════════════════════ */

type ToastVariant = "success" | "error" | "info";

interface ToastOptions {
  description?: string;
  duration?: number;
}

interface ToastRecord extends ToastOptions {
  id: number;
  variant: ToastVariant;
  title: string;
}

interface ToastApi {
  success: (title: string, options?: ToastOptions) => void;
  error: (title: string, options?: ToastOptions) => void;
  info: (title: string, options?: ToastOptions) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const counter = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (variant: ToastVariant, title: string, options?: ToastOptions) => {
      counter.current += 1;
      const id = counter.current;
      const record: ToastRecord = { id, variant, title, ...options };
      setToasts((prev) => [...prev, record]);

      const defaultDuration = variant === "error" ? 6000 : 3000;
      const duration =
        options?.duration !== undefined ? options.duration : defaultDuration;

      if (duration > 0) {
        const timer = setTimeout(() => dismiss(id), duration);
        timers.current.set(id, timer);
      }
    },
    [dismiss],
  );

  useEffect(() => {
    const timersMap = timers.current;
    return () => {
      timersMap.forEach((timer) => clearTimeout(timer));
      timersMap.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (title, options) => push("success", title, options),
      error: (title, options) => push("error", title, options),
      info: (title, options) => push("info", title, options),
      dismiss,
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: "fixed",
          bottom: 24,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 20000,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
          maxWidth: "calc(100vw - 48px)",
          pointerEvents: "none",
        }}
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastRecord;
  onDismiss: () => void;
}) {
  const palette =
    toast.variant === "success"
      ? { bg: C.successBg, border: C.success }
      : toast.variant === "error"
        ? { bg: C.errorBg, border: C.error }
        : { bg: C.bg, border: C.line };

  return (
    <div
      role={toast.variant === "error" ? "alert" : "status"}
      onClick={onDismiss}
      style={{
        fontFamily: sans,
        fontSize: 13,
        fontWeight: 500,
        color: C.dark,
        backgroundColor: palette.bg,
        border: `1px solid ${palette.border}`,
        borderRadius: 6,
        padding: "12px 24px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
        pointerEvents: "auto",
        cursor: "pointer",
        textAlign: "center",
        lineHeight: 1.5,
      }}
    >
      {toast.title}
      {toast.description && (
        <span
          style={{
            display: "block",
            marginTop: 4,
            fontSize: 12,
            fontWeight: 400,
            color: C.charcoal,
            wordBreak: "break-word",
          }}
        >
          {toast.description}
        </span>
      )}
    </div>
  );
}
