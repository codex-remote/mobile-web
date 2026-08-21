import type { CSSProperties } from "react";

type ProjectMarkProps = {
  name: string;
  accent: string;
  size?: "small" | "medium";
};

export function ProjectMark({ name, accent, size = "medium" }: ProjectMarkProps) {
  const letters = name
    .split(/[-_\s]+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <span className={`project-mark project-mark-${size}`} style={{ "--project-accent": accent } as CSSProperties}>
      {letters}
    </span>
  );
}
