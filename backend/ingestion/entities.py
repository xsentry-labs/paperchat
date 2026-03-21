"""spaCy-based NER entity extraction."""
from __future__ import annotations
from dataclasses import dataclass
import spacy

_nlp = None
MAX_ENTITIES_PER_CHUNK = 20
MIN_ENTITY_LEN = 3

LABEL_MAP = {
    "PERSON": "person",
    "ORG": "organization",
    "GPE": "place",
    "LOC": "place",
    "FAC": "place",
    "NORP": "organization",
    "PRODUCT": "concept",
    "EVENT": "concept",
    "WORK_OF_ART": "concept",
    "LAW": "concept",
    "LANGUAGE": "concept",
}


@dataclass
class ExtractedEntity:
    name: str
    type: str  # "person" | "place" | "organization" | "concept"


def load_nlp():
    global _nlp
    if _nlp is None:
        try:
            _nlp = spacy.load("en_core_web_sm")
        except OSError:
            # Model not downloaded yet
            print("[entities] Downloading spaCy model en_core_web_sm...")
            from spacy.cli import download
            download("en_core_web_sm")
            _nlp = spacy.load("en_core_web_sm")
    return _nlp


def extract_entities(text: str) -> list[ExtractedEntity]:
    nlp = load_nlp()

    # Truncate to avoid memory issues on large chunks
    doc = nlp(text[:10000])

    seen: set[str] = set()
    entities: list[ExtractedEntity] = []

    for ent in doc.ents:
        name = ent.text.strip()
        normalized = name.lower()

        if len(name) < MIN_ENTITY_LEN:
            continue
        if normalized in seen:
            continue

        entity_type = LABEL_MAP.get(ent.label_)
        if not entity_type:
            continue

        seen.add(normalized)
        entities.append(ExtractedEntity(name=normalized, type=entity_type))

        if len(entities) >= MAX_ENTITIES_PER_CHUNK:
            break

    return entities
