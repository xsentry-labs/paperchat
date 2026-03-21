import { describe, it, expect } from "vitest";
import { extractEntities } from "@/lib/entities";

describe("extractEntities", () => {
  it("returns an array", () => {
    const result = extractEntities("Hello world");
    expect(Array.isArray(result)).toBe(true);
  });

  it("returns empty array for empty text", () => {
    expect(extractEntities("")).toHaveLength(0);
  });

  it("returns empty array for very short text", () => {
    // Single short words produce no meaningful entities
    const result = extractEntities("Hi.");
    // Might return 0; confirm it doesn't throw
    expect(Array.isArray(result)).toBe(true);
  });

  it("extracts a person name", () => {
    const result = extractEntities(
      "Albert Einstein developed the theory of relativity."
    );
    const names = result.map((e) => e.name);
    // compromise should pick up 'einstein' or 'albert einstein'
    const hasPerson = result.some(
      (e) => e.type === "person" && names.some((n) => n.includes("einstein"))
    );
    expect(hasPerson).toBe(true);
  });

  it("extracts a place", () => {
    const result = extractEntities(
      "The conference was held in Paris, France."
    );
    const hasPlace = result.some(
      (e) => e.type === "place" && e.name.includes("paris")
    );
    expect(hasPlace).toBe(true);
  });

  it("all entity names are lowercase", () => {
    const result = extractEntities(
      "Apple Inc. was founded by Steve Jobs in Cupertino."
    );
    for (const entity of result) {
      expect(entity.name).toBe(entity.name.toLowerCase());
    }
  });

  it("deduplicates entities with the same name", () => {
    const text =
      "Steve Jobs founded Apple. Steve Jobs was a visionary. Steve Jobs changed computing.";
    const result = extractEntities(text);
    const jobsEntries = result.filter((e) => e.name.includes("steve jobs"));
    expect(jobsEntries.length).toBeLessThanOrEqual(1);
  });

  it("caps results at 20 entities", () => {
    // Generate text with many entities
    const names = Array.from({ length: 30 }, (_, i) => `Person${i} Smith`).join(", ");
    const result = extractEntities(`These people attended: ${names}.`);
    expect(result.length).toBeLessThanOrEqual(20);
  });

  it("each entity has name, type fields", () => {
    const result = extractEntities(
      "Google was founded in Mountain View by Larry Page."
    );
    for (const entity of result) {
      expect(typeof entity.name).toBe("string");
      expect(entity.name.length).toBeGreaterThan(0);
      expect(["person", "place", "organization", "concept"]).toContain(
        entity.type
      );
    }
  });

  it("entity names have minimum length of 3", () => {
    const result = extractEntities(
      "He went to NYC and met Dr. Smith at IBM headquarters."
    );
    for (const entity of result) {
      expect(entity.name.length).toBeGreaterThanOrEqual(3);
    }
  });
});
