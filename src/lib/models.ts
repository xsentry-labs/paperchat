/**
 * Model registry - comprehensive list of models available via OpenRouter.
 *
 * Usage:
 *   - Set OPENROUTER_API_KEY in .env to use OpenRouter (access to all models below)
 *   - Set OPENAI_API_KEY in .env to use OpenAI directly (OpenAI models only)
 *   - If both are set, OpenRouter takes precedence
 *
 * Model IDs are OpenRouter-compatible (provider/model-name format).
 * When using OpenAI directly, only models with provider="openai" work.
 *
 * To test a new model: update .env with your key and select the model in UI.
 */

export type ModelProvider =
  | "openai"
  | "anthropic"
  | "google"
  | "meta"
  | "mistral"
  | "deepseek";

export type CostTier = "free" | "cheap" | "mid" | "premium";

export interface ModelDefinition {
  id: string;            // OpenRouter model ID (used in API calls)
  label: string;         // Display name in UI
  description: string;   // Short description
  provider: ModelProvider;
  costTier: CostTier;
  contextK: number;      // Context window in thousands of tokens
}

export const ALL_MODELS: ModelDefinition[] = [
  // ── OpenAI ──────────────────────────────────────────────────────────────
  {
    id: "gpt-4.1-mini",
    label: "GPT-4.1 mini",
    description: "Fast, everyday queries",
    provider: "openai",
    costTier: "cheap",
    contextK: 128,
  },
  {
    id: "gpt-4.1-nano",
    label: "GPT-4.1 nano",
    description: "Ultra-lightweight, instant answers",
    provider: "openai",
    costTier: "cheap",
    contextK: 128,
  },
  {
    id: "gpt-4.1",
    label: "GPT-4.1",
    description: "Best OpenAI accuracy",
    provider: "openai",
    costTier: "premium",
    contextK: 128,
  },
  {
    id: "gpt-5.4-mini-2026-03-17",
    label: "GPT-5.4 mini",
    description: "Latest OpenAI model",
    provider: "openai",
    costTier: "mid",
    contextK: 128,
  },
  {
    id: "openai/o4-mini",
    label: "o4 mini",
    description: "OpenAI reasoning model (fast)",
    provider: "openai",
    costTier: "mid",
    contextK: 128,
  },
  // ── Anthropic ────────────────────────────────────────────────────────────
  {
    id: "anthropic/claude-sonnet-4-5",
    label: "Claude Sonnet 4.5",
    description: "Anthropic - smart & balanced",
    provider: "anthropic",
    costTier: "mid",
    contextK: 200,
  },
  {
    id: "anthropic/claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    description: "Anthropic - fastest Claude",
    provider: "anthropic",
    costTier: "cheap",
    contextK: 200,
  },
  {
    id: "anthropic/claude-opus-4",
    label: "Claude Opus 4",
    description: "Anthropic - most capable",
    provider: "anthropic",
    costTier: "premium",
    contextK: 200,
  },
  // ── Google ───────────────────────────────────────────────────────────────
  {
    id: "google/gemini-2.0-flash-001",
    label: "Gemini 2.0 Flash",
    description: "Google - fast multimodal",
    provider: "google",
    costTier: "cheap",
    contextK: 1000,
  },
  {
    id: "google/gemini-2.5-pro-preview-03-25",
    label: "Gemini 2.5 Pro",
    description: "Google - long context, powerful",
    provider: "google",
    costTier: "premium",
    contextK: 1000,
  },
  // ── Meta (Llama) ──────────────────────────────────────────────────────────
  {
    id: "meta-llama/llama-3.3-70b-instruct",
    label: "Llama 3.3 70B",
    description: "Meta open-weight, strong performance",
    provider: "meta",
    costTier: "mid",
    contextK: 128,
  },
  {
    id: "meta-llama/llama-3.1-8b-instruct",
    label: "Llama 3.1 8B",
    description: "Meta open-weight, lightweight",
    provider: "meta",
    costTier: "cheap",
    contextK: 128,
  },
  // ── Mistral ──────────────────────────────────────────────────────────────
  {
    id: "mistralai/mistral-small-3.1-24b-instruct",
    label: "Mistral Small 3.1",
    description: "Mistral - efficient & capable",
    provider: "mistral",
    costTier: "cheap",
    contextK: 128,
  },
  // ── DeepSeek ─────────────────────────────────────────────────────────────
  {
    id: "deepseek/deepseek-chat-v3-0324",
    label: "DeepSeek V3",
    description: "DeepSeek - strong reasoning, low cost",
    provider: "deepseek",
    costTier: "cheap",
    contextK: 64,
  },
  {
    id: "deepseek/deepseek-r1",
    label: "DeepSeek R1",
    description: "DeepSeek - advanced reasoning",
    provider: "deepseek",
    costTier: "mid",
    contextK: 64,
  },
];

// Default model when no preference is set
export const DEFAULT_MODEL_ID = "gpt-4.1-mini";

export function getModelById(id: string): ModelDefinition | undefined {
  return ALL_MODELS.find((m) => m.id === id);
}

export const COST_TIER_LABELS: Record<CostTier, string> = {
  free: "Free",
  cheap: "Low cost",
  mid: "Mid",
  premium: "Premium",
};

export const PROVIDER_LABELS: Record<ModelProvider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  meta: "Meta",
  mistral: "Mistral",
  deepseek: "DeepSeek",
};
