"use client";

import { useState } from "react";

interface FloatingFieldProps {
  id: string;
  label: string;
  type?: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string | null;
  disabled?: boolean;
  autoComplete?: string;
}

const sansFont = "var(--font-inter), 'Inter', sans-serif";

export function FloatingField({
  id,
  label,
  type = "text",
  required = false,
  value,
  onChange,
  placeholder,
  error,
  disabled = false,
  autoComplete,
}: FloatingFieldProps) {
  const [focused, setFocused] = useState(false);
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
        }}
      >
        {required ? `${label} *` : label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        required={required}
        disabled={disabled}
        placeholder={floated ? placeholder : undefined}
        autoComplete={autoComplete}
        aria-invalid={showError || undefined}
        aria-describedby={showError ? errorId : undefined}
        aria-required={required || undefined}
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
          padding: floated ? "22px 12px 8px" : "14px 12px",
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
