interface Citation {
  ref: number;
  documentId: string;
  filename: string;
  page: number | null;
  quote: string;
}

interface CitationCardProps {
  citation: Citation;
}

export function CitationCard({ citation }: CitationCardProps) {
  return (
    <div className="rounded-md border border-border/60 bg-card/40 px-3 py-2 transition-colors hover:bg-card/80">
      <div className="flex items-start gap-2">
        <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded text-[9px] font-medium text-muted-foreground bg-hover">
          {citation.ref}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-foreground/70 truncate">
            {citation.filename}
            {citation.page && (
              <span className="text-muted-foreground/60 ml-1">p.{citation.page}</span>
            )}
          </p>
          <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground/50 line-clamp-2">
            {citation.quote}
          </p>
        </div>
      </div>
    </div>
  );
}
