import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, onWheel, onKeyDown, step, ...props }, ref) => {
    const handleWheel = (event: React.WheelEvent<HTMLInputElement>) => {
      onWheel?.(event);

      if (event.defaultPrevented || type !== "number") return;
      if (document.activeElement !== event.currentTarget) return;

      // Prevent accidental value changes from mouse-wheel scroll while the input is focused.
      event.currentTarget.blur();
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
      onKeyDown?.(event);

      if (event.defaultPrevented || type !== "number") return;
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;

      const input = event.currentTarget;
      const currentValue = Number(input.value || 0);
      if (!Number.isFinite(currentValue)) return;

      const min = input.min === "" ? Number.NEGATIVE_INFINITY : Number(input.min);
      const max = input.max === "" ? Number.POSITIVE_INFINITY : Number(input.max);
      const direction = event.key === "ArrowUp" ? 1 : -1;
      const baseValue = direction > 0 ? Math.floor(currentValue) : Math.ceil(currentValue);
      const nextValue = Math.min(Math.max(baseValue + direction, min), max);

      event.preventDefault();

      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      valueSetter?.call(input, String(nextValue));
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };

    // h-9 to match icon buttons and default buttons.
    return (
      <input
        type={type}
        step={type === "number" ? step ?? "1" : step}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        ref={ref}
        onWheel={handleWheel}
        onKeyDown={handleKeyDown}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
