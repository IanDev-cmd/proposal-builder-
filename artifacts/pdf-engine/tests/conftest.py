"""Shared env for engine tests. Does not import or patch PDF geometry modules."""

from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
sys.path.insert(0, str(ROOT))
os.environ.setdefault("NEXUS_AUTH_TEST", "1")
os.environ.setdefault("NEXUS_AUTH_SECRET", "test-signing-secret-please-ignore")
os.environ.setdefault("NEXUS_TEAM_PASSWORD", "945762")
os.environ.setdefault("FLASK_ENV", "development")
