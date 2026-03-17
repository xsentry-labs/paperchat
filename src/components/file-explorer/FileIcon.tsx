interface FileIconProps {
  mimeType: string;
}

const iconConfig: Record<string, { color: string; label: string }> = {
  "application/pdf": { color: "text-red-400", label: "PDF" },
  "text/plain": { color: "text-blue-400", label: "TXT" },
  "text/markdown": { color: "text-purple-400", label: "MD" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    color: "text-blue-500",
    label: "DOC",
  },
};

export function FileIcon({ mimeType }: FileIconProps) {
  const config = iconConfig[mimeType] ?? { color: "text-muted-foreground", label: "FILE" };

  return (
    <div
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded bg-secondary text-xs font-bold ${config.color}`}
    >
      {config.label}
    </div>
  );
}
