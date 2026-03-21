"use client";

import { useState } from "react";
import {
  ALL_MODELS,
  PROVIDER_LABELS,
  COST_TIER_LABELS,
  DEFAULT_MODEL_ID,
  getModelById,
  type ModelProvider,
} from "@/lib/models";

interface ModelSelectorProps {
  currentModel: string;
  onSelect: (modelId: string) => void;
}

// Group models by provider for display
function groupByProvider(
  models: typeof ALL_MODELS
): Partial<Record<ModelProvider, typeof ALL_MODELS>> {
  const groups: Partial<Record<ModelProvider, typeof ALL_MODELS>> = {};
  for (const m of models) {
    if (!groups[m.provider]) groups[m.provider] = [];
    groups[m.provider]!.push(m);
  }
  return groups;
}

const COST_COLORS: Record<string, string> = {
  free: "text-emerald-500",
  cheap: "text-sky-400",
  mid: "text-amber-400",
  premium: "text-rose-400",
};

export function ModelSelector({ currentModel, onSelect }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);

  const currentDef = getModelById(currentModel);
  const displayLabel = currentDef?.label ?? getModelById(DEFAULT_MODEL_ID)?.label ?? "Model";

  const grouped = groupByProvider(ALL_MODELS);
  const providerOrder: ModelProvider[] = [
    "openai",
    "anthropic",
    "google",
    "meta",
    "mistral",
    "deepseek",
  ];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-hover transition-all duration-150"
      >
        {displayLabel}
        <svg
          className={`h-2.5 w-2.5 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />

          {/* Dropdown */}
          <div className="absolute right-0 bottom-full z-20 mb-1 w-72 max-h-96 overflow-y-auto rounded-lg border border-border bg-card shadow-xl shadow-black/30 py-1 animate-fade-in">
            {/* Note about OpenRouter */}
            <div className="px-3 py-2 border-b border-border/40">
              <p className="text-[9px] text-muted-foreground/50">
                Non-OpenAI models require{" "}
                <code className="text-muted-foreground/70">OPENROUTER_API_KEY</code>
              </p>
            </div>

            {providerOrder.map((provider) => {
              const models = grouped[provider];
              if (!models || models.length === 0) return null;
              return (
                <div key={provider}>
                  {/* Provider header */}
                  <div className="px-3 pt-2 pb-0.5">
                    <span className="text-[9px] uppercase tracking-widest text-muted-foreground/40">
                      {PROVIDER_LABELS[provider]}
                    </span>
                  </div>

                  {models.map((model) => (
                    <button
                      type="button"
                      key={model.id}
                      onClick={() => {
                        onSelect(model.id);
                        setOpen(false);
                      }}
                      className={`flex w-full items-center justify-between px-3 py-1.5 text-left transition-colors hover:bg-hover ${
                        currentModel === model.id ? "bg-hover" : ""
                      }`}
                    >
                      <div>
                        <span className="text-xs text-foreground">{model.label}</span>
                        <p className="text-[10px] text-muted-foreground/50">
                          {model.description}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-0.5 shrink-0 ml-2">
                        <span
                          className={`text-[9px] ${COST_COLORS[model.costTier] ?? "text-muted-foreground"}`}
                        >
                          {COST_TIER_LABELS[model.costTier]}
                        </span>
                        <span className="text-[9px] text-muted-foreground/30">
                          {model.contextK}k ctx
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
