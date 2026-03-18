interface FileIconProps {
  mimeType: string;
}

const iconConfig: Record<string, { color: string; label: string }> = {
  "application/pdf": { color: "text-red-400/70", label: "PDF" },
  "text/plain": { color: "text-foreground/40", label: "TXT" },
  "text/markdown": { color: "text-foreground/40", label: "MD" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    color: "text-blue-400/70",
    label: "DOC",
  },
};

export function FileIcon({ mimeType }: FileIconProps) {
  const config = iconConfig[mimeType] ?? { color: "text-muted-foreground", label: "FILE" };
  return (
    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded bg-hover text-[9px] font-medium ${config.color}`}>
      {config.label}
    </div>
  );
}
