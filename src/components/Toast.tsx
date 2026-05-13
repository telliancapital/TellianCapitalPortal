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
import { AlertCircle, Check, Info, X } from "lucide-react";

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

      const defaultDuration = variant === "error" ? 8000 : 5000;
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
        style={{
          position: "fixed",
          top: "24px",
          right: "24px",
          zIndex: 1000,
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          maxWidth: "440px",
          width: "calc(100% - 48px)",
          pointerEvents: "none",
        }}
      >
        {toasts.map((toast) => (
          <ToastItem
            key={toast.id}
            toast={toast}
            onDismiss={() => dismiss(toast.id)}
          />
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
  const accent = "var(--tellian-dark)";
  const surface = "var(--tellian-bg)";

  const Icon =
    toast.variant === "success"
      ? Check
      : toast.variant === "error"
        ? AlertCircle
        : Info;

  return (
    <div
      role={toast.variant === "error" ? "alert" : "status"}
      style={{
        backgroundColor: surface,
        border: "1px solid var(--tellian-line)",
        borderLeft: `3px solid ${accent}`,
        padding: "14px 16px",
        fontFamily: "var(--font-inter), 'Inter', sans-serif",
        boxShadow: "var(--tellian-shadow-md)",
        display: "flex",
        gap: "12px",
        pointerEvents: "auto",
      }}
    >
      <Icon
        size={18}
        style={{ color: accent, flexShrink: 0, marginTop: "2px" }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: "14px",
            fontWeight: 500,
            color: "var(--tellian-dark)",
            lineHeight: 1.4,
          }}
        >
          {toast.title}
        </div>
        {toast.description && (
          <div
            style={{
              marginTop: "4px",
              fontSize: "13px",
              color: "var(--tellian-charcoal)",
              lineHeight: 1.5,
              wordBreak: "break-word",
              whiteSpace: "pre-wrap",
            }}
          >
            {toast.description}
          </div>
        )}
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        style={{
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: "var(--tellian-stone)",
          padding: "4px",
          margin: "-4px",
          alignSelf: "flex-start",
          lineHeight: 0,
        }}
      >
        <X size={16} />
      </button>
    </div>
  );
}
