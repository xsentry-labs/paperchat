"""
Recursive text chunker — mirrors the Node.js implementation.
Target ~400 tokens, ~100 token overlap, min 50 tokens.
~3.5 chars per token estimate.
"""
from __future__ import annotations
from dataclasses import dataclass
from .parsers import PageInfo

TARGET_TOKENS = 400
OVERLAP_TOKENS = 100
MIN_TOKENS = 50

CHARS_PER_TOKEN = 3.5
TARGET_CHARS = int(TARGET_TOKENS * CHARS_PER_TOKEN)       # ~1400
OVERLAP_CHARS = int(OVERLAP_TOKENS * CHARS_PER_TOKEN)     # ~350
MIN_CHARS = int(MIN_TOKENS * CHARS_PER_TOKEN)              # ~175

SEPARATORS = [
    "\n# ", "\n## ", "\n### ",   # Markdown headers
    "\n\n\n",                     # Triple newline (section break)
    "\n\n",                       # Paragraph
    "\n",                         # Single newline
    ". ", "! ", "? ",             # Sentence boundary
    "; ", ": ",                   # Clause boundary
    ", ",                         # Comma
]


@dataclass
class ChunkResult:
    content: str
    chunk_index: int
    metadata: dict  # {page?, pageEnd?, startChar, endChar}


def chunk_text(text: str, pages: list[PageInfo] | None = None) -> list[ChunkResult]:
    if not text or not text.strip():
        return []

    raw_chunks = _split_recursive(text, SEPARATORS)
    merged = _merge_with_overlap(raw_chunks, text)

    # Build page lookup
    page_map = _build_page_map(pages) if pages else {}

    results: list[ChunkResult] = []
    for i, (start, end) in enumerate(merged):
        content = text[start:end].strip()
        if len(content) < MIN_CHARS:
            continue

        meta: dict = {"startChar": start, "endChar": end}
        if page_map:
            page = _char_to_page(start, page_map)
            page_end = _char_to_page(end, page_map)
            if page:
                meta["page"] = page
            if page_end and page_end != page:
                meta["pageEnd"] = page_end

        results.append(ChunkResult(content=content, chunk_index=i, metadata=meta))

    # Re-index after filtering
    for i, r in enumerate(results):
        r.chunk_index = i

    return results


def _split_recursive(text: str, separators: list[str]) -> list[tuple[int, int]]:
    """Split text into (start, end) spans roughly TARGET_CHARS in size."""
    if len(text) <= TARGET_CHARS:
        return [(0, len(text))]

    # Try separators from coarsest to finest
    for sep in separators:
        parts = text.split(sep)
        if len(parts) > 1:
            spans: list[tuple[int, int]] = []
            offset = 0
            for part in parts:
                start = offset
                end = offset + len(part)
                if end - start > TARGET_CHARS:
                    # Recurse on large parts
                    sub = _split_recursive(part, separators[separators.index(sep) + 1:] or [" "])
                    spans.extend((start + s, start + e) for s, e in sub)
                else:
                    spans.append((start, end))
                offset = end + len(sep)
            return spans

    # Hard split at word boundary
    spans = []
    start = 0
    while start < len(text):
        end = min(start + TARGET_CHARS, len(text))
        # Back up to word boundary
        if end < len(text):
            space = text.rfind(" ", start, end)
            if space > start:
                end = space
        spans.append((start, end))
        start = end
    return spans


def _merge_with_overlap(spans: list[tuple[int, int]], text: str) -> list[tuple[int, int]]:
    """Merge small spans together and add overlap between chunks."""
    merged: list[tuple[int, int]] = []
    current_start, current_end = spans[0] if spans else (0, 0)

    for start, end in spans[1:]:
        if (current_end - current_start) + (end - start) <= TARGET_CHARS:
            current_end = end
        else:
            merged.append((current_start, current_end))
            # Overlap: start new chunk OVERLAP_CHARS before end of previous
            overlap_start = max(current_start, current_end - OVERLAP_CHARS)
            current_start = overlap_start
            current_end = end

    merged.append((current_start, current_end))
    return merged


def _build_page_map(pages: list[PageInfo]) -> dict[int, int]:
    """Map char offset -> page number."""
    page_map: dict[int, int] = {}
    offset = 0
    for p in pages:
        page_map[offset] = p.page
        offset += len(p.text) + 2  # +2 for \n\n separator
    return page_map


def _char_to_page(char_offset: int, page_map: dict[int, int]) -> int | None:
    """Find which page a character offset belongs to."""
    page = None
    for start, pg in sorted(page_map.items()):
        if start <= char_offset:
            page = pg
        else:
            break
    return page
