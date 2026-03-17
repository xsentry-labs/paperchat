import { createOpenAI } from "@ai-sdk/openai";

export const MODELS = {
  fast: {
    id: "openai/gpt-4.1-mini",
    label: "GPT-4.1 mini",
    description: "Fast and cheap — default",
  },
  quality: {
    id: "anthropic/claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    description: "Best citation accuracy",
  },
  longdoc: {
    id: "google/gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    description: "Many large documents",
  },
} as const;

export type ModelKey = keyof typeof MODELS;

/**
 * Create an OpenRouter-compatible provider using Vercel AI SDK.
 */
export function createLLMProvider() {
  return createOpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY,
  });
}

export const SYSTEM_PROMPT = `You are a document assistant. Answer ONLY from the provided context.
Reference sources inline as [1], [2], etc. matching the context block numbers.
Each reference must correspond to a real context block.
If the answer is not in the context, say "I couldn't find that in your documents."
Never answer from outside knowledge.`;
