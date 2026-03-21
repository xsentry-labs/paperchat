import { describe, it, expect } from "vitest";
import { chunksToLogPayload } from "@/lib/agent-logger";
import type { RetrievedChunk } from "@/lib/retrieval";

const makeChunk = (overrides: Partial<RetrievedChunk> = {}): RetrievedChunk => ({
  id: "chunk-1",
  documentId: "doc-1",
  filename: "test.pdf",
  content: "some content",
  page: 3,
  chunkIndex: 0,
  similarity: 0.876543,
  ...overrides,
});

describe("chunksToLogPayload", () => {
  it("returns empty array for no chunks", () => {
    expect(chunksToLogPayload([])).toEqual([]);
  });

  it("maps chunk fields correctly", () => {
    const chunk = makeChunk();
    const [log] = chunksToLogPayload([chunk]);
    expect(log.id).toBe("chunk-1");
    expect(log.documentId).toBe("doc-1");
    expect(log.filename).toBe("test.pdf");
    expect(log.page).toBe(3);
  });

  it("rounds similarity to 3 decimal places", () => {
    const chunk = makeChunk({ similarity: 0.876543 });
    const [log] = chunksToLogPayload([chunk]);
    expect(log.similarity).toBe(0.877);
  });

  it("handles null page", () => {
    const chunk = makeChunk({ page: null });
    const [log] = chunksToLogPayload([chunk]);
    expect(log.page).toBeNull();
  });

  it("handles multiple chunks preserving order", () => {
    const chunks = [
      makeChunk({ id: "a", similarity: 0.9 }),
      makeChunk({ id: "b", similarity: 0.7 }),
      makeChunk({ id: "c", similarity: 0.5 }),
    ];
    const logs = chunksToLogPayload(chunks);
    expect(logs.map((l) => l.id)).toEqual(["a", "b", "c"]);
  });

  it("does not include content field (keeps logs compact)", () => {
    const chunk = makeChunk({ content: "sensitive text" });
    const [log] = chunksToLogPayload([chunk]);
    expect("content" in log).toBe(false);
  });
});
