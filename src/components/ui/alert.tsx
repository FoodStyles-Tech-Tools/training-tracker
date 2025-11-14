import { cva, VariantProps } from "class-variance-authority";
import { forwardRef, HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const alertVariants = cva(
  "rounded-lg border px-4 py-3 text-sm shadow-lg shadow-black/10 transition-colors",
  {
    variants: {
      variant: {
        success:
          "border-green-500 bg-green-500 text-white dark:border-green-500/40 dark:bg-green-500/15 dark:text-green-100",
        error:
          "border-red-500 bg-red-500 text-white dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-100",
        info:
          "border-blue-500 bg-blue-500 text-white dark:border-blue-500/40 dark:bg-blue-500/15 dark:text-blue-100",
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

