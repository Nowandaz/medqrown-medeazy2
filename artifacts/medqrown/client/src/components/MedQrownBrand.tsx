import medqrownIcon from "@/assets/medqrown-icon.png";

interface MedQrownBrandProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  /** "inline" (default): icon left of text. "stacked": icon centered above text. */
  layout?: "inline" | "stacked";
  /** Override the icon's size classes (stacked layout only). */
  iconClassName?: string;
}

export function MedQrownBrand({ className = "", size = "md", layout = "inline", iconClassName }: MedQrownBrandProps) {
  const iconSizes = iconClassName ?? {
    sm: "h-7 w-7",
    md: "h-8 w-8",
    // stacked heroes get a larger icon; inline lg keeps the compact size
    lg: layout === "stacked" ? "h-20 w-20 sm:h-24 sm:w-24" : "h-10 w-10",
  }[size];

  const textSizes = {
    sm: "text-base",
    md: "text-lg",
    lg: "text-xl sm:text-2xl",
  }[size];

  if (layout === "stacked") {
    return (
      <span className={`inline-flex flex-col items-center gap-3 ${className}`}>
        <img
          src={medqrownIcon}
          alt="MedQrown"
          className={`${iconSizes} object-contain drop-shadow-md`}
        />
        <span className={`font-black tracking-tight leading-none whitespace-nowrap ${textSizes}`}>
          <span className="text-[#17191b] dark:text-foreground">MedQrown</span>{" "}
          <span className="text-[#0d9488]">MedEazy</span>
        </span>
      </span>
    );
  }

  // inline (default) — icon left of text
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <img
        src={medqrownIcon}
        alt="MedQrown"
        className={`${iconSizes} object-contain shrink-0`}
      />
      <span className={`font-black tracking-tight leading-none whitespace-nowrap ${textSizes}`}>
        <span className="text-[#17191b] dark:text-foreground">MedQrown</span>{" "}
        <span className="text-[#0d9488]">MedEazy</span>
      </span>
    </span>
  );
}
