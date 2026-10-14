"use client";

import { useRef, useState } from "react";
import { C, sans } from "@/lib/tokens";
import {
  ALLOWED_IMAGE_CONTENT_TYPES,
  MAX_PROFILE_IMAGE_BYTES,
  isAllowedImageContentType,
} from "@/lib/uploadLimits";

interface ProfileImageUploadProps {
  label: string;
  imageKey: string | null;
  onImageKeyChange: (key: string | null) => void;
  disabled?: boolean;
  invalidTypeMessage: string;
  tooLargeMessage: string;
  uploadFailedMessage: string;
  uploadLabel?: string;
  replaceLabel?: string;
  removeLabel?: string;
}

export function ProfileImageUpload({
  label,
  imageKey,
  onImageKeyChange,
  disabled,
  invalidTypeMessage,
  tooLargeMessage,
  uploadFailedMessage,
  uploadLabel = "Upload",
  replaceLabel = "Replace",
  removeLabel = "Remove",
}: ProfileImageUploadProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setError(null);

    if (!isAllowedImageContentType(file.type)) {
      setError(invalidTypeMessage);
      return;
    }
    if (file.size > MAX_PROFILE_IMAGE_BYTES) {
      setError(tooLargeMessage);
      return;
    }

    setUploading(true);
    try {
      const res = await fetch("/api/admin/profile-image-upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: file.type }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        uploadUrl?: string;
        key?: string;
        error?: string;
      };
      if (!res.ok || !data.uploadUrl || !data.key) {
        setError(data.error || uploadFailedMessage);
        setUploading(false);
        return;
      }

      const putRes = await fetch(data.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) {
        setError(uploadFailedMessage);
        setUploading(false);
        return;
      }

      setPreviewUrl(URL.createObjectURL(file));
      onImageKeyChange(data.key);
      setUploading(false);
    } catch {
      setError(uploadFailedMessage);
      setUploading(false);
    }
  }

  function handleRemove() {
    setPreviewUrl(null);
    onImageKeyChange(null);
    setError(null);
  }

  return (
    <div>
      <label
        style={{
          fontFamily: sans,
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: C.stone,
          display: "block",
          marginBottom: 6,
        }}
      >
        {label}
      </label>
      <div className="flex items-center" style={{ gap: "12px" }}>
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- local blob preview, next/image doesn't support object URLs
          <img
            src={previewUrl}
            alt=""
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "50%",
              objectFit: "cover",
              flexShrink: 0,
            }}
          />
        ) : (
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "50%",
              backgroundColor: C.subtle,
              flexShrink: 0,
            }}
          />
        )}
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: "transparent",
            border: `1px solid ${C.line}`,
            borderRadius: 2,
            padding: "0 14px",
            height: 36,
            fontFamily: sans,
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: C.dark,
            cursor: disabled || uploading ? "not-allowed" : "pointer",
            opacity: disabled || uploading ? 0.6 : 1,
            outline: "none",
          }}
        >
          {uploading ? (
            <span
              aria-hidden
              style={{
                width: 12,
                height: 12,
                border: `2px solid ${C.stone}`,
                borderTopColor: C.dark,
                borderRadius: "50%",
                animation: "portal-spin 0.8s linear infinite",
                flexShrink: 0,
              }}
            />
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          )}
          {imageKey ? replaceLabel : uploadLabel}
        </button>
        {imageKey && !uploading && (
          <button
            type="button"
            onClick={handleRemove}
            aria-label={removeLabel}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: C.stone,
              padding: 8,
              lineHeight: 0,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED_IMAGE_CONTENT_TYPES.join(",")}
          onChange={handleFileChange}
          style={{ display: "none" }}
        />
      </div>
      {error && (
        <p
          role="alert"
          style={{
            fontFamily: sans,
            fontSize: 12,
            color: C.error,
            marginTop: 6,
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
