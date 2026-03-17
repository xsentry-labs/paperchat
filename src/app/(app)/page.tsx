export default function HomePage() {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center px-6">
      <div className="max-w-lg space-y-6">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <svg
            className="h-8 w-8 text-primary"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
            />
          </svg>
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold text-foreground">
            Welcome to paperchat
          </h2>
          <p className="text-muted-foreground">
            Upload a document from the sidebar, then click it to start a
            conversation. Ask questions and get cited answers powered by AI.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-3 text-xs text-muted-foreground">
          <span className="rounded-full border border-border px-3 py-1">PDF</span>
          <span className="rounded-full border border-border px-3 py-1">TXT</span>
          <span className="rounded-full border border-border px-3 py-1">Markdown</span>
          <span className="rounded-full border border-border px-3 py-1">DOCX</span>
        </div>
      </div>
    </div>
  );
}
