import { createOpenAI } from "@ai-sdk/openai";

export const MODELS = {
  fast: {
    id: "gpt-4.1-mini",
    label: "GPT-4.1 mini",
    description: "Fast, everyday queries",
  },
  quality: {
    id: "gpt-4.1",
    label: "GPT-4.1",
    description: "Best accuracy",
  },
  nano: {
    id: "gpt-4.1-nano",
    label: "GPT-4.1 nano",
    description: "Lightweight, quick answers",
  },
  latest: {
    id: "gpt-5.4-mini-2026-03-17",
    label: "GPT-5.4 mini",
    description: "Latest model",
  },
} as const;

export type ModelKey = keyof typeof MODELS;

export function createLLMProvider() {
  return createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

export const SYSTEM_PROMPT = `You are a helpful, general-purpose assistant. You can answer questions on any topic using your own knowledge.

When document context blocks are provided below, use them to give grounded answers and cite sources inline as [1], [2], etc. matching the context block numbers. Prefer document context over your own knowledge when it is relevant. Do not mention having "access" to documents or describe which blocks you have — just answer naturally.

If no document context is provided, or the context is not relevant to the question, answer freely using your general knowledge. Be direct and concise.`;
