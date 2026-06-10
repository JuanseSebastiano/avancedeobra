import * as React from "react";
import { cn } from "@/lib/utils";

const variants = {
  default: "bg-zinc-900 text-white hover:bg-zinc-700",
  outline: "border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50",
  ghost: "text-zinc-700 hover:bg-zinc-100",
  destructive: "bg-red-600 text-white hover:bg-red-500",
} as const;

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
  size?: "default" | "sm";
};

export function Button({ className, variant = "default", size = "default", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
        size === "sm" ? "h-8 px-3 text-xs" : "h-10 px-4 text-sm",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
