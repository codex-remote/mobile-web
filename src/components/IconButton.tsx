import type { ButtonHTMLAttributes, ReactNode } from "react";

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: ReactNode;
  tone?: "default" | "solid" | "danger";
};

export function IconButton({ label, children, tone = "default", className = "", ...props }: IconButtonProps) {
  return (
    <button
      type="button"
      className={`icon-button icon-button-${tone} ${className}`.trim()}
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
    </button>
  );
}
