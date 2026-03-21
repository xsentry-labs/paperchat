"use client";

import { useRef } from "react";
import { ACCEPTED_EXTENSIONS } from "@/lib/constants";

interface UploadButtonProps {
  onFileSelect: (files: File[]) => void;
  loading: boolean;
}

export function UploadButton({ onFileSelect, loading }: UploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) { onFileSelect(files); e.target.value = ""; }
  }

  return (
    <>
      <input ref={inputRef} type="file" multiple accept={ACCEPTED_EXTENSIONS.join(",")} onChange={handleChange} className="hidden" />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={loading}
        className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-hover transition-all duration-150 disabled:opacity-40"
      >
        {loading ? (
          <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
          </svg>
        )}
        {loading ? "Uploading..." : "Upload document"}
      </button>
    </>
  );
}
