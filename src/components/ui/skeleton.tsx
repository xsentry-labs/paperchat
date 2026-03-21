import type { CSSProperties } from "react";

export function Skeleton({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return (
    <div
      className={`rounded-md bg-foreground/[0.07] animate-shimmer ${className}`}
      style={style}
    />
  );
}
