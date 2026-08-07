interface MedQrownBrandProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function MedQrownBrand({ className = "", size = "md" }: MedQrownBrandProps) {
  const sizes = {
    sm: "text-base sm:text-lg",
    md: "text-xl sm:text-2xl",
    lg: "text-3xl sm:text-5xl",
  };

  return (
    <span className={`font-black tracking-tight leading-none whitespace-nowrap ${sizes[size]} ${className}`}>
      <span className="text-[#17191b] dark:text-foreground">MedQrown</span>{" "}
      <span className="text-[#198a75]">MedEazy</span>
    </span>
  );
}