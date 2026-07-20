"use client";

import { useRef, useState } from "react";
import { Loader2, Upload, X } from "lucide-react";
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
}

export function ProfileImageUpload({
  label,
  imageKey,
  onImageKeyChange,
  disabled,
  invalidTypeMessage,
  tooLargeMessage,
  uploadFailedMessage,
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
          display: "block",
          marginBottom: "8px",
          fontFamily: "var(--font-inter), 'Inter', sans-serif",
          fontSize: "13px",
          fontWeight: 500,
          letterSpacing: "0.05em",
          color: "var(--tellian-stone)",
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
              backgroundColor: "var(--tellian-subtle)",
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
            gap: "6px",
            background: "transparent",
            border: "1px solid var(--tellian-line)",
            padding: "0 14px",
            height: "36px",
            fontFamily: "var(--font-inter), 'Inter', sans-serif",
            fontSize: "11px",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--tellian-dark)",
            cursor: disabled || uploading ? "not-allowed" : "pointer",
            opacity: disabled || uploading ? 0.6 : 1,
          }}
        >
          {uploading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Upload size={14} />
          )}
          {imageKey ? "Replace" : "Upload"}
        </button>
        {imageKey && !uploading && (
          <button
            type="button"
            onClick={handleRemove}
            aria-label="Remove"
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--tellian-stone)",
            }}
          >
            <X size={16} />
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
            fontFamily: "var(--font-inter), 'Inter', sans-serif",
            fontSize: "12px",
            color: "var(--tellian-error)",
            marginTop: "6px",
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
