import medqrownIcon from "@/assets/medqrown-icon.png";

interface MedQrownBrandProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function MedQrownBrand({ className = "", size = "md" }: MedQrownBrandProps) {
  const config = {
    sm: { icon: "h-7 w-7",  text: "text-base" },
    md: { icon: "h-8 w-8",  text: "text-lg" },
    lg: { icon: "h-10 w-10", text: "text-xl sm:text-2xl" },
  }[size];

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <img
        src={medqrownIcon}
        alt="MedQrown"
        className={`${config.icon} object-contain shrink-0`}
      />
      <span
        className={`font-black tracking-tight leading-none whitespace-nowrap ${config.text}`}
      >
        <span className="text-[#17191b] dark:text-foreground">MedQrown</span>{" "}
        <span className="text-[#198a75]">MedEazy</span>
      </span>
    </span>
  );
}
