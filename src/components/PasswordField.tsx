"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string | null;
  disabled?: boolean;
  autoComplete?: string;
}

const sansFont = "var(--font-inter), 'Inter', sans-serif";

export function PasswordField({
  id,
  label,
  value,
  onChange,
  error,
  disabled = false,
  autoComplete,
}: PasswordFieldProps) {
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  const errorId = `${id}-error`;
  const floated = focused || value.length > 0;
  const showError = !!error && !focused;

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <label
        htmlFor={id}
        style={{
          position: "absolute",
          left: 12,
          top: floated ? 6 : "50%",
          transform: floated ? "none" : "translateY(-50%)",
          fontFamily: sansFont,
          fontSize: floated ? 11 : 13,
          fontWeight: floated ? 500 : 400,
          letterSpacing: floated ? "0.1em" : "0.02em",
          textTransform: floated ? "uppercase" : "none",
          color: showError
            ? "var(--tellian-error)"
            : focused
              ? "var(--tellian-dark)"
              : "var(--tellian-stone)",
          pointerEvents: "none",
          transition: "all 200ms ease",
          lineHeight: 1,
          zIndex: 1,
        }}
      >
        {label} *
      </label>

      <input
        id={id}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        disabled={disabled}
        autoComplete={autoComplete}
        aria-invalid={showError || undefined}
        aria-describedby={showError ? errorId : undefined}
        aria-required
        className="placeholder:text-tellian-muted"
        style={{
          fontFamily: sansFont,
          fontSize: 14,
          color: disabled ? "var(--tellian-stone)" : "var(--tellian-dark)",
          backgroundColor: "transparent",
          border: `1px solid ${
            showError
              ? "var(--tellian-error)"
              : focused
                ? "var(--tellian-dark)"
                : "var(--tellian-line)"
          }`,
          borderRadius: 2,
          padding: floated ? "22px 44px 8px 12px" : "14px 44px 14px 12px",
          outline: "none",
          width: "100%",
          height: 48,
          boxSizing: "border-box",
          transition: "border-color 200ms ease, padding 200ms ease",
          appearance: "none",
          cursor: disabled ? "not-allowed" : "text",
          opacity: disabled ? 0.5 : 1,
        }}
      />

      <button
        type="button"
        tabIndex={-1}
        onClick={() => setVisible(!visible)}
        aria-label={visible ? "Hide password" : "Show password"}
        style={{
          position: "absolute",
          right: 8,
          top: "50%",
          transform: "translateY(-50%)",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: 8,
          lineHeight: 0,
          color: "var(--tellian-stone)",
          outline: "none",
          minWidth: 32,
          minHeight: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>

      {showError && (
        <span
          id={errorId}
          role="alert"
          style={{
            fontFamily: sansFont,
            fontSize: 12,
            color: "var(--tellian-error)",
            display: "block",
            marginTop: 6,
          }}
        >
          {error}
        </span>
      )}
    </div>
  );
}
