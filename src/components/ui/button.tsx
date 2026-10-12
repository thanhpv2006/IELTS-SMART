import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-brand-500 text-primary-foreground shadow-sm hover:bg-brand-600",
        outline:
          "border border-ink-300 bg-white text-ink-700 hover:bg-ink-50",
        secondary:
          "bg-ink-100 text-ink-700 hover:bg-ink-200",
        ghost:
          "text-ink-600 hover:bg-ink-50 hover:text-ink-900",
        soft:
          "border border-brand-200 bg-brand-50 text-brand-600 hover:bg-brand-100",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:opacity-90",
        link:
          "text-brand-600 underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-[13px] [&_svg]:size-4",
        default: "h-10 px-4 [&_svg]:size-[17px]",
        lg: "h-11 px-5 [&_svg]:size-[18px]",
        icon: "size-10 [&_svg]:size-[18px]",
        "icon-sm": "size-8 [&_svg]:size-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
