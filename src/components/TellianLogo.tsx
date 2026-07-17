import type { CSSProperties } from "react";
import logoSrc from "@/assets/logo/tellian-logo.svg";

interface TellianLogoProps {
  width?: string | number;
  style?: CSSProperties;
  className?: string;
  "aria-label"?: string;
}

export function TellianLogo({
  width,
  style,
  className,
  "aria-label": ariaLabel = "Tellian Capital",
}: TellianLogoProps) {
  // The brand SVG has a baked-in Imperial Purple fill (not currentColor), so
  // `style.color` is accepted for API compatibility but no longer recolors it.
  return (
    // eslint-disable-next-line @next/next/no-img-element -- fixed decorative brand asset, no next/image benefit
    <img
      src={logoSrc.src}
      alt={ariaLabel}
      className={className}
      style={{
        width: width ?? "auto",
        height: "auto",
        display: "block",
        ...style,
      }}
    />
  );
}
