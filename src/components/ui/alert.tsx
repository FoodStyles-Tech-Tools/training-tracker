import { cva, VariantProps } from "class-variance-authority";
import { forwardRef, HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const alertVariants = cva(
  "rounded-lg border px-4 py-3 text-sm shadow-lg shadow-black/10",
  {
    variants: {
      variant: {
        success: "border-green-500/40 bg-green-500/10 text-green-200",
        error: "border-red-500/40 bg-red-500/10 text-red-200",
        info: "border-blue-500/40 bg-blue-500/10 text-blue-200",
      },
    },
    defaultVariants: {
      variant: "info",
    },
  },
);

export interface AlertProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {}

export const Alert = forwardRef<HTMLDivElement, AlertProps>(({ className, variant, ...props }, ref) => (
  <div ref={ref} className={cn(alertVariants({ variant }), className)} {...props} />
));

Alert.displayName = "Alert";

