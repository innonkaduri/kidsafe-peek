import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-3 py-1 text-xs font-assistant font-medium transition-colors",
  {
    variants: {
      variant: {
        default:
          "bg-primary/15 text-primary border border-primary/30",
        secondary:
          "bg-secondary text-secondary-foreground border border-border",
        destructive:
          "bg-destructive/15 text-destructive border border-destructive/30",
        outline:
          "text-foreground border border-border",
        success:
          "bg-success/15 text-success border border-success/30",
        warning:
          "bg-warning/15 text-warning border border-warning/30",
        riskLow:
          "badge-risk-low text-primary-foreground shadow-sm",
        riskMedium:
          "badge-risk-medium text-primary-foreground shadow-sm",
        riskHigh:
          "badge-risk-high text-primary-foreground shadow-sm",
        riskCritical:
          "badge-risk-critical text-primary-foreground shadow-sm animate-pulse",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
