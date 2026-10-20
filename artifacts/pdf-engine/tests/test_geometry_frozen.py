"""Frozen geometry sources must stay byte-for-byte identical.

This check does not import, render, or patch the PDF engines. Pixel output
cannot change while these sources stay on the recorded hashes.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

FROZEN = (
    "measure.py",
    "config.py",
    "fonts.py",
    "vessel.py",
    "cover_contact.py",
    "bespoke.py",
    "inserts.py",
)


def _sha256(name: str) -> str:
    return hashlib.sha256((ROOT / name).read_bytes()).hexdigest()


def test_frozen_geometry_sources_match_recorded_hashes():
    recorded = (Path(__file__).parent / "geometry_baselines.sha256").read_text(encoding="utf-8")
    expected = {}
    for line in recorded.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        digest, name = line.split(None, 1)
        expected[name.strip()] = digest
    assert set(expected) == set(FROZEN)
    for name in FROZEN:
        assert _sha256(name) == expected[name], name
