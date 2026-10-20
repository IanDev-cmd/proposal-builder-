"""Pool bounds and SQL script splitting. Does not open a database."""

from __future__ import annotations

import os
import sys
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
sys.path.insert(0, str(ROOT))

import workspace_pg  # noqa: E402
from workspace_pg import POOL_MAX_SIZE, POOL_MIN_SIZE, split_sql_script  # noqa: E402


def main() -> None:
    assert POOL_MIN_SIZE == 2
    assert POOL_MAX_SIZE == 10

    script = "DO $$ BEGIN PERFORM 1; END $$;\nSELECT 1;"
    parts = split_sql_script(script)
    assert len(parts) == 2, parts
    assert "PERFORM 1;" in parts[0]
    assert parts[1] == "SELECT 1"

    captured: dict = {}

    class FakePool:
        def __init__(self, **kwargs):
            captured.update(kwargs)

    workspace_pg._pool = None
    with patch.object(workspace_pg, "database_url", return_value="postgresql://example/nexus"):
        with patch.dict("sys.modules", {"psycopg_pool": type(sys)("psycopg_pool")}):
            sys.modules["psycopg_pool"].ConnectionPool = FakePool  # type: ignore[attr-defined]
            pool = workspace_pg._get_pool()
    assert pool is not None
    assert captured["min_size"] == 2
    assert captured["max_size"] == 10
    assert captured["kwargs"] == {"autocommit": False}
    assert captured["max_size"] <= 10
    workspace_pg._pool = None
    print("workspace pool tests passed")


if __name__ == "__main__":
    main()
