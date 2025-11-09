import * as React from "react";

import { cn } from "@/lib/utils";

export type CheckboxProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      type="checkbox"
      className={cn(
        "h-4 w-4 border border-slate-700 bg-slate-600/50",
        "accent-blue-600",
        "focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "cursor-pointer",
        className,
      )}
      {...props}
    />
  ),
);

Checkbox.displayName = "Checkbox";
