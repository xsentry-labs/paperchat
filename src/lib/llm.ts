/**
 * LLM provider abstraction.
 *
 * Supports two backends - configured via environment variables:
 *   OPENROUTER_API_KEY  → routes through OpenRouter (all models in models.ts)
 *   OPENAI_API_KEY      → direct OpenAI API (OpenAI models only)
 *
 * OpenRouter exposes an OpenAI-compatible API, so @ai-sdk/openai works for both.
 * If both keys are present, OpenRouter takes precedence.
 *
 * Model IDs are managed in src/lib/models.ts.
 * This file only owns the provider factory + system prompt.
 */

import { createOpenAI } from "@ai-sdk/openai";

// Re-export legacy MODELS shape so existing code that imports from llm.ts still works.
// New code should import from models.ts directly.
export { DEFAULT_MODEL_ID } from "@/lib/models";

// Legacy ModelKey type - kept for compatibility with profile/model selector
export type ModelKey = string;

/**
 * Create the AI SDK provider, pointed at either OpenRouter or OpenAI.
 */
export function createLLMProvider() {
  if (process.env.OPENROUTER_API_KEY) {
    return createOpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
      // OpenRouter recommends these headers for rate-limit tracking
      headers: {
        "HTTP-Referer": "https://paperchat.app",
        "X-Title": "Paperchat",
      },
    });
  }

  // Fallback: direct OpenAI
  return createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

export const SYSTEM_PROMPT = `You are a helpful, general-purpose assistant. You can answer questions on any topic using your own knowledge.

When document context blocks are provided below, use them to give grounded answers and cite sources inline as [1], [2], etc. matching the context block numbers. Prefer document context over your own knowledge when it is relevant. Do not mention having "access" to documents or describe which blocks you have - just answer naturally.

If no document context is provided, or the context is not relevant to the question, answer freely using your general knowledge. Be direct and concise.`;
