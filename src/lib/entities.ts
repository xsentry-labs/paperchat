/**
 * Entity extraction using compromise.js - a lightweight, pure-JS NLP library.
 *
 * Why compromise?
 *   - Zero API calls, runs fully server-side in Node.js
 *   - Handles People, Places, Organizations out of the box
 *   - ~300KB, no native bindings needed
 *   - "Good enough" extraction - we don't need perfect NLP
 *
 * What we extract per chunk:
 *   - People (proper names identified as persons)
 *   - Places (geographic names)
 *   - Organizations (companies, institutions)
 *   - Concepts (significant nouns, as fallback signal)
 *
 * All entity names are lowercased and deduplicated before return.
 * We cap at MAX_ENTITIES per chunk to avoid noise.
 */

// compromise ships CJS + ESM; dynamic import handles edge cases in Next.js
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nlp = require("compromise");

export type EntityType = "person" | "place" | "organization" | "concept";

export interface ExtractedEntity {
  name: string;
  type: EntityType;
}

const MAX_ENTITIES = 20;
const MIN_NAME_LENGTH = 3;

/**
 * Extract named entities from a text chunk.
 * Returns deduplicated, normalized entities capped at MAX_ENTITIES.
 */
export function extractEntities(text: string): ExtractedEntity[] {
  const doc = nlp(text);
  const seen = new Set<string>();
  const entities: ExtractedEntity[] = [];

  function add(name: string, type: EntityType) {
    // Strip leading/trailing punctuation that compromise attaches from mid-sentence extraction
    const normalized = name.toLowerCase().trim().replace(/^[^\w]+|[^\w]+$/g, "").trim();
    if (normalized.length < MIN_NAME_LENGTH) return;
    if (seen.has(normalized)) return;
    // Skip if it looks like a math symbol, formula fragment, or number
    if (/^[\d\s.,()\[\]{}+\-*/=<>^_]+$/.test(normalized)) return;
    seen.add(normalized);
    entities.push({ name: normalized, type });
  }

  // Extract in priority order: specific types first, then fall back to nouns
  (doc.people().out("array") as string[]).forEach((n) => add(n, "person"));
  (doc.places().out("array") as string[]).forEach((n) => add(n, "place"));
  (doc.organizations().out("array") as string[]).forEach((n) =>
    add(n, "organization")
  );

  // Key nouns as "concepts" - useful for technical documents
  // Only add if not already captured above, and only single-word nouns to reduce noise
  if (entities.length < MAX_ENTITIES) {
    (doc.nouns().out("array") as string[]).forEach((n) => {
      if (!n.includes(" ")) add(n, "concept"); // single-word concepts only
    });
  }

  return entities.slice(0, MAX_ENTITIES);
}
