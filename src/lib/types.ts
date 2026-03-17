export interface Profile {
  id: string;
  email: string;
  preferred_model: string;
  created_at: string;
}

export type DocumentStatus = "pending" | "processing" | "ready" | "error";

export interface Document {
  id: string;
  user_id: string;
  filename: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  status: DocumentStatus;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface Chunk {
  id: string;
  document_id: string;
  content: string;
  embedding: number[] | null;
  chunk_index: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Conversation {
  id: string;
  user_id: string;
  document_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export type ChatMessageRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  conversation_id: string;
  role: ChatMessageRole;
  content: string;
  sources: Record<string, unknown>[] | null;
  created_at: string;
}
