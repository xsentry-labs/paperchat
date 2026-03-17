import type { DocumentStatus } from "@/lib/types";

interface StatusDotProps {
  status: DocumentStatus;
}

const statusConfig: Record<DocumentStatus, { color: string; pulse: boolean; title: string }> = {
  pending: { color: "bg-amber-400", pulse: true, title: "Pending processing" },
  processing: { color: "bg-amber-400", pulse: true, title: "Processing..." },
  ready: { color: "bg-green-400", pulse: false, title: "Ready to chat" },
  error: { color: "bg-red-400", pulse: false, title: "Processing failed" },
};

export function StatusDot({ status }: StatusDotProps) {
  const config = statusConfig[status];

  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${config.color} ${config.pulse ? "animate-pulse-dot" : ""}`}
      title={config.title}
    />
  );
}
