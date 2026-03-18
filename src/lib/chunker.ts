export interface ChunkResult {
  content: string;
  chunkIndex: number;
  metadata: {
    page?: number;
    pageEnd?: number;
    startChar: number;
    endChar: number;
  };
}

// ~400 tokens target, ~100 token overlap. Conservative sizing for better retrieval precision.
const TARGET_TOKENS = 400;
const OVERLAP_TOKENS = 100;
const MIN_CHUNK_TOKENS = 50;

// Rough tokenizer: ~3.5 chars per token for English text (tighter than the naive 4)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

function tokensToChars(tokens: number): number {
  return Math.floor(tokens * 3.5);
}

/**
 * Recursive text splitter with hierarchy-aware separators.
 * Splits at the highest-level separator that produces chunks under the target size.
 * Never breaks mid-sentence.
 */

// Ordered from coarsest to finest split boundary
const SEPARATORS = [
  /\n#{1,3}\s/,        // Markdown headers
  /\n\s*\n\s*\n/,      // Triple newline (section break)
  /\n\s*\n/,           // Double newline (paragraph break)
  /\n/,                // Single newline
  /(?<=[.!?])\s+/,     // Sentence boundary (split after punctuation + space)
  /(?<=[;:])\s+/,      // Clause boundary
  /(?<=[,])\s+/,       // Comma boundary (last resort)
];

export function chunkText(
  text: string,
  pages?: { text: string; page: number }[]
): ChunkResult[] {
  if (pages && pages.length > 0) {
    return chunkWithPages(pages);
  }
  return chunkPlainText(text);
}

function chunkWithPages(pages: { text: string; page: number }[]): ChunkResult[] {
  const results: ChunkResult[] = [];
  let chunkIndex = 0;
  let carryOver = "";
  let carryPage = pages[0]?.page ?? 1;
  let globalOffset = 0;

  for (const page of pages) {
    // Clean up the page text
    const cleaned = cleanText(page.text);
    if (!cleaned) { globalOffset += page.text.length; continue; }

    // Combine carry-over from previous page with this page
    const combined = carryOver ? carryOver + "\n\n" + cleaned : cleaned;
    carryOver = "";

    // Split this combined text into sentence-aware segments
    const segments = recursiveSplit(combined, TARGET_TOKENS);

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i].trim();
      if (!segment) continue;

      const isLast = i === segments.length - 1;
      const tokens = estimateTokens(segment);

      // If the last segment is small, carry it to next page for context continuity
      if (isLast && tokens < MIN_CHUNK_TOKENS && pages.indexOf(page) < pages.length - 1) {
        carryOver = segment;
        carryPage = page.page;
        continue;
      }

      results.push({
        content: segment,
        chunkIndex: chunkIndex++,
        metadata: {
          page: carryPage || page.page,
          pageEnd: page.page !== (carryPage || page.page) ? page.page : undefined,
          startChar: globalOffset,
          endChar: globalOffset + segment.length,
        },
      });
      carryPage = page.page;
    }

    globalOffset += page.text.length;
  }

  // Flush remaining carry-over
  if (carryOver.trim()) {
    results.push({
      content: carryOver.trim(),
      chunkIndex: chunkIndex++,
      metadata: {
        page: carryPage,
        startChar: globalOffset - carryOver.length,
        endChar: globalOffset,
      },
    });
  }

  // Add overlaps between consecutive chunks
  return addOverlaps(results);
}

function chunkPlainText(text: string): ChunkResult[] {
  const cleaned = cleanText(text);
  if (!cleaned) return [];

  const segments = recursiveSplit(cleaned, TARGET_TOKENS);
  let chunkIndex = 0;
  let offset = 0;
  const results: ChunkResult[] = [];

  for (const segment of segments) {
    const trimmed = segment.trim();
    if (!trimmed || estimateTokens(trimmed) < MIN_CHUNK_TOKENS / 2) continue;

    results.push({
      content: trimmed,
      chunkIndex: chunkIndex++,
      metadata: {
        startChar: offset,
        endChar: offset + trimmed.length,
      },
    });
    offset += segment.length;
  }

  return addOverlaps(results);
}

/**
 * Recursively split text using increasingly fine separators
 * until all pieces are under the target token size.
 */
function recursiveSplit(text: string, targetTokens: number, depth: number = 0): string[] {
  if (estimateTokens(text) <= targetTokens) {
    return [text];
  }

  if (depth >= SEPARATORS.length) {
    // Last resort: hard split at character boundary, but try to find a word boundary
    return hardSplit(text, targetTokens);
  }

  const separator = SEPARATORS[depth];
  const parts = splitKeepSeparator(text, separator);

  // If this separator didn't produce useful splits, try the next one
  if (parts.length <= 1) {
    return recursiveSplit(text, targetTokens, depth + 1);
  }

  // Merge small consecutive parts, then recursively split any that are still too large
  const merged = mergeParts(parts, targetTokens);
  const results: string[] = [];

  for (const part of merged) {
    if (estimateTokens(part) > targetTokens) {
      results.push(...recursiveSplit(part, targetTokens, depth + 1));
    } else {
      results.push(part);
    }
  }

  return results;
}

/**
 * Split text by regex but keep the separator attached to the preceding segment.
 */
function splitKeepSeparator(text: string, separator: RegExp): string[] {
  const parts: string[] = [];
  let lastIndex = 0;

  // Use a global version of the regex
  const globalRegex = new RegExp(separator.source, "g");
  let match: RegExpExecArray | null;

  while ((match = globalRegex.exec(text)) !== null) {
    const end = match.index + match[0].length;
    if (end > lastIndex) {
      parts.push(text.slice(lastIndex, end));
    }
    lastIndex = end;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.filter((p) => p.trim().length > 0);
}

/**
 * Merge consecutive small parts until they approach the target size.
 */
function mergeParts(parts: string[], targetTokens: number): string[] {
  const merged: string[] = [];
  let buffer = "";

  for (const part of parts) {
    const combined = buffer ? buffer + part : part;
    if (estimateTokens(combined) > targetTokens && buffer) {
      merged.push(buffer);
      buffer = part;
    } else {
      buffer = combined;
    }
  }

  if (buffer) merged.push(buffer);
  return merged;
}

/**
 * Hard split at word boundaries when no sentence/paragraph separator works.
 */
function hardSplit(text: string, targetTokens: number): string[] {
  const targetChars = tokensToChars(targetTokens);
  const results: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (estimateTokens(remaining) <= targetTokens) {
      results.push(remaining);
      break;
    }

    // Find a word boundary near the target
    let splitAt = targetChars;
    if (splitAt >= remaining.length) {
      results.push(remaining);
      break;
    }

    // Search backward for a space
    const searchStart = Math.max(0, splitAt - 100);
    const lastSpace = remaining.lastIndexOf(" ", splitAt);
    if (lastSpace > searchStart) {
      splitAt = lastSpace + 1;
    }

    results.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }

  return results;
}

/**
 * Add sentence-level overlaps between consecutive chunks.
 * Prepends the last N tokens (at a sentence boundary) of chunk[i] to chunk[i+1].
 */
function addOverlaps(chunks: ChunkResult[]): ChunkResult[] {
  if (chunks.length <= 1) return chunks;

  const overlapChars = tokensToChars(OVERLAP_TOKENS);

  return chunks.map((chunk, i) => {
    if (i === 0) return chunk;

    const prevContent = chunks[i - 1].content;
    const overlap = extractOverlapFromEnd(prevContent, overlapChars);

    if (overlap && !chunk.content.startsWith(overlap.slice(0, 50))) {
      return {
        ...chunk,
        content: overlap + "\n\n" + chunk.content,
      };
    }
    return chunk;
  });
}

/**
 * Extract overlap text from the end of a string, breaking at a sentence boundary.
 */
function extractOverlapFromEnd(text: string, maxChars: number): string {
  if (text.length <= maxChars) return "";

  const tail = text.slice(-maxChars);

  // Find the first sentence boundary in the tail
  const sentenceStart = tail.search(/(?<=[.!?])\s+/);
  if (sentenceStart !== -1 && sentenceStart < tail.length * 0.7) {
    return tail.slice(sentenceStart).trim();
  }

  // Fall back to paragraph boundary
  const paraStart = tail.indexOf("\n");
  if (paraStart !== -1 && paraStart < tail.length * 0.5) {
    return tail.slice(paraStart).trim();
  }

  return "";
}

/**
 * Clean text: normalize whitespace, remove artifacts, fix encoding issues.
 */
function cleanText(text: string): string {
  return text
    // Normalize various dash/hyphen characters
    .replace(/[\u2013\u2014]/g, "—")
    // Normalize quotes
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    // Remove soft hyphens and zero-width chars
    .replace(/[\u00AD\u200B\u200C\u200D\uFEFF]/g, "")
    // Fix broken words from PDF extraction (hyphen at line break)
    .replace(/(\w)-\n(\w)/g, "$1$2")
    // Collapse multiple spaces (but preserve newlines)
    .replace(/[^\S\n]+/g, " ")
    // Collapse excessive newlines (3+ → 2)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
