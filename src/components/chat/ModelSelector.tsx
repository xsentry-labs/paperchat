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
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-hover transition-all duration-150"
      >
        {MODELS[currentModel].label}
        <svg className={`h-2.5 w-2.5 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 bottom-full z-20 mb-1 w-52 rounded-lg border border-border bg-card shadow-xl shadow-black/20 py-1 animate-fade-in">
            {(Object.entries(MODELS) as [ModelKey, typeof MODELS[ModelKey]][]).map(([key, model]) => (
              <button
                key={key}
                onClick={() => { onSelect(key); setOpen(false); }}
                className={`flex w-full flex-col px-3 py-2 text-left transition-colors hover:bg-hover ${
                  currentModel === key ? "bg-hover" : ""
                }`}
              >
                <span className="text-xs text-foreground">{model.label}</span>
                <span className="text-[10px] text-muted-foreground">{model.description}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
