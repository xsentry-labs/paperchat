"""
AES-256-GCM encryption compatible with the Node.js implementation.

Format: "{iv_hex}:{tag_hex}:{ciphertext_hex}"
Key derivation: SHA256(userId + ":" + ENCRYPTION_SECRET)
"""
import hashlib
import os
import re
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from .config import settings

_ENCRYPTED_PATTERN = re.compile(r"^[0-9a-f]{32}:[0-9a-f]{32}:[0-9a-f]+$")


def derive_user_key(user_id: str) -> bytes:
    """Derive a 32-byte key from user_id + ENCRYPTION_SECRET (same as Node.js impl)."""
    material = f"{user_id}:{settings.encryption_secret}"
    return hashlib.sha256(material.encode()).digest()


def encrypt(plaintext: str, key: bytes) -> str:
    """Encrypt plaintext and return '{iv_hex}:{tag_hex}:{ciphertext_hex}'."""
    iv = os.urandom(16)
    aesgcm = AESGCM(key)
    # AESGCM.encrypt returns ciphertext + 16-byte tag appended
    ciphertext_with_tag = aesgcm.encrypt(iv, plaintext.encode(), None)
    # Split: last 16 bytes are the auth tag
    ciphertext = ciphertext_with_tag[:-16]
    tag = ciphertext_with_tag[-16:]
    return f"{iv.hex()}:{tag.hex()}:{ciphertext.hex()}"


def decrypt(encrypted: str, key: bytes) -> str:
    """Decrypt '{iv_hex}:{tag_hex}:{ciphertext_hex}'. Returns plaintext as-is if not encrypted."""
    if not is_encrypted(encrypted):
        return encrypted

    parts = encrypted.split(":")
    iv = bytes.fromhex(parts[0])
    tag = bytes.fromhex(parts[1])
    ciphertext = bytes.fromhex(parts[2])

    aesgcm = AESGCM(key)
    # AESGCM.decrypt expects ciphertext + tag concatenated
    plaintext = aesgcm.decrypt(iv, ciphertext + tag, None)
    return plaintext.decode()


def is_encrypted(text: str) -> bool:
    return bool(_ENCRYPTED_PATTERN.match(text))
