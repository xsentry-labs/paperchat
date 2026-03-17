export interface ChunkResult {
  content: string;
  chunkIndex: number;
  metadata: {
    page?: number;
    startChar: number;
    endChar: number;
  };
}

const TARGET_CHUNK_SIZE = 512; // tokens (approx 4 chars per token)
const CHUNK_OVERLAP = 64;
const CHARS_PER_TOKEN = 4;
const TARGET_CHARS = TARGET_CHUNK_SIZE * CHARS_PER_TOKEN;
const OVERLAP_CHARS = CHUNK_OVERLAP * CHARS_PER_TOKEN;

/**
 * Splits text into chunks of ~512 tokens with 64 token overlap.
 * Respects paragraph boundaries and never splits mid-sentence.
 */
export function chunkText(
  text: string,
  pages?: { text: string; page: number }[]
): ChunkResult[] {
  // If we have page-level data, chunk per page then merge
  if (pages && pages.length > 0) {
    return chunkWithPages(pages);
  }

  return chunkPlainText(text);
}

function chunkWithPages(
  pages: { text: string; page: number }[]
): ChunkResult[] {
  const chunks: ChunkResult[] = [];
  let chunkIndex = 0;
  let buffer = "";
  let bufferPage = pages[0]?.page ?? 1;
  let bufferStartChar = 0;
  let globalOffset = 0;

  for (const page of pages) {
    const paragraphs = splitParagraphs(page.text);

    for (const para of paragraphs) {
      if (buffer.length + para.length > TARGET_CHARS && buffer.length > 0) {
        // Flush buffer as a chunk
        chunks.push({
          content: buffer.trim(),
          chunkIndex: chunkIndex++,
          metadata: {
            page: bufferPage,
            startChar: bufferStartChar,
            endChar: bufferStartChar + buffer.length,
          },
        });

        // Keep overlap from end of buffer
        const overlapText = getOverlapText(buffer, OVERLAP_CHARS);
        buffer = overlapText + para;
        bufferStartChar = globalOffset - overlapText.length;
        bufferPage = page.page;
      } else {
        if (buffer.length === 0) {
          bufferPage = page.page;
          bufferStartChar = globalOffset;
        }
        buffer += (buffer.length > 0 ? "\n\n" : "") + para;
      }
      globalOffset += para.length;
    }
  }

  // Flush remaining buffer
  if (buffer.trim().length > 0) {
    chunks.push({
      content: buffer.trim(),
      chunkIndex: chunkIndex++,
      metadata: {
        page: bufferPage,
        startChar: bufferStartChar,
        endChar: bufferStartChar + buffer.length,
      },
    });
  }

  return chunks;
}

function chunkPlainText(text: string): ChunkResult[] {
  const chunks: ChunkResult[] = [];
  const paragraphs = splitParagraphs(text);
  let chunkIndex = 0;
  let buffer = "";
  let bufferStartChar = 0;
  let globalOffset = 0;

  for (const para of paragraphs) {
    if (buffer.length + para.length > TARGET_CHARS && buffer.length > 0) {
      chunks.push({
        content: buffer.trim(),
        chunkIndex: chunkIndex++,
        metadata: {
          startChar: bufferStartChar,
          endChar: bufferStartChar + buffer.length,
        },
      });

      const overlapText = getOverlapText(buffer, OVERLAP_CHARS);
      buffer = overlapText + para;
      bufferStartChar = globalOffset - overlapText.length;
    } else {
      if (buffer.length === 0) {
        bufferStartChar = globalOffset;
      }
      buffer += (buffer.length > 0 ? "\n\n" : "") + para;
    }
    globalOffset += para.length;
  }

  if (buffer.trim().length > 0) {
    chunks.push({
      content: buffer.trim(),
      chunkIndex: chunkIndex++,
      metadata: {
        startChar: bufferStartChar,
        endChar: bufferStartChar + buffer.length,
      },
    });
  }

  // Handle case where a single paragraph is very long — split by sentences
  return chunks.flatMap((chunk) => {
    if (chunk.content.length > TARGET_CHARS * 2) {
      return splitBySentences(chunk);
    }
    return [chunk];
  });
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

function splitBySentences(chunk: ChunkResult): ChunkResult[] {
  const sentences = chunk.content.match(/[^.!?]+[.!?]+\s*/g) || [
    chunk.content,
  ];
  const results: ChunkResult[] = [];
  let buffer = "";
  let subIndex = 0;

  for (const sentence of sentences) {
    if (buffer.length + sentence.length > TARGET_CHARS && buffer.length > 0) {
      results.push({
        content: buffer.trim(),
        chunkIndex: chunk.chunkIndex * 100 + subIndex++,
        metadata: chunk.metadata,
      });
      const overlapText = getOverlapText(buffer, OVERLAP_CHARS);
      buffer = overlapText + sentence;
    } else {
      buffer += sentence;
    }
  }

  if (buffer.trim().length > 0) {
    results.push({
      content: buffer.trim(),
      chunkIndex: chunk.chunkIndex * 100 + subIndex,
      metadata: chunk.metadata,
    });
  }

  return results;
}

function getOverlapText(text: string, chars: number): string {
  if (text.length <= chars) return text;
  // Try to break at a sentence boundary within the overlap window
  const tail = text.slice(-chars);
  const sentenceBreak = tail.search(/[.!?]\s+/);
  if (sentenceBreak !== -1) {
    return tail.slice(sentenceBreak + 1).trimStart();
  }
  return tail;
}
