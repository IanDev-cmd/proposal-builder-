"""Keep parsed insert/vessel PDFs open so /generate does not re-parse them."""

from __future__ import annotations

from pathlib import Path

import fitz

_SRC: dict[str, fitz.Document] = {}


def open_source_pdf(path: str) -> fitz.Document:
    key = str(Path(path).resolve())
    doc = _SRC.get(key)
    if doc is None:
        doc = fitz.open(key)
        _SRC[key] = doc
    return doc
