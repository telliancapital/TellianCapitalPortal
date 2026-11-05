"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/lib/i18n";
import { C, sans, serif } from "@/lib/tokens";
import { DURATION } from "@/lib/motion";

/* ═══════════════════════════════════════════════════════════
   IMAGE CROP DIALOG — frames a profile photo for the round
   avatar. The admin drags and zooms the photo inside a circle;
   the result is exported as a square JPEG, so whatever the
   original shape or headroom, the stored image always fits.
   Rendered in a portal: the user modal it opens from is
   transformed, which would otherwise trap `position: fixed`.
   ═══════════════════════════════════════════════════════════ */

const MAX_VIEW = 280; // on-screen crop square (px) on normal screens
const DIALOG_CHROME = 66; // dialog padding (2×32) + border (2×1)
const OUTPUT = 512; // exported square (px), never upscaled
const MAX_ZOOM = 4;
const NUDGE = 8;

interface Offset {
  x: number;
  y: number;
}

interface Props {
  file: File;
  onConfirm: (blob: Blob) => void;
  onCancel: () => void;
}

export function ImageCropDialog({ file, onConfirm, onCancel }: Props) {
  const { t } = useI18n();
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [exporting, setExporting] = useState(false);
  const drag = useRef<{ pointerId: number; startX: number; startY: number; origin: Offset } | null>(null);
  const applyRef = useRef<HTMLButtonElement>(null);
  /* Crop square size, fixed for the life of the dialog; smaller on narrow
     phones so the dialog still fits. All offsets are in these pixels. */
  const [VIEW] = useState(() =>
    typeof window === "undefined"
      ? MAX_VIEW
      : Math.max(160, Math.min(MAX_VIEW, window.innerWidth - 32 - DIALOG_CHROME)),
  );

  /* Decode the file. An <img> applies EXIF orientation, so phone photos
     come out upright both on screen and on the export canvas. */
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    let cancelled = false;
    img.onload = () => {
      if (cancelled) return;
      const base = VIEW / Math.min(img.naturalWidth, img.naturalHeight);
      setImage(img);
      setZoom(1);
      // Start centred horizontally and at the top: the usual place for a
      // face in a portrait photo. The admin adjusts from there.
      setOffset({ x: (VIEW - img.naturalWidth * base) / 2, y: 0 });
    };
    img.onerror = () => {
      if (!cancelled) setFailed(true);
    };
    img.src = url;
    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [file, VIEW]);

  useEffect(() => {
    if (image) applyRef.current?.focus();
  }, [image]);

  const baseScale = image ? VIEW / Math.min(image.naturalWidth, image.naturalHeight) : 1;
  const scale = baseScale * zoom;
  const width = image ? image.naturalWidth * scale : VIEW;
  const height = image ? image.naturalHeight * scale : VIEW;

  /* The photo must always cover the crop square — no empty edges. */
  const clamp = useCallback(
    (next: Offset, w: number, h: number): Offset => ({
      x: Math.min(0, Math.max(VIEW - w, next.x)),
      y: Math.min(0, Math.max(VIEW - h, next.y)),
    }),
    [VIEW],
  );

  function changeZoom(nextZoom: number) {
    if (!image) return;
    const z = Math.min(MAX_ZOOM, Math.max(1, nextZoom));
    const nextScale = baseScale * z;
    // Keep the point under the centre of the circle fixed while zooming.
    const centreX = (VIEW / 2 - offset.x) / scale;
    const centreY = (VIEW / 2 - offset.y) / scale;
    setZoom(z);
    setOffset(
      clamp(
        { x: VIEW / 2 - centreX * nextScale, y: VIEW / 2 - centreY * nextScale },
        image.naturalWidth * nextScale,
        image.naturalHeight * nextScale,
      ),
    );
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!image || exporting) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, origin: offset };
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    setOffset(
      clamp(
        { x: d.origin.x + (e.clientX - d.startX), y: d.origin.y + (e.clientY - d.startY) },
        width,
        height,
      ),
    );
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId === e.pointerId) drag.current = null;
  }

  function handleViewKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const step: Record<string, Offset> = {
      ArrowLeft: { x: NUDGE, y: 0 },
      ArrowRight: { x: -NUDGE, y: 0 },
      ArrowUp: { x: 0, y: NUDGE },
      ArrowDown: { x: 0, y: -NUDGE },
    };
    const delta = step[e.key];
    if (delta) {
      e.preventDefault();
      setOffset((prev) => clamp({ x: prev.x + delta.x, y: prev.y + delta.y }, width, height));
    } else if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      changeZoom(zoom + 0.1);
    } else if (e.key === "-") {
      e.preventDefault();
      changeZoom(zoom - 0.1);
    }
  }

  function handleApply() {
    if (!image || exporting) return;
    const sourceSize = VIEW / scale;
    const size = Math.max(1, Math.min(OUTPUT, Math.round(sourceSize)));
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setFailed(true);
      return;
    }
    // JPEG has no alpha — transparent PNG/WebP areas become white.
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, size, size);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, -offset.x / scale, -offset.y / scale, sourceSize, sourceSize, 0, 0, size, size);
    setExporting(true);
    canvas.toBlob(
      (blob) => {
        setExporting(false);
        if (blob) onConfirm(blob);
        else setFailed(true);
      },
      "image/jpeg",
      0.9,
    );
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      <div
        aria-hidden
        onClick={exporting ? undefined : onCancel}
        style={{ position: "fixed", inset: 0, zIndex: 10100, backgroundColor: "rgba(0,0,0,0.25)" }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="crop-title"
        onKeyDown={(e) => {
          // Don't let Escape / arrows reach the user modal underneath.
          e.stopPropagation();
          if (e.key === "Escape" && !exporting) onCancel();
        }}
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 10101,
          backgroundColor: C.bg,
          border: `1px solid ${C.line}`,
          borderRadius: 8,
          padding: 32,
          width: VIEW + DIALOG_CHROME,
          maxHeight: "calc(100vh - 32px)",
          overflowY: "auto",
          boxShadow: "0 20px 60px rgba(0,0,0,0.12)",
          boxSizing: "border-box",
        }}
      >
        <h2
          id="crop-title"
          style={{ fontFamily: serif, fontSize: 22, lineHeight: 1.2, color: C.dark, fontWeight: 400, fontStyle: "italic", margin: 0 }}
        >
          {t("admin.modal.image.crop.title")}
        </h2>
        <p style={{ fontFamily: sans, fontSize: 13, color: C.stoneText, lineHeight: 1.5, margin: "10px 0 0 0" }}>
          {failed ? t("admin.modal.image.crop.failed") : t("admin.modal.image.crop.hint")}
        </p>

        {!failed && (
          <>
            <div
              role="application"
              tabIndex={0}
              aria-label={t("admin.modal.image.crop.hint")}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onKeyDown={handleViewKeyDown}
              className="tellian-crop-view"
              style={{
                position: "relative",
                width: VIEW,
                height: VIEW,
                margin: "20px auto 0",
                overflow: "hidden",
                backgroundColor: C.subtle,
                cursor: image ? "grab" : "default",
                touchAction: "none",
                userSelect: "none",
              }}
            >
              {image && (
                // eslint-disable-next-line @next/next/no-img-element -- local blob being cropped
                <img
                  src={image.src}
                  alt=""
                  draggable={false}
                  style={{
                    position: "absolute",
                    left: offset.x,
                    top: offset.y,
                    width,
                    height,
                    maxWidth: "none",
                    pointerEvents: "none",
                  }}
                />
              )}
              {/* Circle = what the customer sees; the rest is dimmed. */}
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: "50%",
                  boxShadow: "0 0 0 9999px rgba(244,244,240,0.72)",
                  outline: `1.5px solid ${C.bg}`,
                  pointerEvents: "none",
                }}
              />
            </div>

            <label
              htmlFor="crop-zoom"
              style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 20, fontFamily: sans, fontSize: 11, fontWeight: 500, letterSpacing: "0.12em", textTransform: "uppercase", color: C.stone }}
            >
              {t("admin.modal.image.crop.zoom")}
              <input
                id="crop-zoom"
                type="range"
                min={1}
                max={MAX_ZOOM}
                step={0.01}
                value={zoom}
                disabled={!image || exporting}
                onChange={(e) => changeZoom(Number(e.target.value))}
                style={{ flex: 1, accentColor: C.purple, cursor: "pointer" }}
              />
            </label>
          </>
        )}

        <div style={{ display: "flex", gap: 12, marginTop: 28, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={exporting}
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
              cursor: exporting ? "not-allowed" : "pointer",
              minHeight: 44,
            }}
          >
            {t("admin.modal.cancel")}
          </button>
          {!failed && (
            <button
              ref={applyRef}
              type="button"
              onClick={handleApply}
              disabled={!image || exporting}
              style={{
                fontFamily: sans,
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: C.dark,
                backgroundColor: C.button,
                border: `1px solid ${C.button}`,
                borderRadius: 0,
                padding: "12px 20px",
                cursor: !image || exporting ? "not-allowed" : "pointer",
                opacity: !image || exporting ? 0.7 : 1,
                minHeight: 44,
                transition: `background-color ${DURATION.fast}ms ease`,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = C.buttonHover)}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = C.button)}
            >
              {t("admin.modal.image.crop.apply")}
            </button>
          )}
        </div>
        <style>{`
          .tellian-crop-view:active { cursor: grabbing; }
          .tellian-crop-view:focus-visible { outline: 2px solid ${C.purple}; outline-offset: 2px; }
        `}</style>
      </div>
    </>,
    document.body,
  );
}
