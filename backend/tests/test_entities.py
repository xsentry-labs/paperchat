import os
import pytest

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "test")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test")
os.environ.setdefault("OPENAI_API_KEY", "test")
os.environ.setdefault("OPENROUTER_API_KEY", "test")
os.environ.setdefault("ENCRYPTION_SECRET", "test-secret-32-chars-minimum-ok!")


def test_entity_extraction_people():
    from ingestion.entities import extract_entities
    text = "Elon Musk founded SpaceX in 2002. Jeff Bezos started Amazon."
    entities = extract_entities(text)
    names = [e.name for e in entities]
    assert any("elon musk" in n or "elon" in n for n in names)


def test_entity_types():
    from ingestion.entities import extract_entities
    text = "Apple Inc. is headquartered in Cupertino, California."
    entities = extract_entities(text)
    types = {e.type for e in entities}
    assert types.issubset({"person", "place", "organization", "concept"})


def test_deduplication():
    from ingestion.entities import extract_entities
    text = "Microsoft Microsoft Microsoft is a company. Microsoft builds software."
    entities = extract_entities(text)
    names = [e.name for e in entities]
    assert len(names) == len(set(names))


def test_min_length_filter():
    from ingestion.entities import extract_entities, MIN_ENTITY_LEN
    entities = extract_entities("Go to NY and meet Al.")
    for e in entities:
        assert len(e.name) >= MIN_ENTITY_LEN


def test_max_entities():
    from ingestion.entities import extract_entities, MAX_ENTITIES_PER_CHUNK
    # Generate text with many entities
    text = ". ".join([f"Person{i} Smith works at Company{i} in City{i}" for i in range(50)])
    entities = extract_entities(text)
    assert len(entities) <= MAX_ENTITIES_PER_CHUNK


def test_empty_text():
    from ingestion.entities import extract_entities
    entities = extract_entities("")
    assert entities == []
