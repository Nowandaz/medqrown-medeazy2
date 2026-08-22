import * as React from "react"

import { cn } from "@/lib/utils"
import { TEXT_LIMITS } from "@/lib/text-limits"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, maxLength, ...props }, ref) => {
    // h-9 to match icon buttons and default buttons.
    const defaultMaxLength = type === "email"
      ? TEXT_LIMITS.email
      : type === "password"
        ? TEXT_LIMITS.password
        : type === "number" || type === "checkbox" || type === "file"
          ? undefined
          : TEXT_LIMITS.short;
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        ref={ref}
        maxLength={maxLength ?? defaultMaxLength}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
