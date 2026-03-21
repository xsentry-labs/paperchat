import os
import pytest

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "test")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test")
os.environ.setdefault("OPENAI_API_KEY", "test")
os.environ.setdefault("OPENROUTER_API_KEY", "test")
os.environ.setdefault("ENCRYPTION_SECRET", "test-secret-32-chars-minimum-ok!")

from ingestion.chunker import chunk_text, TARGET_CHARS, MIN_CHARS


def test_short_text_single_chunk():
    text = "This is a short document."
    chunks = chunk_text(text)
    assert len(chunks) == 1
    assert chunks[0].content == text
    assert chunks[0].chunk_index == 0


def test_long_text_multiple_chunks():
    # ~5000 chars — should produce multiple chunks
    text = ("The quick brown fox jumps over the lazy dog. " * 120)
    chunks = chunk_text(text)
    assert len(chunks) > 1


def test_chunk_indices_sequential():
    text = "A" * 5000
    chunks = chunk_text(text)
    for i, chunk in enumerate(chunks):
        assert chunk.chunk_index == i


def test_no_empty_chunks():
    text = "\n\n\n\n" + ("Word " * 500) + "\n\n\n\n"
    chunks = chunk_text(text)
    for chunk in chunks:
        assert len(chunk.content.strip()) >= MIN_CHARS


def test_chunk_size_within_bounds():
    text = "Sentence. " * 300  # ~3000 chars
    chunks = chunk_text(text)
    for chunk in chunks:
        # Allow some slack for overlap
        assert len(chunk.content) <= TARGET_CHARS * 2


def test_metadata_has_char_offsets():
    text = "Hello world. " * 200
    chunks = chunk_text(text)
    for chunk in chunks:
        assert "startChar" in chunk.metadata
        assert "endChar" in chunk.metadata
        assert chunk.metadata["endChar"] > chunk.metadata["startChar"]


def test_empty_text():
    chunks = chunk_text("")
    assert chunks == []
