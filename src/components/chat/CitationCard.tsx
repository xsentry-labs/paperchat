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
    <div className="flex gap-3 rounded-lg border border-border bg-secondary p-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
        {citation.ref}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">
          {citation.filename}
          {citation.page && (
            <span className="ml-1 text-muted-foreground">p.{citation.page}</span>
          )}
        </p>
        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
          &ldquo;{citation.quote}&rdquo;
        </p>
      </div>
    </div>
  );
}
