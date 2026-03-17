"use client";

import { useRef } from "react";
import { ACCEPTED_EXTENSIONS } from "@/lib/constants";
import { Button } from "@/components/ui/button";

interface UploadButtonProps {
  onFileSelect: (file: File) => void;
  loading: boolean;
}

export function UploadButton({ onFileSelect, loading }: UploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      onFileSelect(file);
      // Reset input so the same file can be re-selected
      e.target.value = "";
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS.join(",")}
        onChange={handleChange}
        className="hidden"
      />
      <Button
        variant="secondary"
        size="sm"
        loading={loading}
        onClick={() => inputRef.current?.click()}
        className="w-full"
      >
        Upload document
      </Button>
    </>
  );
}
