import { streamText } from "ai";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { retrieveChunksHybrid, type RetrievedChunk } from "@/lib/retrieval";
import { createLLMProvider, SYSTEM_PROMPT } from "@/lib/llm";
import { getModelById, DEFAULT_MODEL_ID } from "@/lib/models";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  writeAgentLog,
  chunksToLogPayload,
  type AgentStep,
} from "@/lib/agent-logger";

export const maxDuration = 30;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

  const body = await request.json();
  const conversationId = body.conversationId;

  // Extract the latest user message from the messages array sent by useChat
  const messages = body.messages ?? [];
  const lastUserMessage = [...messages].reverse().find(
    (m: { role: string }) => m.role === "user"
  );

  // Get question text from parts or content
  let question = "";
  if (lastUserMessage?.parts) {
    question = lastUserMessage.parts
      .filter((p: { type: string }) => p.type === "text")
      .map((p: { text: string }) => p.text)
      .join("");
  } else if (lastUserMessage?.content) {
    question = lastUserMessage.content;
  }

  if (!question || !conversationId) {
    return new Response(
      JSON.stringify({ error: "question and conversationId required" }),
      { status: 400 }
    );
  }

  // Rate limiting
  const rateLimit = await checkRateLimit(user.id);
  if (!rateLimit.allowed) {
    return new Response(
      JSON.stringify({
        error: "daily_limit_reached",
        limit: rateLimit.limit,
        remaining: 0,
        resetsAt: rateLimit.resetsAt,
      }),
      { status: 429 }
    );
  }

  // Get conversation
  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select("document_id")
    .eq("id", conversationId)
    .single();

  if (convError || !conversation) {
    return new Response(JSON.stringify({ error: "Conversation not found" }), {
      status: 404,
    });
  }

  // Get user's preferred model (stored as model ID string)
  const { data: profile } = await supabase
    .from("profiles")
    .select("preferred_model")
    .eq("id", user.id)
    .single();

  const preferredModelId = profile?.preferred_model ?? DEFAULT_MODEL_ID;
  const modelDef = getModelById(preferredModelId);
  // Fall back to default if stored model ID is no longer in registry
  const modelId = modelDef ? preferredModelId : DEFAULT_MODEL_ID;

  // ── Hybrid retrieval with timing ─────────────────────────────────────────
  const docIds = conversation.document_id ? [conversation.document_id] : [];
  const steps: AgentStep[] = [];

  const t0 = Date.now();
  const { chunks, entitiesUsed } = await retrieveChunksHybrid(
    question,
    docIds,
    user.id
  );
  const retrievalMs = Date.now() - t0;

  // Count initial vs expanded
  const initialCount = Math.min(chunks.length, 6);
  const expandedCount = chunks.length - initialCount;

  steps.push({
    step: "retrieval",
    duration_ms: retrievalMs,
    meta: {
      chunks_found: initialCount,
      entities_found: entitiesUsed.length,
      expanded_chunks: expandedCount,
    },
  });

  if (expandedCount > 0) {
    steps.push({
      step: "graph_expansion",
      duration_ms: 0, // included in retrieval timing
      meta: { extra_chunks: expandedCount },
    });
  }

  // Build context string (may be empty if no docs uploaded)
  const contextBlocks = chunks
    .map(
      (chunk: RetrievedChunk, i: number) =>
        `[${i + 1}] (${chunk.filename}, p.${chunk.page ?? "?"})\n${chunk.content}`
    )
    .join("\n\n");

  const hasContext = chunks.length > 0;

  // Save user message
  const admin = createAdminClient();
  await admin.from("chat_messages").insert({
    conversation_id: conversationId,
    role: "user",
    content: question,
  });

  // Stream LLM response
  const provider = createLLMProvider();
  const model = provider(modelId);

  const tGen = Date.now();

  const result = streamText({
    model,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: hasContext
          ? `Context:\n${contextBlocks}\n\nQuestion: ${question}`
          : question,
      },
    ],
    async onFinish({ text }) {
      const genMs = Date.now() - tGen;
      steps.push({ step: "generation", duration_ms: genMs });

      // Extract citation references [1], [2], etc.
      const citationRefs = [...text.matchAll(/\[(\d+)\]/g)].map((m) =>
        parseInt(m[1], 10)
      );
      const uniqueRefs = [...new Set(citationRefs)];

      const sources = uniqueRefs
        .filter((ref) => ref >= 1 && ref <= chunks.length)
        .map((ref) => {
          const chunk = chunks[ref - 1];
          return {
            ref,
            documentId: chunk.documentId,
            filename: chunk.filename,
            page: chunk.page,
            quote: chunk.content.slice(0, 500),
          };
        });

      // Save assistant message with citations
      await admin.from("chat_messages").insert({
        conversation_id: conversationId,
        role: "assistant",
        content: text,
        sources,
      });

      // Update conversation timestamp
      await admin
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversationId);

      // Write agent activity log (fire-and-forget)
      writeAgentLog({
        userId: user.id,
        conversationId,
        userQuery: question,
        retrievedChunks: chunksToLogPayload(chunks),
        entitiesUsed,
        steps,
        finalOutput: text,
        modelUsed: modelId,
      });
    },
  });

  return result.toUIMessageStreamResponse();
}
