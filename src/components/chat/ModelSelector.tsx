"use client";

import { useState } from "react";
import { MODELS, type ModelKey } from "@/lib/llm";

interface ModelSelectorProps {
  currentModel: ModelKey;
  onSelect: (model: ModelKey) => void;
}

export function ModelSelector({ currentModel, onSelect }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs text-foreground hover:bg-secondary/80 transition-colors"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
        {MODELS[currentModel].label}
        <svg
          className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 z-20 mb-2 w-64 rounded-lg border border-border bg-card shadow-lg">
            {(Object.entries(MODELS) as [ModelKey, typeof MODELS[ModelKey]][]).map(
              ([key, model]) => (
                <button
                  key={key}
                  onClick={() => {
                    onSelect(key);
                    setOpen(false);
                  }}
                  className={`flex w-full flex-col px-4 py-3 text-left transition-colors first:rounded-t-lg last:rounded-b-lg hover:bg-secondary ${
                    currentModel === key ? "bg-secondary" : ""
                  }`}
                >
                  <span className="text-sm font-medium text-foreground">
                    {model.label}
                    {currentModel === key && (
                      <span className="ml-2 text-xs text-primary">active</span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {model.description}
                  </span>
                </button>
              )
            )}
          </div>
        </>
      )}
    </div>
  );
}
