import type { CSSProperties } from "react";
import markSrc from "@/assets/logo/tellian-logo.svg";
import wordmarkSrc from "@/assets/logo/tellian-logo-dunkel.svg";

interface TellianLogoProps {
  /** "mark": square Imperial Purple logo (login, admin header).
   *  "wordmark": wide dark wordmark (client dashboard header, 35px high). */
  variant?: "mark" | "wordmark";
  className?: string;
  style?: CSSProperties;
  "aria-label"?: string;
}

export function TellianLogo({
  variant = "mark",
  className,
  style,
  "aria-label": ariaLabel = "Tellian Capital",
}: TellianLogoProps) {
  const src = variant === "wordmark" ? wordmarkSrc.src : markSrc.src;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- fixed brand asset, no next/image benefit
    <img
      src={src}
      alt={ariaLabel}
      className={className}
      style={{ display: "block", width: "auto", objectFit: "contain", objectPosition: "left", alignSelf: "flex-start", ...style }}
    />
  );
}
